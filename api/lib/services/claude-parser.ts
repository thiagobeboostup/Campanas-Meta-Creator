/**
 * Parse campaign structure documents using the Anthropic Claude API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ParsedCampaign {
  name: string;
  objective: string;
  budget_type: string;
  daily_budget: number | null;
  destination_url: string;
}

export interface ParsedTargeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: { countries?: string[] };
  interests?: Array<{ id: string; name: string }>;
  custom_audiences?: Array<Record<string, unknown>>;
  excluded_audiences?: Array<Record<string, unknown>>;
  lookalike_audiences?: Array<Record<string, unknown>>;
}

export interface ParsedAd {
  name: string;
  creative_ref: string;
  headline: string;
  primary_text: string;
  description?: string;
  cta: string;
  url: string;
}

export interface ParsedAdSet {
  name: string;
  description?: string;
  targeting: ParsedTargeting;
  optimization_goal: string;
  bid_strategy: string;
  budget_daily: number | null;
  placements: string | Record<string, string[]>;
  ads: ParsedAd[];
}

export interface ParsedStructure {
  campaign: ParsedCampaign;
  ad_sets: ParsedAdSet[];
}

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Meta Ads campaign structure parser. You receive text extracted from a marketing brief or media plan document and must extract the campaign structure as JSON.

RULES:
- Extract ALL ad sets, targeting, and ads defined in the document
- Each ad set represents a different angle, awareness level, audience segment, or test variant
- Each ad within an ad set has its own creative reference, copy (headline, primary_text, description), CTA, and URL
- The creative_ref should match the filename base of the creative files (without format suffix like _square, _vertical)
- If targeting details are not specified, use reasonable defaults
- If placements are not specified, use "automatic"
- Preserve the exact copy text from the document for headline, primary_text, and description fields

OUTPUT FORMAT - Return ONLY valid JSON matching this schema:
{
  "campaign": {
    "name": "Campaign Name",
    "objective": "OUTCOME_SALES",
    "budget_type": "CBO",
    "daily_budget": 50.0,
    "destination_url": "https://example.com"
  },
  "ad_sets": [
    {
      "name": "Ad Set Name",
      "description": "Brief description of this ad set's angle/purpose",
      "targeting": {
        "age_min": 18,
        "age_max": 65,
        "genders": [1, 2],
        "geo_locations": {"countries": ["ES"]},
        "interests": [{"id": "6003139266461", "name": "Fitness"}],
        "custom_audiences": [],
        "excluded_audiences": [],
        "lookalike_audiences": []
      },
      "optimization_goal": "OFFSITE_CONVERSIONS",
      "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
      "budget_daily": null,
      "placements": "automatic",
      "ads": [
        {
          "name": "Ad Name",
          "creative_ref": "creative_filename_base",
          "headline": "The headline text",
          "primary_text": "The primary ad copy text",
          "description": "Optional description",
          "cta": "SHOP_NOW",
          "url": "https://example.com"
        }
      ]
    }
  ]
}

Campaign-level fields:
- budget_type: "CBO" (Campaign Budget Optimization) or "ABO" (Ad Set Budget Optimization). CBO means budget set at campaign level, ABO means each ad set has its own budget.
- daily_budget: the daily budget in the document's currency
- destination_url: the landing page URL for ads

Valid objectives: OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT
Valid CTAs: SHOP_NOW, LEARN_MORE, SIGN_UP, BOOK_NOW, CONTACT_US, DOWNLOAD, GET_OFFER, GET_QUOTE, SUBSCRIBE, APPLY_NOW, BUY_NOW, GET_STARTED, ORDER_NOW, SEND_MESSAGE, WATCH_MORE
Valid optimization_goals: OFFSITE_CONVERSIONS, VALUE, LINK_CLICKS, LANDING_PAGE_VIEWS, IMPRESSIONS, REACH, LEAD_GENERATION, QUALITY_LEAD, POST_ENGAGEMENT, THRUPLAY, AD_RECALL_LIFT`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.includes("```json")) {
    cleaned = cleaned.split("```json")[1].split("```")[0].trim();
  } else if (cleaned.includes("```")) {
    cleaned = cleaned.split("```")[1].split("```")[0].trim();
  }
  return cleaned;
}

function validateStructure(parsed: Record<string, unknown>): ParsedStructure {
  const campaign = parsed.campaign as Record<string, unknown> | undefined;
  if (!campaign) {
    throw new Error("Missing 'campaign' key in parsed JSON");
  }
  const adSets = parsed.ad_sets as Array<Record<string, unknown>> | undefined;
  if (!adSets || !Array.isArray(adSets)) {
    throw new Error("Missing or invalid 'ad_sets' key in parsed JSON");
  }

  // Coerce into typed structure
  const typedCampaign: ParsedCampaign = {
    name: String(campaign.name ?? ""),
    objective: String(campaign.objective ?? "OUTCOME_SALES"),
    budget_type: String(campaign.budget_type ?? "CBO"),
    daily_budget:
      campaign.daily_budget != null ? Number(campaign.daily_budget) : null,
    destination_url: String(campaign.destination_url ?? ""),
  };

  const typedAdSets: ParsedAdSet[] = adSets.map((as) => {
    const targeting = (as.targeting ?? {}) as ParsedTargeting;
    const adsRaw = (as.ads ?? []) as Array<Record<string, unknown>>;
    const ads: ParsedAd[] = adsRaw.map((ad) => ({
      name: String(ad.name ?? ""),
      creative_ref: String(ad.creative_ref ?? ""),
      headline: String(ad.headline ?? ""),
      primary_text: String(ad.primary_text ?? ""),
      description: ad.description != null ? String(ad.description) : undefined,
      cta: String(ad.cta ?? "SHOP_NOW"),
      url: String(ad.url ?? ""),
    }));

    return {
      name: String(as.name ?? ""),
      description: as.description != null ? String(as.description) : undefined,
      targeting,
      optimization_goal: String(
        as.optimization_goal ?? "OFFSITE_CONVERSIONS",
      ),
      bid_strategy: String(as.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP"),
      budget_daily:
        as.budget_daily != null ? Number(as.budget_daily) : null,
      placements: (as.placements as string | Record<string, string[]>) ?? "automatic",
      ads,
    };
  });

  return { campaign: typedCampaign, ad_sets: typedAdSets };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function parseDocument(
  documentText: string,
): Promise<ParsedStructure> {
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Parse the following campaign brief into the JSON structure:\n\n${documentText}`,
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonString = extractJson(responseText);
  const parsedJson = JSON.parse(jsonString) as Record<string, unknown>;

  try {
    return validateStructure(parsedJson);
  } catch (validationError) {
    // Retry once with the validation errors
    const retryResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Parse the following campaign brief into the JSON structure:\n\n${documentText}`,
        },
        { role: "assistant", content: responseText },
        {
          role: "user",
          content: `The JSON had validation errors: ${String(validationError)}. Please fix and return valid JSON only.`,
        },
      ],
    });

    const retryText =
      retryResponse.content[0].type === "text"
        ? retryResponse.content[0].text
        : "";
    const retryJsonString = extractJson(retryText);
    const retryParsed = JSON.parse(retryJsonString) as Record<string, unknown>;
    return validateStructure(retryParsed);
  }
}

export function validateParsedCompleteness(
  structure: ParsedStructure | Record<string, unknown>,
): string[] {
  const missing: string[] = [];

  // Normalize access: support both typed and plain objects
  const campaign =
    "campaign" in structure
      ? (structure as Record<string, unknown>).campaign
      : undefined;

  if (!campaign) {
    missing.push("campaign");
    return missing;
  }

  const c = campaign as Record<string, unknown>;

  if (!c.name || !String(c.name).trim()) {
    missing.push("campaign_name");
  }
  if (!c.objective || !String(c.objective).trim()) {
    missing.push("campaign_objective");
  }
  if (!c.budget_type || !String(c.budget_type).trim()) {
    missing.push("budget_type");
  }
  if (c.daily_budget == null) {
    missing.push("daily_budget");
  }
  if (!c.destination_url || !String(c.destination_url).trim()) {
    missing.push("destination_url");
  }

  return missing;
}
