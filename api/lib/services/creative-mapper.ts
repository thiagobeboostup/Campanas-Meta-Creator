/**
 * Map creatives to Meta placements based on format (square/vertical/horizontal).
 */

// ── Constants ───────────────────────────────────────────────────────────────

interface FormatConfig {
  preferred: string;
  fallback: string | null;
}

const PLACEMENT_FORMAT_MAP: Record<string, FormatConfig> = {
  // Facebook
  facebook_feed: { preferred: "square", fallback: "horizontal" },
  facebook_stories: { preferred: "vertical", fallback: "square" },
  facebook_reels: { preferred: "vertical", fallback: null },
  facebook_right_column: { preferred: "horizontal", fallback: "square" },
  facebook_in_stream_video: { preferred: "horizontal", fallback: "square" },
  facebook_marketplace: { preferred: "square", fallback: "horizontal" },
  facebook_search: { preferred: "square", fallback: "horizontal" },
  facebook_video_feeds: { preferred: "square", fallback: "horizontal" },
  // Instagram
  instagram_feed: { preferred: "square", fallback: "vertical" },
  instagram_stories: { preferred: "vertical", fallback: null },
  instagram_reels: { preferred: "vertical", fallback: null },
  instagram_explore: { preferred: "square", fallback: "vertical" },
  instagram_explore_reels: { preferred: "vertical", fallback: null },
  instagram_profile_feed: { preferred: "square", fallback: "vertical" },
  // Audience Network
  audience_network_native: { preferred: "horizontal", fallback: "square" },
  audience_network_rewarded_video: { preferred: "vertical", fallback: "square" },
  // Messenger
  messenger_inbox: { preferred: "square", fallback: "horizontal" },
  messenger_stories: { preferred: "vertical", fallback: null },
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface CreativeVariant {
  id: number;
  original_name?: string;
  meta_image_hash?: string | null;
  meta_video_id?: string | null;
  [key: string]: unknown;
}

/** Index keyed by base_name, then by format */
export type CreativesByBaseName = Record<string, Record<string, CreativeVariant>>;

export interface PlacementMapping {
  placement: string;
  creative_id: number;
  creative_name: string;
  format: string;
  fallback: boolean;
}

export interface CreativeMappingResult {
  mappings: PlacementMapping[];
  warnings: string[];
  asset_customization_rules: Array<Record<string, unknown>>;
}

// ── CreativeMapper class ────────────────────────────────────────────────────

export class CreativeMapper {
  private creatives: CreativesByBaseName;

  constructor(creativesByBaseName: CreativesByBaseName) {
    this.creatives = creativesByBaseName;
  }

  /**
   * Generate placement-to-creative mapping for an ad.
   */
  getMappingForAd(
    creativeRef: string,
    selectedPlacements?: Record<string, string[]> | string | null,
  ): CreativeMappingResult {
    const creativeVariants = this.creatives[creativeRef];
    if (!creativeVariants) {
      return {
        mappings: [],
        warnings: [`No creatives found for reference: ${creativeRef}`],
        asset_customization_rules: [],
      };
    }

    const mappings: PlacementMapping[] = [];
    const warnings: string[] = [];

    let placementsToCheck = PLACEMENT_FORMAT_MAP;

    // Filter to selected placements if specified
    if (
      selectedPlacements &&
      selectedPlacements !== "automatic" &&
      typeof selectedPlacements === "object"
    ) {
      const filtered: Record<string, FormatConfig> = {};
      for (const [platform, placementList] of Object.entries(
        selectedPlacements,
      )) {
        for (const placement of placementList) {
          const key = `${platform}_${placement}`;
          if (key in PLACEMENT_FORMAT_MAP) {
            filtered[key] = PLACEMENT_FORMAT_MAP[key];
          }
        }
      }
      if (Object.keys(filtered).length > 0) {
        placementsToCheck = filtered;
      }
    }

    for (const [placementName, formatConfig] of Object.entries(
      placementsToCheck,
    )) {
      const { preferred, fallback } = formatConfig;

      if (preferred in creativeVariants) {
        mappings.push({
          placement: placementName,
          creative_id: creativeVariants[preferred].id,
          creative_name:
            creativeVariants[preferred].original_name ?? "",
          format: preferred,
          fallback: false,
        });
      } else if (fallback && fallback in creativeVariants) {
        mappings.push({
          placement: placementName,
          creative_id: creativeVariants[fallback].id,
          creative_name:
            creativeVariants[fallback].original_name ?? "",
          format: fallback,
          fallback: true,
        });
        warnings.push(
          `Using ${fallback} fallback for ${placementName} ` +
            `(missing ${preferred} format for '${creativeRef}')`,
        );
      } else {
        warnings.push(
          `No suitable creative for ${placementName} ` +
            `(needs ${preferred}, no fallback available for '${creativeRef}')`,
        );
      }
    }

    return {
      mappings,
      warnings,
      asset_customization_rules: this.buildAssetCustomization(
        mappings,
        creativeVariants,
      ),
    };
  }

  private buildAssetCustomization(
    mappings: PlacementMapping[],
    creativeVariants: Record<string, CreativeVariant>,
  ): Array<Record<string, unknown>> {
    // Group mappings by format/creative
    const formatToPlacements: Record<
      string,
      { creative_id: number; placements: string[] }
    > = {};

    for (const m of mappings) {
      if (!(m.format in formatToPlacements)) {
        formatToPlacements[m.format] = {
          creative_id: m.creative_id,
          placements: [],
        };
      }
      formatToPlacements[m.format].placements.push(m.placement);
    }

    const rules: Array<Record<string, unknown>> = [];

    for (const [fmt, data] of Object.entries(formatToPlacements)) {
      const customizationSpec: Record<string, unknown> = {
        publisher_platforms: [] as string[],
      };

      const fbPositions: string[] = [];
      const igPositions: string[] = [];

      for (const p of data.placements) {
        if (p.startsWith("facebook_")) {
          fbPositions.push(p.replace("facebook_", ""));
        } else if (p.startsWith("instagram_")) {
          igPositions.push(p.replace("instagram_", ""));
        }
      }

      const platforms = customizationSpec.publisher_platforms as string[];
      if (fbPositions.length > 0) {
        platforms.push("facebook");
        customizationSpec.facebook_positions = fbPositions;
      }
      if (igPositions.length > 0) {
        platforms.push("instagram");
        customizationSpec.instagram_positions = igPositions;
      }

      const rule: Record<string, unknown> = {
        customization_spec: customizationSpec,
      };

      const variant = creativeVariants[fmt];
      if (variant?.meta_image_hash) {
        rule.image_hash = variant.meta_image_hash;
      } else if (variant?.meta_video_id) {
        rule.video_id = variant.meta_video_id;
      }

      rules.push(rule);
    }

    return rules;
  }
}

// ── Standalone utility functions ────────────────────────────────────────────

/**
 * Build the creatives_by_base_name index from a flat list of creative records.
 */
export function buildCreativesIndex(
  creatives: Array<Record<string, unknown>>,
): CreativesByBaseName {
  const index: CreativesByBaseName = {};

  for (const c of creatives) {
    const base =
      (c.base_name as string) ??
      (c.original_name as string) ??
      "unknown";
    const fmt = c.format as string | undefined;
    if (!fmt) continue;

    if (!(base in index)) {
      index[base] = {};
    }
    index[base][fmt] = c as unknown as CreativeVariant;
  }

  return index;
}

/**
 * Assign creatives to ad sets based on folder structure or name matching.
 */
export function assignCreativesToAdSets(
  creatives: Array<Record<string, unknown>>,
  adsetNames: string[],
  adCreativeRefs: Record<string, string[]>,
  mode: "subfolder" | "flat" = "subfolder",
): Record<string, Array<Record<string, unknown>>> {
  const assignments: Record<string, Array<Record<string, unknown>>> = {};
  for (const name of adsetNames) {
    assignments[name] = [];
  }

  const unassigned: Array<Record<string, unknown>> = [];

  if (mode === "subfolder") {
    for (const creative of creatives) {
      let assigned = false;
      const creativeAdset = (creative.adset_name as string) ?? "";

      if (creativeAdset) {
        for (const name of adsetNames) {
          if (
            name.toLowerCase() === creativeAdset.toLowerCase() ||
            name.toLowerCase().includes(creativeAdset.toLowerCase()) ||
            creativeAdset.toLowerCase().includes(name.toLowerCase())
          ) {
            assignments[name].push(creative);
            assigned = true;
            break;
          }
        }
      }

      if (!assigned) {
        unassigned.push(creative);
      }
    }
  } else {
    // flat mode - match by creative name against strategy refs
    for (const creative of creatives) {
      let assigned = false;
      const cBase = (
        (creative.base_name as string) ??
        (creative.original_name as string) ??
        ""
      ).toLowerCase();

      for (const [adsetName, refs] of Object.entries(adCreativeRefs)) {
        for (const ref of refs) {
          if (
            ref.toLowerCase().includes(cBase) ||
            cBase.includes(ref.toLowerCase())
          ) {
            if (adsetName in assignments) {
              assignments[adsetName].push(creative);
              assigned = true;
              break;
            }
          }
        }
        if (assigned) break;
      }

      if (!assigned) {
        unassigned.push(creative);
      }
    }
  }

  if (unassigned.length > 0) {
    assignments["_sin_asignar"] = unassigned;
  }

  return assignments;
}
