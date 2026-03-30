/**
 * UTM parameter builder for Meta Ads using dynamic macros.
 */

// ── Default UTM template using Meta dynamic macros ──────────────────────────

const DEFAULT_UTM_PARAMS: Record<string, string> = {
  utm_source: "{{placement}}",
  utm_medium: "cpc",
  utm_campaign: "{{campaign.name}}",
  utm_content: "{{adset.name}}",
  utm_term: "{{ad.name}}",
};

// ── Param descriptions (Spanish, matching original) ─────────────────────────

const PARAM_DESCRIPTIONS: Record<string, string> = {
  utm_source: "Origen de la campaña (placement dinámico de Meta)",
  utm_medium: "Medio de campaña",
  utm_campaign: "Nombre de la campaña",
  utm_content: "Contenido de la campaña (nombre del ad set)",
  utm_term: "Término (nombre del anuncio)",
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the url_tags string for Meta ad creatives.
 *
 * Meta replaces dynamic macros like {{placement}}, {{campaign.name}}, etc.
 * at serve time, so we use these as literal values in the url_tags field.
 *
 * @param customParams - Override default UTM params. Keys are param names,
 *                       values are either static strings or Meta macros.
 * @returns URL query string (without leading '?') for the url_tags field.
 *          Example: "utm_source={{placement}}&utm_medium=cpc&utm_campaign={{campaign.name}}&..."
 */
export function buildUrlTags(customParams?: Record<string, string>): string {
  const params = { ...DEFAULT_UTM_PARAMS, ...(customParams ?? {}) };

  // Build manually to avoid encoding the {{ }} macros
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    parts.push(`${key}=${value}`);
  }
  return parts.join("&");
}

/**
 * Generate a preview URL showing how UTMs will look (with example values).
 */
export function previewUtmUrl(baseUrl: string, urlTags: string): string {
  const previewReplacements: Record<string, string> = {
    "{{placement}}": "ig_stories",
    "{{campaign.name}}": "SALES_CBO_SummerPromo_20260325",
    "{{adset.name}}": "SumPro_US-25-45_A",
    "{{ad.name}}": "SumPro-A_hero-video_sq_v1",
  };

  let previewTags = urlTags;
  for (const [macro, example] of Object.entries(previewReplacements)) {
    previewTags = previewTags.replaceAll(macro, example);
  }

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${previewTags}`;
}

export interface UtmParamDisplay {
  name: string;
  value: string;
  dynamic: boolean;
  description: string;
}

/**
 * Parse url_tags into a readable list for the UI.
 */
export function getUtmParamsDisplay(urlTags: string): UtmParamDisplay[] {
  const params: UtmParamDisplay[] = [];

  for (const pair of urlTags.split("&")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;

    const key = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    const isDynamic = value.includes("{{");

    params.push({
      name: key,
      value,
      dynamic: isDynamic,
      description: PARAM_DESCRIPTIONS[key] ?? "",
    });
  }

  return params;
}
