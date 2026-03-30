import { Router, Request, Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects, adSets, ads } from "../db/schema.js";

const router = Router();

/** Helper: load a project with its ad_sets and ads. */
async function loadProjectWithRelations(projectId: number) {
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = projectRows[0];
  if (!project) return null;

  const adSetRows = await db
    .select()
    .from(adSets)
    .where(eq(adSets.projectId, projectId));

  const adSetsWithAds = await Promise.all(
    adSetRows.map(async (adSet) => {
      const adRows = await db
        .select()
        .from(ads)
        .where(eq(ads.adSetId, adSet.id));
      return { ...adSet, ads: adRows };
    }),
  );

  return { ...project, ad_sets: adSetsWithAds };
}

// ── POST / ──────────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name,
      campaign_objective,
      budget_type = "CBO",
      daily_budget,
      lifetime_budget,
      ad_account_id,
      destination_url,
    } = req.body;

    if (!name) {
      return res.status(400).json({ detail: "name is required" });
    }
    if (!campaign_objective) {
      return res.status(400).json({ detail: "campaign_objective is required" });
    }
    if (!ad_account_id) {
      return res.status(400).json({ detail: "ad_account_id is required" });
    }

    // Validate ad account id format: should start with "act_"
    const accountId = ad_account_id.startsWith("act_")
      ? ad_account_id
      : `act_${ad_account_id}`;

    const validObjectives = [
      "OUTCOME_SALES",
      "OUTCOME_TRAFFIC",
      "OUTCOME_ENGAGEMENT",
      "OUTCOME_LEADS",
      "OUTCOME_APP_PROMOTION",
      "OUTCOME_AWARENESS",
    ];
    const objective = validObjectives.includes(campaign_objective)
      ? campaign_objective
      : campaign_objective;

    const result = await db
      .insert(projects)
      .values({
        name,
        campaignObjective: objective,
        budgetType: budget_type,
        dailyBudget: daily_budget ?? null,
        lifetimeBudget: lifetime_budget ?? null,
        adAccountId: accountId,
        destinationUrl: destination_url ?? null,
      })
      .returning();
    const project = result[0];

    const full = await loadProjectWithRelations(project.id);
    return res.status(201).json(full);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET / ───────────────────────────────────────────────────────────────────

router.get("/", async (_req: Request, res: Response) => {
  try {
    const projectRows = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt));

    const results = await Promise.all(
      projectRows.map(async (project) => {
        const adSetRows = await db
          .select()
          .from(adSets)
          .where(eq(adSets.projectId, project.id));

        const adSetsWithAds = await Promise.all(
          adSetRows.map(async (adSet) => {
            const adRows = await db
              .select()
              .from(ads)
              .where(eq(ads.adSetId, adSet.id));
            return { ...adSet, ads: adRows };
          }),
        );

        return { ...project, ad_sets: adSetsWithAds };
      }),
    );

    return res.json(results);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── GET /:id ────────────────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const full = await loadProjectWithRelations(projectId);
    if (!full) {
      return res.status(404).json({ detail: "Project not found" });
    }
    return res.json(full);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /:id ────────────────────────────────────────────────────────────────

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!existing[0]) {
      return res.status(404).json({ detail: "Project not found" });
    }

    const updates: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      name: "name",
      campaign_objective: "campaignObjective",
      budget_type: "budgetType",
      daily_budget: "dailyBudget",
      lifetime_budget: "lifetimeBudget",
      drive_folder_url: "driveFolderUrl",
      naming_template: "namingTemplate",
      destination_url: "destinationUrl",
    };

    for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
      if (req.body[bodyKey] !== undefined) {
        updates[dbKey] = req.body[bodyKey];
      }
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, projectId));
    }

    const full = await loadProjectWithRelations(projectId);
    return res.json(full);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── DELETE /:id ─────────────────────────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!existing[0]) {
      return res.status(404).json({ detail: "Project not found" });
    }

    // Delete ads belonging to this project's ad sets
    const adSetRows = await db
      .select()
      .from(adSets)
      .where(eq(adSets.projectId, projectId));
    for (const adSet of adSetRows) {
      await db.delete(ads).where(eq(ads.adSetId, adSet.id));
    }

    // Delete ad sets
    await db.delete(adSets).where(eq(adSets.projectId, projectId));

    // Delete project
    await db.delete(projects).where(eq(projects.id, projectId));

    return res.json({ status: "deleted" });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
