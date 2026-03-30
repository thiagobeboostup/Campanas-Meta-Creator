/**
 * Auto-naming engine for campaigns, ad sets, and ads.
 */

// ── Default naming templates ────────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  campaign: "{objective}_{budget_type}_{name}_{date}",
  adset: "{campaign_short}_{adset_name}_{optimization}_{variant}",
  ad: "{adset_short}_{creative_ref}_{format}_{version}",
} as const;

// ── Internal helpers ────────────────────────────────────────────────────────

function shorten(name: string, maxLen: number = 15): string {
  const stopWords = new Set([
    "de", "del", "la", "el", "los", "las", "the", "a", "an", "for", "and",
  ]);
  const words = name.split(/\s+/).filter((w) => !stopWords.has(w.toLowerCase()));

  if (words.length === 0) {
    return name.slice(0, maxLen);
  }

  if (words.length === 1) {
    return words[0].slice(0, maxLen);
  }

  // CamelCase abbreviation
  const abbr = words
    .slice(0, 4)
    .map((w) => w[0].toUpperCase() + w.slice(1, 3))
    .join("");
  return abbr.slice(0, maxLen);
}

function cleanName(name: string): string {
  // Replace non-alphanumeric (except _ - .) with underscores
  let cleaned = name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  // Collapse multiple underscores
  cleaned = cleaned.replace(/_+/g, "_");
  // Strip leading/trailing underscores
  cleaned = cleaned.replace(/^_+|_+$/g, "");
  return cleaned;
}

function formatTemplate(
  template: string,
  values: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function generateCampaignName(
  name: string,
  objective: string,
  budgetType: string,
  template?: string,
): string {
  const tmpl = template ?? DEFAULT_TEMPLATES.campaign;
  const objShort = objective.replace("OUTCOME_", "");
  const now = new Date();
  const date =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const result = formatTemplate(tmpl, {
    name,
    objective: objShort,
    budget_type: budgetType,
    date,
  });
  return cleanName(result);
}

export function generateAdSetName(
  campaignName: string,
  adsetName: string,
  optimizationGoal: string,
  variantIndex: number,
  template?: string,
): string {
  const tmpl = template ?? DEFAULT_TEMPLATES.adset;
  const campaignShort = shorten(campaignName);

  // Variant letter: A, B, C, ...
  const variant = String.fromCharCode(65 + (variantIndex % 26));

  const optShort = optimizationGoal
    .replace("OFFSITE_", "")
    .replace(/_/g, "")
    .slice(0, 8);

  const result = formatTemplate(tmpl, {
    campaign_short: campaignShort,
    adset_name: shorten(adsetName),
    optimization: optShort,
    variant,
  });
  return cleanName(result);
}

export function generateAdName(
  adsetName: string,
  creativeRef: string,
  creativeFormat: string,
  versionIndex: number,
  template?: string,
): string {
  const tmpl = template ?? DEFAULT_TEMPLATES.ad;
  const adsetShort = shorten(adsetName);

  const result = formatTemplate(tmpl, {
    adset_short: adsetShort,
    creative_ref: creativeRef.slice(0, 20),
    format: creativeFormat ? creativeFormat.slice(0, 5) : "multi",
    version: `v${versionIndex + 1}`,
  });
  return cleanName(result);
}

export interface AdSetInput {
  name: string;
  optimization_goal?: string;
  ads?: Array<{
    creative_ref?: string;
    format?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface GeneratedNames {
  campaign_name: string;
  ad_sets: Array<{
    generated_name: string;
    ads: Array<{ generated_name: string; [key: string]: unknown }>;
    [key: string]: unknown;
  }>;
}

export function generateAllNames(
  projectName: string,
  objective: string,
  budgetType: string,
  adSets: AdSetInput[],
  templates?: { campaign?: string; adset?: string; ad?: string },
): GeneratedNames {
  const campaignTmpl = templates?.campaign;
  const adsetTmpl = templates?.adset;
  const adTmpl = templates?.ad;

  const campaignName = generateCampaignName(
    projectName,
    objective,
    budgetType,
    campaignTmpl,
  );

  const resultSets = adSets.map((adset, i) => {
    const adsetGenName = generateAdSetName(
      campaignName,
      adset.name,
      adset.optimization_goal ?? "CONVERSIONS",
      i,
      adsetTmpl,
    );

    const generatedAds = (adset.ads ?? []).map((ad, j) => {
      const adGenName = generateAdName(
        adsetGenName,
        ad.creative_ref ?? "creative",
        ad.format ?? "",
        j,
        adTmpl,
      );
      return { ...ad, generated_name: adGenName } as {
        generated_name: string;
        [key: string]: unknown;
      };
    });

    return {
      ...adset,
      generated_name: adsetGenName,
      ads: generatedAds,
    } as {
      generated_name: string;
      ads: Array<{ generated_name: string; [key: string]: unknown }>;
      [key: string]: unknown;
    };
  });

  return {
    campaign_name: campaignName,
    ad_sets: resultSets,
  };
}
