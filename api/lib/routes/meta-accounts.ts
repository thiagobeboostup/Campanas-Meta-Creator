import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { authTokens, projects, adSets, ads } from "../db/schema.js";
import { getMetaToken, getMetaAuth } from "./auth.js";

const router = Router();

// ── GET /businesses ───────────────────────────────────────────────────────

router.get("/businesses", async (_req: Request, res: Response) => {
  try {
    const token = await getMetaToken(db);

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await resp.json()) as any;
    if (data.error) {
      return res.status(400).json({ detail: data.error.message ?? "Failed to fetch businesses" });
    }

    return res.json({ businesses: data.data ?? [] });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /businesses/:id/ad-accounts ───────────────────────────────────────

router.get("/businesses/:id/ad-accounts", async (req: Request, res: Response) => {
  try {
    const businessId = req.params.id;
    const token = await getMetaToken(db);

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${businessId}/owned_ad_accounts?fields=id,name,account_status,currency&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await resp.json()) as any;
    if (data.error) {
      return res.status(400).json({ detail: data.error.message ?? "Failed to fetch ad accounts" });
    }

    return res.json({ ad_accounts: data.data ?? [] });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /pages ────────────────────────────────────────────────────────────

router.get("/pages", async (_req: Request, res: Response) => {
  try {
    const token = await getMetaToken(db);

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await resp.json()) as any;
    if (data.error) {
      return res.status(400).json({ detail: data.error.message ?? "Failed to fetch pages" });
    }

    return res.json({ pages: data.data ?? [] });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /select-account ─────────────────────────────────────────────────

router.post("/select-account", async (req: Request, res: Response) => {
  try {
    const { business_id, business_name, ad_account_id, page_id } = req.body;

    if (!business_id || !ad_account_id) {
      return res.status(400).json({ detail: "business_id and ad_account_id are required" });
    }

    const rows = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.provider, "meta"))
      .limit(1);
    const token = rows[0];
    if (!token) {
      return res.status(401).json({ detail: "Meta not authenticated" });
    }

    const updates: Record<string, unknown> = {
      businessId: business_id,
      businessName: business_name ?? null,
      adAccountId: ad_account_id,
    };
    if (page_id) {
      updates.pageId = page_id;
    }

    await db
      .update(authTokens)
      .set(updates)
      .where(eq(authTokens.id, token.id));

    return res.json({
      status: "selected",
      business_id,
      business_name: business_name ?? null,
      ad_account_id,
      page_id: page_id ?? token.pageId,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /campaigns/:id ────────────────────────────────────────────────────

router.get("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const adAccountId = req.params.id;
    const token = await getMetaToken(db);

    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await resp.json()) as any;
    if (data.error) {
      return res.status(400).json({ detail: data.error.message ?? "Failed to fetch campaigns" });
    }

    return res.json({ campaigns: data.data ?? [] });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /campaign-structure/:id ───────────────────────────────────────────

router.get("/campaign-structure/:id", async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;
    const token = await getMetaToken(db);

    // Fetch campaign
    const campaignResp = await fetch(
      `https://graph.facebook.com/v21.0/${campaignId}?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`,
    );
    const campaign = (await campaignResp.json()) as any;
    if (campaign.error) {
      return res.status(400).json({ detail: campaign.error.message ?? "Failed to fetch campaign" });
    }

    // Fetch ad sets
    const adsetsResp = await fetch(
      `https://graph.facebook.com/v21.0/${campaignId}/adsets?fields=id,name,status,targeting,optimization_goal,bid_strategy,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`,
    );
    const adsetsData = (await adsetsResp.json()) as any;

    // Fetch ads for each ad set
    const adSetsList = [];
    for (const adset of adsetsData.data ?? []) {
      const adsResp = await fetch(
        `https://graph.facebook.com/v21.0/${adset.id}/ads?fields=id,name,status,creative&access_token=${encodeURIComponent(token)}`,
      );
      const adsData = (await adsResp.json()) as any;

      adSetsList.push({
        ...adset,
        ads: adsData.data ?? [],
      });
    }

    return res.json({
      campaign,
      ad_sets: adSetsList,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /import-campaign/:id ─────────────────────────────────────────────

router.post("/import-campaign/:id", async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;
    const { ad_account_id } = req.body;

    if (!ad_account_id) {
      return res.status(400).json({ detail: "ad_account_id is required" });
    }

    const auth = await getMetaAuth(db);
    const token = auth.accessToken;

    // Fetch campaign structure from Meta
    const campaignResp = await fetch(
      `https://graph.facebook.com/v21.0/${campaignId}?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`,
    );
    const campaignData = (await campaignResp.json()) as any;
    if (campaignData.error) {
      return res.status(400).json({ detail: campaignData.error.message ?? "Failed to fetch campaign" });
    }

    // Fetch ad sets with ads
    const adsetsResp = await fetch(
      `https://graph.facebook.com/v21.0/${campaignId}/adsets?fields=id,name,status,targeting,optimization_goal,bid_strategy,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`,
    );
    const adsetsData = (await adsetsResp.json()) as any;

    // Create local Project
    const projectResult = await db
      .insert(projects)
      .values({
        name: campaignData.name ?? "Imported Campaign",
        status: "previewed",
        campaignObjective: campaignData.objective ?? null,
        dailyBudget: campaignData.daily_budget
          ? parseFloat(campaignData.daily_budget) / 100
          : null,
        lifetimeBudget: campaignData.lifetime_budget
          ? parseFloat(campaignData.lifetime_budget) / 100
          : null,
        adAccountId: ad_account_id,
        businessId: auth.businessId ?? null,
        mode: "modify",
        metaSourceCampaignId: campaignId,
        metaCampaignId: campaignId,
      })
      .returning();
    const project = projectResult[0];

    let adSetsCount = 0;

    // Create local AdSets and Ads
    for (const adsetData of adsetsData.data ?? []) {
      const targeting = adsetData.targeting ?? {};

      const adsetResult = await db
        .insert(adSets)
        .values({
          projectId: project.id,
          name: adsetData.name ?? "",
          generatedName: adsetData.name ?? "",
          targetingJson: typeof targeting === "object" ? JSON.stringify(targeting) : null,
          optimizationGoal: adsetData.optimization_goal ?? "OFFSITE_CONVERSIONS",
          bidStrategy: adsetData.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
          budget: adsetData.daily_budget
            ? parseFloat(adsetData.daily_budget) / 100
            : null,
          metaAdsetId: adsetData.id ?? null,
          status: (adsetData.status ?? "PAUSED").toLowerCase(),
        })
        .returning();
      const adset = adsetResult[0];
      adSetsCount++;

      // Fetch ads for this ad set
      const adsResp = await fetch(
        `https://graph.facebook.com/v21.0/${adsetData.id}/ads?fields=id,name,status&access_token=${encodeURIComponent(token)}`,
      );
      const adsData = (await adsResp.json()) as any;

      for (const adData of adsData.data ?? []) {
        await db.insert(ads).values({
          adSetId: adset.id,
          name: adData.name ?? "",
          generatedName: adData.name ?? "",
          metaAdId: adData.id ?? null,
          status: (adData.status ?? "PAUSED").toLowerCase(),
        });
      }
    }

    return res.json({
      project_id: project.id,
      name: project.name,
      mode: "modify",
      ad_sets_count: adSetsCount,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
