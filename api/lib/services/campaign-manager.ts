/**
 * Post-deploy campaign management: edit budgets, add ad sets/ads to live campaigns.
 */
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  projects,
  adSets,
  ads,
  creatives,
  deployLogs,
} from "../db/schema.js";
import { MetaApiService } from "./meta-api.js";
import { generateAdSetName, generateAdName } from "./naming.js";
import { buildUrlTags } from "./utm-builder.js";

// ── Inferred row types ──────────────────────────────────────────────────────

type ProjectRow = typeof projects.$inferSelect;
type AdSetRow = typeof adSets.$inferSelect;
type AdRow = typeof ads.$inferSelect;
type CreativeRow = typeof creatives.$inferSelect;

// ── CampaignManager ─────────────────────────────────────────────────────────

export class CampaignManager {
  private db: Database;
  private meta: MetaApiService;

  constructor(db: Database, meta: MetaApiService) {
    this.db = db;
    this.meta = meta;
  }

  /**
   * Update campaign-level budget (CBO).
   */
  async updateBudget(
    projectId: number,
    dailyBudget?: number,
    lifetimeBudget?: number,
  ): Promise<{ status: string; campaign_id: string }> {
    const project = await this.getProject(projectId);
    if (!project.metaCampaignId) {
      throw new Error("Campaign not deployed yet");
    }

    await this.meta.updateBudget(
      project.metaCampaignId,
      dailyBudget,
      lifetimeBudget,
    );

    const updates: Partial<ProjectRow> = {};
    if (dailyBudget != null) {
      updates.dailyBudget = dailyBudget;
    }
    if (lifetimeBudget != null) {
      updates.lifetimeBudget = lifetimeBudget;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, projectId));
    }

    return { status: "updated", campaign_id: project.metaCampaignId };
  }

  /**
   * Update ad set budget (ABO).
   */
  async updateAdSetBudget(
    adsetId: number,
    dailyBudget: number,
  ): Promise<{ status: string; adset_id: string }> {
    const [adset] = await this.db
      .select()
      .from(adSets)
      .where(eq(adSets.id, adsetId));

    if (!adset || !adset.metaAdsetId) {
      throw new Error("Ad set not found or not deployed");
    }

    await this.meta.updateAdSetBudget(adset.metaAdsetId, dailyBudget);

    await this.db
      .update(adSets)
      .set({ budget: dailyBudget })
      .where(eq(adSets.id, adsetId));

    return { status: "updated", adset_id: adset.metaAdsetId };
  }

  /**
   * Add a new ad set to a deployed campaign.
   */
  async addAdSet(
    projectId: number,
    name: string,
    targetingJson: string,
    optimizationGoal: string = "OFFSITE_CONVERSIONS",
    bidStrategy: string = "LOWEST_COST_WITHOUT_CAP",
    budget?: number,
    placementsJson?: string,
  ): Promise<AdSetRow> {
    const project = await this.getProject(projectId);
    if (!project.metaCampaignId) {
      throw new Error("Campaign not deployed yet");
    }
    if (!project.adAccountId) {
      throw new Error("Project has no ad_account_id set");
    }

    // Count existing ad sets for variant naming
    const existing = await this.db
      .select()
      .from(adSets)
      .where(eq(adSets.projectId, projectId));
    const variantIndex = existing.length;

    const generatedName = generateAdSetName(
      project.name,
      name,
      optimizationGoal,
      variantIndex,
    );

    // Create in Meta
    const targeting: Record<string, unknown> = JSON.parse(targetingJson);
    const placements: Record<string, string[]> | null = placementsJson
      ? JSON.parse(placementsJson)
      : null;

    const metaAdsetId = await this.meta.createAdSet(
      project.adAccountId,
      project.metaCampaignId,
      generatedName,
      optimizationGoal,
      targeting,
      bidStrategy,
      budget,
      placements,
    );

    // Save to DB
    const [newAdSet] = await this.db
      .insert(adSets)
      .values({
        projectId,
        name,
        generatedName,
        targetingJson,
        placementsJson: placementsJson ?? null,
        budget: budget ?? null,
        bidStrategy,
        optimizationGoal,
        metaAdsetId,
        status: "deployed",
      })
      .returning();

    // Log
    await this.db.insert(deployLogs).values({
      projectId,
      step: "adset",
      entityName: name,
      metaId: metaAdsetId,
      status: "success",
    });

    return newAdSet;
  }

  /**
   * Add a new ad to an existing ad set.
   */
  async addAd(
    adsetId: number,
    name: string,
    creativeId: number,
    headline: string = "",
    primaryText: string = "",
    description: string = "",
    cta: string = "SHOP_NOW",
    url?: string,
  ): Promise<AdRow> {
    // Load the ad set
    const [adset] = await this.db
      .select()
      .from(adSets)
      .where(eq(adSets.id, adsetId));

    if (!adset || !adset.metaAdsetId) {
      throw new Error("Ad set not found or not deployed");
    }

    const project = await this.getProject(adset.projectId);
    if (!project.adAccountId) {
      throw new Error("Project has no ad_account_id set");
    }

    // Get creative info
    const [creative] = await this.db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creativeId));

    if (!creative) {
      throw new Error(`Creative ${creativeId} not found`);
    }

    // Ensure creative is uploaded
    if (!creative.metaImageHash && !creative.metaVideoId) {
      if (!creative.localPath) {
        throw new Error(
          `Creative ${creative.originalName} has no local path`,
        );
      }

      if (creative.mediaType === "image") {
        const imageHash = await this.meta.uploadImage(
          project.adAccountId,
          creative.localPath,
        );
        await this.db
          .update(creatives)
          .set({ metaImageHash: imageHash, uploadStatus: "uploaded" })
          .where(eq(creatives.id, creative.id));
        creative.metaImageHash = imageHash;
      } else {
        const videoId = await this.meta.uploadVideo(
          project.adAccountId,
          creative.localPath,
        );
        await this.db
          .update(creatives)
          .set({ metaVideoId: videoId, uploadStatus: "uploaded" })
          .where(eq(creatives.id, creative.id));
        creative.metaVideoId = videoId;
      }
    }

    // Count existing ads for version naming
    const existingAds = await this.db
      .select()
      .from(ads)
      .where(eq(ads.adSetId, adsetId));
    const versionIndex = existingAds.length;

    const generatedName = generateAdName(
      adset.generatedName ?? adset.name,
      creative.baseName ?? name,
      creative.format ?? "",
      versionIndex,
    );

    const urlTags = buildUrlTags();
    const finalUrl = url ?? project.destinationUrl ?? "";

    // Create creative in Meta
    const metaCreativeId = await this.meta.createAdCreative(
      project.adAccountId,
      `creative_${generatedName}`,
      {
        imageHash: creative.metaImageHash ?? undefined,
        videoId: creative.metaVideoId ?? undefined,
        headline,
        primaryText,
        description,
        cta,
        url: finalUrl,
        urlTags,
      },
    );

    // Create ad in Meta
    const metaAdId = await this.meta.createAd(
      project.adAccountId,
      generatedName,
      adset.metaAdsetId,
      metaCreativeId,
    );

    // Save to DB
    const [newAd] = await this.db
      .insert(ads)
      .values({
        adSetId: adsetId,
        name,
        generatedName,
        creativeRef: creative.baseName,
        headline,
        primaryText,
        description,
        cta,
        url: finalUrl,
        urlTags,
        metaAdId,
        metaCreativeId,
        status: "deployed",
      })
      .returning();

    // Log
    await this.db.insert(deployLogs).values({
      projectId: project.id,
      step: "ad",
      entityName: name,
      metaId: metaAdId,
      status: "success",
    });

    return newAd;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getProject(projectId: number): Promise<ProjectRow> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }
    return project;
  }
}
