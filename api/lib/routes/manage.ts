import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import fs from "fs";
import path from "path";
import { db } from "../db/client.js";
import { projects, adSets, ads, creatives } from "../db/schema.js";
import { getMetaAuth } from "./auth.js";

const upload = multer({ dest: "/tmp/uploads" });
const router = Router();

// ── PUT /:id/budget ───────────────────────────────────────────────────────

router.put("/:id/budget", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id as string, 10);
    const { daily_budget, lifetime_budget } = req.body;

    const auth = await getMetaAuth(db);

    const { CampaignManager } = await import("../services/campaign-manager.js");
    const { MetaApiService } = await import("../services/meta-api.js");

    const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
    const manager = new CampaignManager(db, meta);

    const result = await manager.updateBudget(projectId, daily_budget, lifetime_budget);
    return res.json(result);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /adset/:id/budget ─────────────────────────────────────────────────

router.put("/adset/:id/budget", async (req: Request, res: Response) => {
  try {
    const adsetId = parseInt(req.params.id as string, 10);
    const { daily_budget } = req.body;

    if (daily_budget == null) {
      return res.status(400).json({ detail: "daily_budget is required" });
    }

    const auth = await getMetaAuth(db);

    const { CampaignManager } = await import("../services/campaign-manager.js");
    const { MetaApiService } = await import("../services/meta-api.js");

    const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
    const manager = new CampaignManager(db, meta);

    const result = await manager.updateAdSetBudget(adsetId, daily_budget);
    return res.json(result);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /:id/adset ──────────────────────────────────────────────────────

router.post("/:id/adset", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id as string, 10);
    const {
      name,
      targeting_json,
      optimization_goal = "OFFSITE_CONVERSIONS",
      bid_strategy = "LOWEST_COST_WITHOUT_CAP",
      budget,
      placements_json,
    } = req.body;

    if (!name) {
      return res.status(400).json({ detail: "name is required" });
    }

    const auth = await getMetaAuth(db);

    const { CampaignManager } = await import("../services/campaign-manager.js");
    const { MetaApiService } = await import("../services/meta-api.js");

    const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
    const manager = new CampaignManager(db, meta);

    const adset = await manager.addAdSet(
      projectId,
      name,
      targeting_json,
      optimization_goal,
      bid_strategy,
      budget ?? null,
      placements_json ?? null,
    );

    return res.json({
      status: "created",
      adset_id: adset.id,
      meta_adset_id: adset.metaAdsetId,
      generated_name: adset.generatedName,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /adset/:id/ad ───────────────────────────────────────────────────

router.post("/adset/:id/ad", async (req: Request, res: Response) => {
  try {
    const adsetId = parseInt(req.params.id as string, 10);
    const {
      name,
      creative_id,
      headline = "",
      primary_text = "",
      description = "",
      cta = "SHOP_NOW",
      url,
    } = req.body;

    if (!name) {
      return res.status(400).json({ detail: "name is required" });
    }
    if (!creative_id) {
      return res.status(400).json({ detail: "creative_id is required" });
    }

    const auth = await getMetaAuth(db);

    const { CampaignManager } = await import("../services/campaign-manager.js");
    const { MetaApiService } = await import("../services/meta-api.js");

    const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
    const manager = new CampaignManager(db, meta);

    const ad = await manager.addAd(
      adsetId,
      name,
      creative_id,
      headline,
      primary_text,
      description,
      cta,
      url ?? null,
    );

    return res.json({
      status: "created",
      ad_id: ad.id,
      meta_ad_id: ad.metaAdId,
      generated_name: ad.generatedName,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /ad/:id/status ────────────────────────────────────────────────────

router.put("/ad/:id/status", async (req: Request, res: Response) => {
  try {
    const adId = parseInt(req.params.id as string, 10);
    const { status } = req.body as { status: string };

    if (!status || !["ACTIVE", "PAUSED"].includes(status.toUpperCase())) {
      return res.status(400).json({ detail: "status must be ACTIVE or PAUSED" });
    }

    const adRows = await db
      .select()
      .from(ads)
      .where(eq(ads.id, adId))
      .limit(1);
    const ad = adRows[0];
    if (!ad || !ad.metaAdId) {
      return res.status(404).json({ detail: "Ad not found or not deployed" });
    }

    const auth = await getMetaAuth(db);

    const { MetaApiService } = await import("../services/meta-api.js");
    const meta = new MetaApiService(auth.accessToken, auth.pageId ?? "");
    await meta.updateAdStatus(ad.metaAdId, status.toUpperCase());

    await db
      .update(ads)
      .set({ status: status.toLowerCase() })
      .where(eq(ads.id, adId));

    return res.json({ status: "updated", ad_id: ad.id, new_status: status.toUpperCase() });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /ad/:id/copy ──────────────────────────────────────────────────────

router.put("/ad/:id/copy", async (req: Request, res: Response) => {
  try {
    const adId = parseInt(req.params.id as string, 10);
    const { headline, primary_text, description } = req.body;

    const adRows = await db
      .select()
      .from(ads)
      .where(eq(ads.id, adId))
      .limit(1);
    const ad = adRows[0];
    if (!ad) {
      return res.status(404).json({ detail: "Ad not found" });
    }

    const updates: Record<string, unknown> = {};
    if (headline !== undefined) updates.headline = headline;
    if (primary_text !== undefined) updates.primaryText = primary_text;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length > 0) {
      await db.update(ads).set(updates).where(eq(ads.id, adId));
    }

    return res.json({ status: "updated", ad_id: ad.id });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /:id/analyze-creative ────────────────────────────────────────────

router.post(
  "/:id/analyze-creative",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id as string, 10);

      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const project = projectRows[0];
      if (!project) {
        return res.status(404).json({ detail: "Project not found" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ detail: "No file uploaded" });
      }

      // Save uploaded file
      const uploadDir = path.join("/tmp/uploads", String(projectId), "new_creatives");
      fs.mkdirSync(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, file.originalname);
      fs.renameSync(file.path, filePath);

      // Determine media type
      const ext = path.extname(file.originalname).toLowerCase();
      const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv"]);
      const mediaType = VIDEO_EXTS.has(ext) ? "video" : "image";

      // Get campaign strategy from parsed structure
      let strategy = "";
      if (project.parsedStructureJson) {
        const parsed = JSON.parse(project.parsedStructureJson);
        strategy += `Campaign: ${parsed.campaign?.name ?? project.name}\n`;
        strategy += `Objective: ${project.campaignObjective}\n`;
        strategy += "Ad Sets (each represents a different angle/audience):\n";
        for (const adsetData of parsed.ad_sets ?? []) {
          strategy += `- ${adsetData.name ?? "Unknown"}`;
          if (adsetData.description) {
            strategy += `: ${adsetData.description}`;
          }
          strategy += "\n";
        }
      }

      // Get existing ad sets
      const adsetRows = await db
        .select()
        .from(adSets)
        .where(eq(adSets.projectId, projectId));

      const adSetList = adsetRows.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.generatedName,
      }));

      // Analyze with AI
      let analysis: any;
      try {
        const { analyzeCreative } = await import("../services/claude-creative-analyzer.js");
        analysis = await analyzeCreative(filePath, mediaType, strategy, adSetList);
      } catch (e: any) {
        return res.status(500).json({ detail: `Creative analysis failed: ${e.message}` });
      }

      // Save creative to DB (unassigned - user must confirm placement)
      const creativeResult = await db
        .insert(creatives)
        .values({
          projectId,
          originalName: file.originalname,
          baseName: path.parse(file.originalname).name,
          mediaType: mediaType as "image" | "video",
          localPath: filePath,
          fileSizeBytes: fs.statSync(filePath).size,
          uploadStatus: "downloaded",
        })
        .returning();
      const creative = creativeResult[0];

      return res.json({
        creative_id: creative.id,
        filename: file.originalname,
        media_type: mediaType,
        analysis,
        message: "Review the AI recommendation and confirm the placement.",
      });
    } catch (e: any) {
      return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
    }
  },
);

export default router;
