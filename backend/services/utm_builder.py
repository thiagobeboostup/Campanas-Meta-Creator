"""UTM parameter builder for Meta Ads using dynamic macros."""
from urllib.parse import urlencode


# Default UTM template using Meta dynamic macros
DEFAULT_UTM_PARAMS = {
    "utm_source": "{{placement}}",
    "utm_medium": "cpc",
    "utm_campaign": "{{campaign.name}}",
    "utm_content": "{{adset.name}}",
    "utm_term": "{{ad.name}}",
}


def build_url_tags(
    custom_params: dict | None = None,
) -> str:
    """
    Build the url_tags string for Meta ad creatives.

    Meta replaces dynamic macros like {{placement}}, {{campaign.name}}, etc.
    at serve time, so we use these as literal values in the url_tags field.

    Args:
        custom_params: Override default UTM params. Keys are param names,
                      values are either static strings or Meta macros.

    Returns:
        URL-encoded query string (without leading '?') for the url_tags field.
        Example: "utm_source={{placement}}&utm_medium=cpc&utm_campaign={{campaign.name}}&..."
    """
    params = {**DEFAULT_UTM_PARAMS}
    if custom_params:
        params.update(custom_params)

    # Build manually to avoid encoding the {{ }} macros
    parts = []
    for key, value in params.items():
        parts.append(f"{key}={value}")
    return "&".join(parts)


def preview_utm_url(base_url: str, url_tags: str) -> str:
    """Generate a preview URL showing how UTMs will look (with example values)."""
    preview_replacements = {
        "{{placement}}": "ig_stories",
        "{{campaign.name}}": "SALES_CBO_SummerPromo_20260325",
        "{{adset.name}}": "SumPro_US-25-45_A",
        "{{ad.name}}": "SumPro-A_hero-video_sq_v1",
    }

    preview_tags = url_tags
    for macro, example in preview_replacements.items():
        preview_tags = preview_tags.replace(macro, example)

    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{preview_tags}"


def get_utm_params_display(url_tags: str) -> list[dict]:
    """Parse url_tags into a readable list for the UI."""
    params = []
    for pair in url_tags.split("&"):
        if "=" in pair:
            key, value = pair.split("=", 1)
            is_dynamic = "{{" in value
            params.append({
                "name": key,
                "value": value,
                "dynamic": is_dynamic,
                "description": _get_param_description(key),
            })
    return params


def _get_param_description(param_name: str) -> str:
    descriptions = {
        "utm_source": "Origen de la campaña (placement dinámico de Meta)",
        "utm_medium": "Medio de campaña",
        "utm_campaign": "Nombre de la campaña",
        "utm_content": "Contenido de la campaña (nombre del ad set)",
        "utm_term": "Término (nombre del anuncio)",
    }
    return descriptions.get(param_name, "")
