/**
 * Campaign deployment orchestrator. Coordinates the full deploy pipeline.
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
import { buildCreativesIndex } from "./creative-mapper.js";
import { buildUrlTags } from "./utm-builder.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeployEvent {
  step: string;
  entity: string;
  status: string;
  detail: string;
}

type ProgressCallback = (event: DeployEvent) => void;

type DeployStep =
  | "creative_upload"
  | "campaign"
  | "adset"
  | "ad_creative"
  | "ad";
type DeployStatus = "pending" | "success" | "failed" | "rolled_back";

// ── Inferred row types ──────────────────────────────────────────────────────

type ProjectRow = typeof projects.$inferSelect;
type AdSetRow = typeof adSets.$inferSelect;
type AdRow = typeof ads.$inferSelect;
type CreativeRow = typeof creatives.$inferSelect;

// ── CampaignBuilder ─────────────────────────────────────────────────────────

export class CampaignBuilder {
  private db: Database;
  private meta: MetaApiService;

  constructor(db: Database, meta: MetaApiService) {
    this.db = db;
    this.meta = meta;
  }

  private async emit(
    cb: ProgressCallback | undefined,
    step: string,
    entity: string,
    status: string,
    detail: string = "",
  ): Promise<void> {
    if (cb) {
      cb({ step, entity, status, detail });
    }
  }

  private async log(
    projectId: number,
    step: DeployStep,
    entityName: string,
    metaId?: string,
    status: DeployStatus = "success",
    error?: string,
  ): Promise<void> {
    await this.db.insert(deployLogs).values({
      projectId,
      step,
      entityName,
      metaId: metaId ?? null,
      status,
      errorMessage: error ?? null,
    });
  }

  // ── Main deploy method ──────────────────────────────────────────────────

  async deploy(
    projectId: number,
    progressCallback?: ProgressCallback,
  ): Promise<{ success: boolean; campaign_id: string; errors: string[] }> {
    // Load project
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Mark as deploying
    await this.db
      .update(projects)
      .set({ status: "deploying" })
      .where(eq(projects.id, projectId));

    const accountId = project.adAccountId;
    if (!accountId) {
      throw new Error("Project has no ad_account_id set");
    }

    const errors: string[] = [];
    let campaignId = "";

    try {
      // Step 1: Upload all creatives
      await this.emit(progressCallback, "creative_upload", "all", "started");
      const creativeRows = await this.loadCreatives(projectId);

      for (const creative of creativeRows) {
        try {
          await this.uploadCreative(creative, accountId, projectId);
          await this.emit(
            progressCallback,
            "creative_upload",
            creative.originalName,
            "success",
          );
        } catch (e) {
          const errorMsg = String(e);
          await this.log(
            projectId,
            "creative_upload",
            creative.originalName,
            undefined,
            "failed",
            errorMsg,
          );
          await this.emit(
            progressCallback,
            "creative_upload",
            creative.originalName,
            "failed",
            errorMsg,
          );
          errors.push(
            `Creative upload failed: ${creative.originalName}: ${errorMsg}`,
          );
        }
      }

      // Step 2: Create campaign
      await this.emit(progressCallback, "campaign", project.name, "started");
      campaignId = await this.meta.createCampaign(
        accountId,
        project.name,
        project.campaignObjective ?? "OUTCOME_SALES",
        project.budgetType ?? "CBO",
        project.dailyBudget ?? undefined,
        project.lifetimeBudget ?? undefined,
      );

      await this.db
        .update(projects)
        .set({ metaCampaignId: campaignId })
        .where(eq(projects.id, projectId));

      await this.log(projectId, "campaign", project.name, campaignId);
      await this.emit(
        progressCallback,
        "campaign",
        project.name,
        "success",
        campaignId,
      );

      // Step 3: Create ad sets
      const adSetRows = await this.loadAdSets(projectId);

      for (const adset of adSetRows) {
        try {
          await this.deployAdSet(
            adset,
            accountId,
            campaignId,
            projectId,
            project,
            progressCallback,
          );
        } catch (e) {
          const errorMsg = String(e);
          await this.log(
            projectId,
            "adset",
            adset.name,
            undefined,
            "failed",
            errorMsg,
          );
          await this.emit(
            progressCallback,
            "adset",
            adset.name,
            "failed",
            errorMsg,
          );
          errors.push(`Ad set creation failed: ${adset.name}: ${errorMsg}`);
        }
      }

      // Update project status
      await this.db
        .update(projects)
        .set({ status: errors.length === 0 ? "deployed" : "failed" })
        .where(eq(projects.id, projectId));

      return {
        success: errors.length === 0,
        campaign_id: campaignId,
        errors,
      };
    } catch (e) {
      await this.db
        .update(projects)
        .set({ status: "failed" })
        .where(eq(projects.id, projectId));
      throw e;
    }
  }

  // ── Creative upload ───────────────────────────────────────────────────────

  private async uploadCreative(
    creative: CreativeRow,
    accountId: string,
    projectId: number,
  ): Promise<void> {
    if (creative.uploadStatus === "uploaded") {
      return; // Already uploaded
    }

    await this.db
      .update(creatives)
      .set({ uploadStatus: "uploading" })
      .where(eq(creatives.id, creative.id));

    if (!creative.localPath) {
      throw new Error(
        `Creative ${creative.originalName} has no local path`,
      );
    }

    let metaRef: string;

    if (creative.mediaType === "image") {
      const imageHash = await this.meta.uploadImage(
        accountId,
        creative.localPath,
      );
      await this.db
        .update(creatives)
        .set({ metaImageHash: imageHash, uploadStatus: "uploaded" })
        .where(eq(creatives.id, creative.id));
      metaRef = imageHash;
    } else {
      const videoId = await this.meta.uploadVideo(
        accountId,
        creative.localPath,
      );
      await this.db
        .update(creatives)
        .set({ metaVideoId: videoId, uploadStatus: "uploaded" })
        .where(eq(creatives.id, creative.id));
      metaRef = videoId;
    }

    await this.log(
      projectId,
      "creative_upload",
      creative.originalName,
      metaRef,
    );
  }

  // ── Ad set deployment ─────────────────────────────────────────────────────

  private async deployAdSet(
    adset: AdSetRow,
    accountId: string,
    campaignId: string,
    projectId: number,
    project: ProjectRow,
    progressCallback?: ProgressCallback,
  ): Promise<void> {
    const targeting: Record<string, unknown> = adset.targetingJson
      ? JSON.parse(adset.targetingJson)
      : {};
    const placements: Record<string, string[]> | string | null =
      adset.placementsJson ? JSON.parse(adset.placementsJson) : null;

    const displayName = adset.generatedName ?? adset.name;

    await this.emit(progressCallback, "adset", displayName, "started");

    const metaAdsetId = await this.meta.createAdSet(
      accountId,
      campaignId,
      displayName,
      adset.optimizationGoal,
      targeting,
      adset.bidStrategy,
      adset.budget ?? undefined,
      placements,
    );

    await this.db
      .update(adSets)
      .set({ metaAdsetId, status: "deployed" })
      .where(eq(adSets.id, adset.id));

    await this.log(projectId, "adset", adset.name, metaAdsetId);
    await this.emit(
      progressCallback,
      "adset",
      displayName,
      "success",
      metaAdsetId,
    );

    // Create ads for this ad set
    const adRows = await this.loadAds(adset.id);

    for (const ad of adRows) {
      try {
        await this.deployAd(
          ad,
          accountId,
          metaAdsetId,
          projectId,
          project,
          progressCallback,
        );
      } catch (e) {
        const errorMsg = String(e);
        await this.log(
          projectId,
          "ad",
          ad.name,
          undefined,
          "failed",
          errorMsg,
        );
        await this.emit(
          progressCallback,
          "ad",
          ad.name,
          "failed",
          errorMsg,
        );
      }
    }
  }

  // ── Ad deployment ─────────────────────────────────────────────────────────

  private async deployAd(
    ad: AdRow,
    accountId: string,
    adsetId: string,
    projectId: number,
    project: ProjectRow,
    progressCallback?: ProgressCallback,
  ): Promise<void> {
    const displayName = ad.generatedName ?? ad.name;
    await this.emit(progressCallback, "ad", displayName, "started");

    // Build UTM tags
    const urlTags = ad.urlTags ?? buildUrlTags();

    // Load all creatives for the project and build the index
    const creativeRows = await this.loadCreatives(projectId);
    const creativeList = creativeRows.map((c) => ({
      id: c.id,
      base_name: c.baseName,
      format: c.format,
      original_name: c.originalName,
      meta_image_hash: c.metaImageHash,
      meta_video_id: c.metaVideoId,
      media_type: c.mediaType,
    }));
    const index = buildCreativesIndex(creativeList);

    // Find the primary creative (prefer square for single creative)
    const creativeRef = ad.creativeRef ?? "";
    const variants = index[creativeRef] ?? {};
    const primary =
      variants["square"] ?? variants["horizontal"] ?? variants["vertical"];

    if (!primary) {
      throw new Error(`No creative found for ref '${creativeRef}'`);
    }

    // Create ad creative in Meta
    const creativeId = await this.meta.createAdCreative(
      accountId,
      `creative_${displayName}`,
      {
        imageHash: primary.meta_image_hash ?? undefined,
        videoId: primary.meta_video_id ?? undefined,
        headline: ad.headline ?? "",
        primaryText: ad.primaryText ?? "",
        description: ad.description ?? "",
        cta: ad.cta ?? "SHOP_NOW",
        url: ad.url ?? project.destinationUrl ?? "",
        urlTags,
      },
    );

    await this.log(projectId, "ad_creative", ad.name, creativeId);

    // Create the ad in Meta
    const metaAdId = await this.meta.createAd(
      accountId,
      displayName,
      adsetId,
      creativeId,
    );

    await this.db
      .update(ads)
      .set({
        metaAdId,
        metaCreativeId: creativeId,
        status: "deployed",
      })
      .where(eq(ads.id, ad.id));

    await this.log(projectId, "ad", ad.name, metaAdId);
    await this.emit(
      progressCallback,
      "ad",
      displayName,
      "success",
      metaAdId,
    );
  }

  // ── Data loaders ──────────────────────────────────────────────────────────

  private async loadCreatives(projectId: number): Promise<CreativeRow[]> {
    return this.db
      .select()
      .from(creatives)
      .where(eq(creatives.projectId, projectId));
  }

  private async loadAdSets(projectId: number): Promise<AdSetRow[]> {
    return this.db
      .select()
      .from(adSets)
      .where(eq(adSets.projectId, projectId));
  }

  private async loadAds(adSetId: number): Promise<AdRow[]> {
    return this.db.select().from(ads).where(eq(ads.adSetId, adSetId));
  }
}
