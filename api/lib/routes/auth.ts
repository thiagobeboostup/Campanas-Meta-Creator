import { Router, Request, Response } from "express";
import { db } from "../db/client.js";
import { config } from "../config.js";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getMetaToken(): Promise<string> {
  const row = await db.queryOne(
    "SELECT access_token FROM auth_tokens WHERE provider = 'meta' LIMIT 1"
  );
  if (!row) {
    throw { status: 401, message: "Meta not authenticated. Please add a token first." };
  }
  return row.access_token;
}

export async function getMetaAuth() {
  const row = await db.queryOne(
    "SELECT * FROM auth_tokens WHERE provider = 'meta' LIMIT 1"
  );
  if (!row) {
    throw { status: 401, message: "Meta not authenticated. Please add a token first." };
  }
  return row;
}

// ── POST /meta/token ─────────────────────────────────────────────────────────

router.post("/meta/token", async (req: Request, res: Response) => {
  try {
    const { access_token, ad_account_id, page_id } = req.body;
    if (!access_token) {
      return res.status(400).json({ detail: "access_token is required" });
    }

    // Validate token
    let userInfo: any;
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(access_token)}&fields=id,name`,
      );
      userInfo = await resp.json();
      if (userInfo.error) {
        return res.status(400).json({ detail: `Invalid token: ${userInfo.error.message}` });
      }
    } catch (e: any) {
      return res.status(400).json({ detail: `Invalid token: ${e.message}` });
    }

    // Fetch ad accounts
    let accounts: any[] = [];
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${encodeURIComponent(access_token)}`,
      );
      const data = await resp.json();
      accounts = data.data ?? [];
    } catch { /* ignore */ }

    // Fetch pages
    let pages: any[] = [];
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name&limit=100&access_token=${encodeURIComponent(access_token)}`,
      );
      const data = await resp.json();
      pages = data.data ?? [];
    } catch { /* ignore */ }

    // Store token
    await db.execute("DELETE FROM auth_tokens WHERE provider = 'meta'");
    await db.execute(
      "INSERT INTO auth_tokens (provider, token_type, access_token, ad_account_id, page_id) VALUES ($1, $2, $3, $4, $5)",
      ["meta", "long_lived", access_token, ad_account_id || null, page_id || null]
    );

    return res.json({ status: "connected", user: userInfo, ad_accounts: accounts, pages });
  } catch (e: any) {
    console.error("POST /meta/token error:", e);
    return res.status(500).json({ detail: e.message || "Internal server error" });
  }
});

// ── GET /meta/pages ──────────────────────────────────────────────────────────

router.get("/meta/pages", async (_req: Request, res: Response) => {
  try {
    const token = await getMetaToken();
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`,
    );
    const data = await resp.json();
    return res.json({ pages: data.data ?? [] });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /meta/config ─────────────────────────────────────────────────────────

router.put("/meta/config", async (req: Request, res: Response) => {
  try {
    const { ad_account_id, page_id } = req.body;
    const token = await db.queryOne("SELECT * FROM auth_tokens WHERE provider = 'meta' LIMIT 1");
    if (!token) return res.status(401).json({ detail: "Meta not authenticated" });

    if (ad_account_id !== undefined) {
      await db.execute("UPDATE auth_tokens SET ad_account_id = $1 WHERE provider = 'meta'", [ad_account_id]);
    }
    if (page_id !== undefined) {
      await db.execute("UPDATE auth_tokens SET page_id = $1 WHERE provider = 'meta'", [page_id]);
    }

    return res.json({ status: "updated", ad_account_id: ad_account_id ?? token.ad_account_id, page_id: page_id ?? token.page_id });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /meta/oauth/url ──────────────────────────────────────────────────────

router.get("/meta/oauth/url", (_req: Request, res: Response) => {
  try {
    if (!config.META_APP_ID) {
      return res.status(400).json({ detail: "META_APP_ID not configured" });
    }
    const scopes = "ads_management,ads_read,business_management,pages_read_engagement";
    const redirectUri = `${config.BASE_URL}/api/auth/meta/oauth/callback`;
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${config.META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code`;
    return res.json({ url });
  } catch (e: any) {
    return res.status(500).json({ detail: e.message });
  }
});

// ── GET /meta/oauth/callback ─────────────────────────────────────────────────

router.get("/meta/oauth/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    if (!code) return res.status(400).json({ detail: "Missing code" });

    const redirectUri = `${config.BASE_URL}/api/auth/meta/oauth/callback`;

    // Exchange for short token
    const shortResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${config.META_APP_ID}&client_secret=${config.META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
    );
    const shortData: any = await shortResp.json();
    if (shortData.error) return res.status(400).json({ detail: shortData.error.message });

    // Exchange for long token
    const longResp = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.META_APP_ID}&client_secret=${config.META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortData.access_token)}`,
    );
    const longData: any = await longResp.json();
    if (longData.error) return res.status(400).json({ detail: longData.error.message });

    await db.execute("DELETE FROM auth_tokens WHERE provider = 'meta'");
    await db.execute(
      "INSERT INTO auth_tokens (provider, token_type, access_token) VALUES ($1, $2, $3)",
      ["meta", "oauth", longData.access_token]
    );

    const frontendUrl = config.CORS_ORIGINS.split(",")[0];
    return res.redirect(`${frontendUrl}/auth?meta=success`);
  } catch (e: any) {
    return res.status(500).json({ detail: e.message });
  }
});

// ── POST /google/service-account ─────────────────────────────────────────────

router.post("/google/service-account", async (req: Request, res: Response) => {
  try {
    const { credentials_json } = req.body;
    if (!credentials_json) return res.status(400).json({ detail: "credentials_json is required" });
    try { JSON.parse(credentials_json); } catch { return res.status(400).json({ detail: "Invalid JSON" }); }

    await db.execute("DELETE FROM auth_tokens WHERE provider = 'google'");
    await db.execute(
      "INSERT INTO auth_tokens (provider, token_type, access_token) VALUES ($1, $2, $3)",
      ["google", "service_account", credentials_json]
    );
    return res.json({ status: "connected" });
  } catch (e: any) {
    return res.status(500).json({ detail: e.message });
  }
});

// ── GET /status ──────────────────────────────────────────────────────────────

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const rows = await db.query("SELECT * FROM auth_tokens");
    const metaToken = rows.find((t: any) => t.provider === "meta");
    const googleToken = rows.find((t: any) => t.provider === "google");

    return res.json({
      meta_connected: !!metaToken,
      meta_ad_account_id: metaToken?.ad_account_id ?? null,
      meta_page_id: metaToken?.page_id ?? null,
      meta_business_id: metaToken?.business_id ?? null,
      meta_business_name: metaToken?.business_name ?? null,
      google_connected: !!googleToken,
    });
  } catch (e: any) {
    console.error("GET /status error:", e);
    return res.status(500).json({ detail: e.message || "Internal server error" });
  }
});

export default router;
