import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { authTokens } from "../db/schema.js";
import { config } from "../config.js";

const router = Router();

// ── Helpers (exported for use in other routers) ─────────────────────────────

/**
 * Get the current Meta access token string.
 * Throws an object with `status` and `message` if not found.
 */
export async function getMetaToken(
  database: typeof db,
): Promise<string> {
  const rows = await database
    .select()
    .from(authTokens)
    .where(eq(authTokens.provider, "meta"))
    .limit(1);
  const token = rows[0];
  if (!token) {
    throw { status: 401, message: "Meta not authenticated. Please add a token first." };
  }
  return token.accessToken;
}

/**
 * Get the full Meta auth record (token + page_id + ad_account_id).
 */
export async function getMetaAuth(
  database: typeof db,
) {
  const rows = await database
    .select()
    .from(authTokens)
    .where(eq(authTokens.provider, "meta"))
    .limit(1);
  const token = rows[0];
  if (!token) {
    throw { status: 401, message: "Meta not authenticated. Please add a token first." };
  }
  return token;
}

// ── POST /meta/token ────────────────────────────────────────────────────────

router.post("/meta/token", async (req: Request, res: Response) => {
  try {
    const { access_token, ad_account_id, page_id } = req.body;
    if (!access_token) {
      return res.status(400).json({ detail: "access_token is required" });
    }

    // Validate token against Meta Graph API
    let userInfo: Record<string, unknown>;
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(access_token)}`,
      );
      userInfo = (await resp.json()) as Record<string, unknown>;
      if ((userInfo as any).error) {
        return res.status(400).json({ detail: `Invalid token: ${(userInfo as any).error.message}` });
      }
    } catch (e: any) {
      return res.status(400).json({ detail: `Invalid token: ${e.message}` });
    }

    // Fetch ad accounts
    let accounts: unknown[] = [];
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&access_token=${encodeURIComponent(access_token)}`,
      );
      const data = (await resp.json()) as any;
      accounts = data.data ?? [];
    } catch { /* ignore */ }

    // Fetch pages
    let pages: unknown[] = [];
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(access_token)}`,
      );
      const data = (await resp.json()) as any;
      pages = data.data ?? [];
    } catch { /* ignore */ }

    // Remove existing Meta tokens and insert new one
    await db.delete(authTokens).where(eq(authTokens.provider, "meta"));
    await db.insert(authTokens).values({
      provider: "meta",
      tokenType: "long_lived",
      accessToken: access_token,
      adAccountId: ad_account_id ?? null,
      pageId: page_id ?? null,
    });

    return res.json({
      status: "connected",
      user: userInfo,
      ad_accounts: accounts,
      pages,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /meta/pages ─────────────────────────────────────────────────────────

router.get("/meta/pages", async (_req: Request, res: Response) => {
  try {
    const token = await getMetaToken(db);
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await resp.json()) as any;
    return res.json({ pages: data.data ?? [] });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /meta/config ────────────────────────────────────────────────────────

router.put("/meta/config", async (req: Request, res: Response) => {
  try {
    const { ad_account_id, page_id } = req.body;

    const rows = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.provider, "meta"))
      .limit(1);
    const token = rows[0];
    if (!token) {
      return res.status(401).json({ detail: "Meta not authenticated" });
    }

    const updates: Record<string, unknown> = {};
    if (ad_account_id !== undefined) updates.adAccountId = ad_account_id;
    if (page_id !== undefined) updates.pageId = page_id;

    if (Object.keys(updates).length > 0) {
      await db
        .update(authTokens)
        .set(updates)
        .where(eq(authTokens.id, token.id));
    }

    return res.json({
      status: "updated",
      ad_account_id: ad_account_id ?? token.adAccountId,
      page_id: page_id ?? token.pageId,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /meta/oauth/url ─────────────────────────────────────────────────────

router.get("/meta/oauth/url", async (_req: Request, res: Response) => {
  try {
    if (!config.META_APP_ID) {
      return res.status(400).json({ detail: "META_APP_ID not configured" });
    }

    const scopes = "ads_management,ads_read,business_management,pages_read_engagement";
    const redirectUri = `${config.BASE_URL}/api/auth/meta/oauth/callback`;
    const url =
      `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${config.META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}` +
      `&response_type=code`;

    return res.json({ url });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /meta/oauth/callback ────────────────────────────────────────────────

router.get("/meta/oauth/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).json({ detail: "Missing code parameter" });
    }

    const redirectUri = `${config.BASE_URL}/api/auth/meta/oauth/callback`;

    // Exchange code for short-lived token
    const shortResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `client_id=${config.META_APP_ID}` +
        `&client_secret=${config.META_APP_SECRET}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code=${encodeURIComponent(code)}`,
    );
    const shortData = (await shortResp.json()) as any;
    if (shortData.error) {
      return res.status(400).json({ detail: shortData.error.message ?? "OAuth failed" });
    }
    const shortToken = shortData.access_token;

    // Exchange for long-lived token
    const longResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${config.META_APP_ID}` +
        `&client_secret=${config.META_APP_SECRET}` +
        `&fb_exchange_token=${encodeURIComponent(shortToken)}`,
    );
    const longData = (await longResp.json()) as any;
    if (longData.error) {
      return res.status(400).json({ detail: longData.error.message ?? "Token exchange failed" });
    }
    const longToken = longData.access_token;

    // Store token
    await db.delete(authTokens).where(eq(authTokens.provider, "meta"));
    await db.insert(authTokens).values({
      provider: "meta",
      tokenType: "oauth",
      accessToken: longToken,
    });

    // Redirect to frontend
    const frontendUrl = config.CORS_ORIGINS.split(",")[0];
    return res.redirect(`${frontendUrl}/auth?meta=success`);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /google/service-account ────────────────────────────────────────────

router.post("/google/service-account", async (req: Request, res: Response) => {
  try {
    const { credentials_json } = req.body;
    if (!credentials_json) {
      return res.status(400).json({ detail: "credentials_json is required" });
    }

    // Validate JSON
    try {
      JSON.parse(credentials_json);
    } catch {
      return res.status(400).json({ detail: "Invalid JSON" });
    }

    await db.delete(authTokens).where(eq(authTokens.provider, "google"));
    await db.insert(authTokens).values({
      provider: "google",
      tokenType: "service_account",
      accessToken: credentials_json,
    });

    return res.json({ status: "connected" });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /status ─────────────────────────────────────────────────────────────

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(authTokens);

    const metaToken = rows.find((t) => t.provider === "meta");
    const googleToken = rows.find((t) => t.provider === "google");

    return res.json({
      meta_connected: !!metaToken,
      meta_ad_account_id: metaToken?.adAccountId ?? null,
      meta_page_id: metaToken?.pageId ?? null,
      meta_business_id: metaToken?.businessId ?? null,
      meta_business_name: metaToken?.businessName ?? null,
      google_connected: !!googleToken,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
