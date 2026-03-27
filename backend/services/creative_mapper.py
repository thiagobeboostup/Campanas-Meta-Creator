"""Map creatives to Meta placements based on format (square/vertical/horizontal)."""
from typing import Optional
from utils.constants import PLACEMENT_FORMAT_MAP, FORMAT_ASPECT_RATIO


class CreativeMapper:
    def __init__(self, creatives_by_base_name: dict[str, dict[str, dict]]):
        """
        creatives_by_base_name: {
            "hero_video": {
                "square": {"id": 1, "meta_image_hash": "abc", ...},
                "vertical": {"id": 2, ...},
                "horizontal": {"id": 3, ...}
            }
        }
        """
        self.creatives = creatives_by_base_name

    def get_mapping_for_ad(
        self,
        creative_ref: str,
        selected_placements: Optional[dict] = None,
    ) -> dict:
        """
        Generate placement-to-creative mapping for an ad.

        Returns: {
            "mappings": [
                {"placement": "facebook_feed", "creative_id": 1, "format": "square", "fallback": False},
                ...
            ],
            "warnings": ["Missing vertical format for Stories placement"],
            "asset_customization_rules": [...] # For Meta API
        }
        """
        creative_variants = self.creatives.get(creative_ref, {})
        if not creative_variants:
            return {
                "mappings": [],
                "warnings": [f"No creatives found for reference: {creative_ref}"],
                "asset_customization_rules": [],
            }

        mappings = []
        warnings = []
        placements_to_check = PLACEMENT_FORMAT_MAP

        # Filter to selected placements if specified
        if selected_placements and selected_placements != "automatic":
            filtered = {}
            for platform, placement_list in selected_placements.items():
                for placement in placement_list:
                    key = f"{platform}_{placement}"
                    if key in PLACEMENT_FORMAT_MAP:
                        filtered[key] = PLACEMENT_FORMAT_MAP[key]
            placements_to_check = filtered if filtered else PLACEMENT_FORMAT_MAP

        for placement_name, format_config in placements_to_check.items():
            preferred = format_config["preferred"]
            fallback = format_config["fallback"]

            if preferred in creative_variants:
                mappings.append({
                    "placement": placement_name,
                    "creative_id": creative_variants[preferred]["id"],
                    "creative_name": creative_variants[preferred].get("original_name", ""),
                    "format": preferred,
                    "fallback": False,
                })
            elif fallback and fallback in creative_variants:
                mappings.append({
                    "placement": placement_name,
                    "creative_id": creative_variants[fallback]["id"],
                    "creative_name": creative_variants[fallback].get("original_name", ""),
                    "format": fallback,
                    "fallback": True,
                })
                warnings.append(
                    f"Using {fallback} fallback for {placement_name} "
                    f"(missing {preferred} format for '{creative_ref}')"
                )
            else:
                warnings.append(
                    f"No suitable creative for {placement_name} "
                    f"(needs {preferred}, no fallback available for '{creative_ref}')"
                )

        return {
            "mappings": mappings,
            "warnings": warnings,
            "asset_customization_rules": self._build_asset_customization(mappings, creative_variants),
        }

    def _build_asset_customization(
        self, mappings: list, creative_variants: dict
    ) -> list:
        """Build Meta API asset_customization_rules from mappings."""
        # Group mappings by format/creative
        format_to_placements = {}
        for m in mappings:
            fmt = m["format"]
            if fmt not in format_to_placements:
                format_to_placements[fmt] = {
                    "creative_id": m["creative_id"],
                    "placements": [],
                }
            format_to_placements[fmt]["placements"].append(m["placement"])

        rules = []
        for fmt, data in format_to_placements.items():
            # Convert placement names to Meta API format
            customization_spec = {
                "customization_spec": {
                    "publisher_platforms": [],
                },
            }
            # Map internal placement names back to Meta positions
            fb_positions = []
            ig_positions = []
            for p in data["placements"]:
                if p.startswith("facebook_"):
                    fb_positions.append(p.replace("facebook_", ""))
                elif p.startswith("instagram_"):
                    ig_positions.append(p.replace("instagram_", ""))

            if fb_positions:
                customization_spec["customization_spec"]["publisher_platforms"].append("facebook")
                customization_spec["customization_spec"]["facebook_positions"] = fb_positions
            if ig_positions:
                customization_spec["customization_spec"]["publisher_platforms"].append("instagram")
                customization_spec["customization_spec"]["instagram_positions"] = ig_positions

            variant = creative_variants.get(fmt, {})
            if variant.get("meta_image_hash"):
                customization_spec["image_hash"] = variant["meta_image_hash"]
            elif variant.get("meta_video_id"):
                customization_spec["video_id"] = variant["meta_video_id"]

            rules.append(customization_spec)

        return rules


def build_creatives_index(creatives: list[dict]) -> dict[str, dict[str, dict]]:
    """Build the creatives_by_base_name index from a list of creative records."""
    index = {}
    for c in creatives:
        base = c.get("base_name") or c.get("original_name", "unknown")
        fmt = c.get("format")
        if not fmt:
            continue
        if base not in index:
            index[base] = {}
        index[base][fmt] = c
    return index


def assign_creatives_to_adsets(
    creatives: list[dict],
    adset_names: list[str],
    ad_creative_refs: dict[str, list[str]],  # {adset_name: [creative_ref1, ...]}
    mode: str = "subfolder",
) -> dict[str, list[dict]]:
    """
    Assign creatives to ad sets based on folder structure or name matching.

    Args:
        creatives: list of creative dicts with keys: id, original_name, base_name, adset_name, ...
        adset_names: list of ad set names from parsed strategy
        ad_creative_refs: mapping of adset name to its creative_ref names from strategy
        mode: "subfolder" (group by adset_name field) or "flat" (match by name)

    Returns: {adset_name: [creative_dicts]}
    """
    assignments = {name: [] for name in adset_names}
    unassigned = []

    if mode == "subfolder":
        # Group by the adset_name field (set from subfolder during download)
        for creative in creatives:
            assigned = False
            creative_adset = creative.get("adset_name", "")
            if creative_adset:
                # Find best match among adset_names (case-insensitive partial match)
                for name in adset_names:
                    if (name.lower() == creative_adset.lower() or
                        name.lower() in creative_adset.lower() or
                        creative_adset.lower() in name.lower()):
                        assignments[name].append(creative)
                        assigned = True
                        break
            if not assigned:
                unassigned.append(creative)

    else:  # flat mode - match by creative name against strategy refs
        for creative in creatives:
            assigned = False
            c_base = (creative.get("base_name") or creative.get("original_name", "")).lower()

            for adset_name, refs in ad_creative_refs.items():
                for ref in refs:
                    if ref.lower() in c_base or c_base in ref.lower():
                        if adset_name in assignments:
                            assignments[adset_name].append(creative)
                            assigned = True
                            break
                if assigned:
                    break

            if not assigned:
                unassigned.append(creative)

    if unassigned:
        assignments["_sin_asignar"] = unassigned

    return assignments
