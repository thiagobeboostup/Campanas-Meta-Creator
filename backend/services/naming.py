"""Auto-naming engine for campaigns, ad sets, and ads."""
from datetime import datetime
from typing import Optional
import re
import string

# Default naming templates
DEFAULT_TEMPLATES = {
    "campaign": "{objective}_{budget_type}_{name}_{date}",
    "adset": "{campaign_short}_{adset_name}_{optimization}_{variant}",
    "ad": "{adset_short}_{creative_ref}_{format}_{version}",
}


def _shorten(name: str, max_len: int = 15) -> str:
    """Create an abbreviated version of a name."""
    # Remove common words
    stop_words = {"de", "del", "la", "el", "los", "las", "the", "a", "an", "for", "and"}
    words = name.split()
    words = [w for w in words if w.lower() not in stop_words]

    if not words:
        return name[:max_len]

    # Try initials + first word
    if len(words) == 1:
        return words[0][:max_len]

    # CamelCase abbreviation
    abbr = "".join(w[0].upper() + w[1:3] for w in words[:4])
    return abbr[:max_len]


def _clean_name(name: str) -> str:
    """Clean a name for use in Meta (remove special chars)."""
    # Replace spaces with underscores, keep alphanumeric and some special chars
    cleaned = re.sub(r"[^a-zA-Z0-9_\-.]", "_", name)
    cleaned = re.sub(r"_+", "_", cleaned)  # collapse multiple underscores
    return cleaned.strip("_")


def generate_campaign_name(
    name: str,
    objective: str,
    budget_type: str,
    template: Optional[str] = None,
) -> str:
    """Generate campaign name from template."""
    tmpl = template or DEFAULT_TEMPLATES["campaign"]
    obj_short = objective.replace("OUTCOME_", "")
    date = datetime.now().strftime("%Y%m%d")

    result = tmpl.format(
        name=name,
        objective=obj_short,
        budget_type=budget_type,
        date=date,
    )
    return _clean_name(result)


def generate_adset_name(
    campaign_name: str,
    adset_name: str,
    optimization_goal: str,
    variant_index: int,
    template: Optional[str] = None,
) -> str:
    """Generate ad set name from template."""
    tmpl = template or DEFAULT_TEMPLATES["adset"]
    campaign_short = _shorten(campaign_name)

    # Variant letter: A, B, C, ...
    variant = string.ascii_uppercase[variant_index % 26]

    result = tmpl.format(
        campaign_short=campaign_short,
        adset_name=_shorten(adset_name),
        optimization=optimization_goal.replace("OFFSITE_", "").replace("_", "")[:8],
        variant=variant,
    )
    return _clean_name(result)


def generate_ad_name(
    adset_name: str,
    creative_ref: str,
    creative_format: str,
    version_index: int,
    template: Optional[str] = None,
) -> str:
    """Generate ad name from template."""
    tmpl = template or DEFAULT_TEMPLATES["ad"]
    adset_short = _shorten(adset_name)

    result = tmpl.format(
        adset_short=adset_short,
        creative_ref=creative_ref[:20],
        format=creative_format[:5] if creative_format else "multi",
        version=f"v{version_index + 1}",
    )
    return _clean_name(result)


def generate_all_names(
    project_name: str,
    objective: str,
    budget_type: str,
    ad_sets: list[dict],
    templates: Optional[dict] = None,
) -> dict:
    """Generate all names for a complete campaign structure.

    Returns: {
        "campaign_name": "...",
        "ad_sets": [
            {"generated_name": "...", "ads": [{"generated_name": "..."}]}
        ]
    }
    """
    campaign_tmpl = (templates or {}).get("campaign")
    adset_tmpl = (templates or {}).get("adset")
    ad_tmpl = (templates or {}).get("ad")

    campaign_name = generate_campaign_name(project_name, objective, budget_type, campaign_tmpl)

    result_sets = []
    for i, adset in enumerate(ad_sets):
        adset_gen_name = generate_adset_name(
            campaign_name, adset["name"], adset.get("optimization_goal", "CONVERSIONS"), i, adset_tmpl
        )
        ads = []
        for j, ad in enumerate(adset.get("ads", [])):
            ad_gen_name = generate_ad_name(
                adset_gen_name, ad.get("creative_ref", "creative"), ad.get("format", ""), j, ad_tmpl
            )
            ads.append({"generated_name": ad_gen_name, **ad})
        result_sets.append({"generated_name": adset_gen_name, "ads": ads, **adset})

    return {
        "campaign_name": campaign_name,
        "ad_sets": result_sets,
    }
