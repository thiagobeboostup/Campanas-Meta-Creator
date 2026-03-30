import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import fs from "fs";
import path from "path";
import { db } from "../db/client.js";
import { projects, adSets, ads } from "../db/schema.js";
import { parseDocument, validateParsedCompleteness } from "../services/claude-parser.js";
import { extractText } from "../services/file-processing.js";

const upload = multer({ dest: "/tmp/uploads" });
const router = Router();

// ── POST /:id/upload ────────────────────────────────────────────────────────

router.post(
  "/:id/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id, 10);

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

      // Move file to a stable location
      const uploadDir = path.join("/tmp/uploads", String(projectId), "docs");
      fs.mkdirSync(uploadDir, { recursive: true });
      const destPath = path.join(uploadDir, file.originalname);
      fs.renameSync(file.path, destPath);

      // Extract text from file
      let text: string;
      try {
        text = await extractText(destPath);
      } catch (e: any) {
        return res.status(400).json({ detail: e.message });
      }

      await db
        .update(projects)
        .set({ rawDocumentText: text })
        .where(eq(projects.id, projectId));

      return res.json({
        status: "uploaded",
        filename: file.originalname,
        text_length: text.length,
      });
    } catch (e: any) {
      return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
    }
  },
);

// ── POST /:id/parse ─────────────────────────────────────────────────────────

router.post("/:id/parse", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }
    if (!project.rawDocumentText) {
      return res.status(400).json({ detail: "No document uploaded. Upload a document first." });
    }

    let structure: any;
    try {
      structure = await parseDocument(project.rawDocumentText);
    } catch (e: any) {
      return res.status(500).json({ detail: `AI parsing failed: ${e.message}` });
    }

    // Update project fields from parsed campaign-level data
    const campaignUpdates: Record<string, unknown> = {
      parsedStructureJson: JSON.stringify(structure),
      status: "parsed",
    };
    if (structure.campaign?.name) {
      campaignUpdates.name = structure.campaign.name;
    }
    if (structure.campaign?.objective) {
      campaignUpdates.campaignObjective = structure.campaign.objective;
    }
    if (structure.campaign?.budget_type) {
      campaignUpdates.budgetType = structure.campaign.budget_type;
    }
    if (structure.campaign?.daily_budget != null) {
      campaignUpdates.dailyBudget = structure.campaign.daily_budget;
    }
    if (structure.campaign?.destination_url) {
      campaignUpdates.destinationUrl = structure.campaign.destination_url;
    }

    await db.update(projects).set(campaignUpdates).where(eq(projects.id, projectId));

    // Clear existing ad sets for this project
    const existingAdSets = await db
      .select()
      .from(adSets)
      .where(eq(adSets.projectId, projectId));
    for (const adSet of existingAdSets) {
      await db.delete(ads).where(eq(ads.adSetId, adSet.id));
    }
    await db.delete(adSets).where(eq(adSets.projectId, projectId));

    // Create AdSet and Ad records from parsed structure
    let totalAds = 0;
    for (const parsedAdSet of structure.ad_sets ?? []) {
      const adSetResult = await db
        .insert(adSets)
        .values({
          projectId,
          name: parsedAdSet.name,
          targetingJson:
            typeof parsedAdSet.targeting === "object"
              ? JSON.stringify(parsedAdSet.targeting)
              : parsedAdSet.targeting ?? null,
          placementsJson:
            typeof parsedAdSet.placements === "object"
              ? JSON.stringify(parsedAdSet.placements)
              : parsedAdSet.placements === "automatic"
                ? null
                : null,
          budget: parsedAdSet.budget_daily ?? null,
          bidStrategy: parsedAdSet.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
          optimizationGoal: parsedAdSet.optimization_goal ?? "OFFSITE_CONVERSIONS",
        })
        .returning();
      const adSet = adSetResult[0];

      for (const parsedAd of parsedAdSet.ads ?? []) {
        await db.insert(ads).values({
          adSetId: adSet.id,
          name: parsedAd.name,
          creativeRef: parsedAd.creative_ref ?? null,
          headline: parsedAd.headline ?? null,
          primaryText: parsedAd.primary_text ?? null,
          description: parsedAd.description ?? null,
          cta: parsedAd.cta ?? "SHOP_NOW",
          url: parsedAd.url ?? null,
        });
        totalAds++;
      }
    }

    // Check for missing required fields
    const missingFields = validateParsedCompleteness(structure);

    return res.json({
      status: "parsed",
      structure,
      missing_fields: missingFields,
      ad_sets_count: (structure.ad_sets ?? []).length,
      total_ads: totalAds,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /:id/parsed ─────────────────────────────────────────────────────────

router.get("/:id/parsed", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }
    if (!project.parsedStructureJson) {
      return res.status(400).json({ detail: "No parsed structure available" });
    }

    return res.json(JSON.parse(project.parsedStructureJson));
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /:id/parsed ─────────────────────────────────────────────────────────

router.put("/:id/parsed", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRows[0]) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const structure = req.body;
    await db
      .update(projects)
      .set({ parsedStructureJson: JSON.stringify(structure) })
      .where(eq(projects.id, projectId));

    return res.json({ status: "updated" });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── POST /:id/complete-fields ───────────────────────────────────────────────

router.post("/:id/complete-fields", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const {
      campaign_name,
      campaign_objective,
      budget_type,
      daily_budget,
      destination_url,
    } = req.body;

    const updates: Record<string, unknown> = {};
    if (campaign_name) updates.name = campaign_name;
    if (campaign_objective) updates.campaignObjective = campaign_objective;
    if (budget_type) updates.budgetType = budget_type;
    if (daily_budget != null) updates.dailyBudget = daily_budget;
    if (destination_url) updates.destinationUrl = destination_url;

    // Also update the parsed_structure_json if it exists
    if (project.parsedStructureJson) {
      const parsed = JSON.parse(project.parsedStructureJson);
      const campaign = parsed.campaign ?? {};
      if (campaign_name) campaign.name = campaign_name;
      if (campaign_objective) campaign.objective = campaign_objective;
      if (budget_type) campaign.budget_type = budget_type;
      if (daily_budget != null) campaign.daily_budget = daily_budget;
      if (destination_url) campaign.destination_url = destination_url;
      parsed.campaign = campaign;
      updates.parsedStructureJson = JSON.stringify(parsed);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(projects).set(updates).where(eq(projects.id, projectId));
    }

    // Reload to verify completeness
    const reloaded = (
      await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    )[0];

    const remaining: string[] = [];
    if (!reloaded.name || !reloaded.name.trim()) remaining.push("campaign_name");
    if (!reloaded.campaignObjective) remaining.push("campaign_objective");
    if (!reloaded.budgetType) remaining.push("budget_type");
    if (reloaded.dailyBudget == null) remaining.push("daily_budget");
    if (!reloaded.destinationUrl) remaining.push("destination_url");

    return res.json({
      status: remaining.length === 0 ? "completed" : "incomplete",
      missing_fields: remaining,
    });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
