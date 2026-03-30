import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects, adSets, ads, creatives } from "../db/schema.js";

const router = Router();

// ── GET /:id ──────────────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id, 10);

    // Load project
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return res.status(404).json({ detail: "Project not found" });
    }

    // Load ad sets with ads
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

    // Parse naming templates
    const templates = project.namingTemplate
      ? JSON.parse(project.namingTemplate)
      : null;

    // Build ad_sets data for naming
    const adSetsData = adSetsWithAds.map((adSet) => ({
      name: adSet.name,
      optimization_goal: adSet.optimizationGoal,
      targeting_json: adSet.targetingJson,
      placements_json: adSet.placementsJson,
      budget: adSet.budget,
      bid_strategy: adSet.bidStrategy,
      ads: adSet.ads.map((ad) => ({
        name: ad.name,
        creative_ref: ad.creativeRef ?? "",
        format: "",
        headline: ad.headline,
        primary_text: ad.primaryText,
        description: ad.description,
        cta: ad.cta,
        url: ad.url,
      })),
    }));

    // Generate names using naming service
    let namingResult: any;
    try {
      const { generateAllNames } = await import("../services/naming.js");
      namingResult = generateAllNames(
        project.name,
        project.campaignObjective ?? "OUTCOME_SALES",
        project.budgetType ?? "CBO",
        adSetsData,
        templates,
      );
    } catch {
      // Fallback naming if service not available
      namingResult = {
        campaign_name: project.name,
        ad_sets: adSetsData.map((as_) => ({
          generated_name: as_.name,
          ads: as_.ads.map((ad) => ({
            generated_name: ad.name,
          })),
        })),
      };
    }

    // Update generated names in DB
    for (let i = 0; i < adSetsWithAds.length; i++) {
      const adSet = adSetsWithAds[i];
      const namingAdSet = namingResult.ad_sets?.[i];
      if (!namingAdSet) continue;

      await db
        .update(adSets)
        .set({ generatedName: namingAdSet.generated_name })
        .where(eq(adSets.id, adSet.id));
      adSet.generatedName = namingAdSet.generated_name;

      for (let j = 0; j < adSet.ads.length; j++) {
        const ad = adSet.ads[j];
        const namingAd = namingAdSet.ads?.[j];
        if (!namingAd) continue;

        let urlTags: string | null = null;
        try {
          const { buildUrlTags } = await import("../services/utm-builder.js");
          urlTags = buildUrlTags();
        } catch {
          // utm service not available
        }

        await db
          .update(ads)
          .set({
            generatedName: namingAd.generated_name,
            urlTags: urlTags,
          })
          .where(eq(ads.id, ad.id));
        ad.generatedName = namingAd.generated_name;
        ad.urlTags = urlTags;
      }
    }

    // Build creative mapping
    const creativeRows = await db
      .select()
      .from(creatives)
      .where(eq(creatives.projectId, projectId));

    const creativeList = creativeRows.map((c) => ({
      id: c.id,
      base_name: c.baseName,
      format: c.format,
      original_name: c.originalName,
    }));

    let mapper: any = null;
    try {
      const { buildCreativesIndex, CreativeMapper } = await import(
        "../services/creative-mapper.js"
      );
      const index = buildCreativesIndex(creativeList);
      mapper = new CreativeMapper(index);
    } catch {
      // service not available
    }

    // Build UTM display values
    let urlTags = "";
    let utmParamsDisplay: Record<string, string> = {};
    let utmPreviewUrl = "";
    const baseUrl = project.destinationUrl ?? "https://example.com";
    try {
      const utmModule = await import("../services/utm-builder.js");
      urlTags = utmModule.buildUrlTags();
      utmParamsDisplay = utmModule.getUtmParamsDisplay(urlTags);
      utmPreviewUrl = utmModule.previewUtmUrl(baseUrl, urlTags);
    } catch {
      // utm service not available
      utmPreviewUrl = baseUrl;
    }

    // Build preview response
    const warnings: string[] = [];

    const preview = {
      campaign: {
        generated_name: namingResult.campaign_name,
        objective: project.campaignObjective,
        budget_type: project.budgetType ?? "CBO",
        daily_budget: project.dailyBudget,
        lifetime_budget: project.lifetimeBudget,
      },
      utm_params: utmParamsDisplay,
      utm_preview_url: utmPreviewUrl,
      ad_sets: adSetsWithAds.map((adSet) => {
        const adsetPreview = {
          id: adSet.id,
          name: adSet.name,
          generated_name: adSet.generatedName,
          targeting: adSet.targetingJson ? JSON.parse(adSet.targetingJson) : {},
          optimization_goal: adSet.optimizationGoal,
          budget: adSet.budget,
          ads: adSet.ads.map((ad) => {
            let creativeMapping: any[] = [];
            let creativeWarnings: string[] = [];

            if (mapper) {
              const mapping = mapper.getMappingForAd(ad.creativeRef ?? "");
              creativeMapping = (mapping.mappings ?? []).slice(0, 5);
              creativeWarnings = mapping.warnings ?? [];
              warnings.push(...creativeWarnings);
            }

            return {
              id: ad.id,
              name: ad.name,
              generated_name: ad.generatedName,
              creative_ref: ad.creativeRef,
              headline: ad.headline,
              primary_text: ad.primaryText,
              cta: ad.cta,
              url: ad.url,
              url_tags: ad.urlTags,
              creative_mapping: creativeMapping,
              creative_warnings: creativeWarnings,
            };
          }),
        };
        return adsetPreview;
      }),
      warnings,
    };

    // Update project status
    await db
      .update(projects)
      .set({ status: "previewed" })
      .where(eq(projects.id, projectId));

    return res.json(preview);
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

// ── PUT /:id/naming-template ──────────────────────────────────────────────

router.put("/:id/naming-template", async (req: Request, res: Response) => {
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

    // Accept { campaign, adset, ad } template strings
    const templateData: Record<string, string> = {};
    if (req.body.campaign !== undefined) templateData.campaign = req.body.campaign;
    if (req.body.adset !== undefined) templateData.adset = req.body.adset;
    if (req.body.ad !== undefined) templateData.ad = req.body.ad;

    await db
      .update(projects)
      .set({ namingTemplate: JSON.stringify(templateData) })
      .where(eq(projects.id, projectId));

    return res.json({ status: "updated" });
  } catch (e: any) {
    return res.status(e.status ?? 500).json({ detail: e.message ?? "Internal server error" });
  }
});

export default router;
