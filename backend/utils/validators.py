"""Input validation helpers."""
import re
from utils.constants import OBJECTIVE_MAP, CTA_OPTIONS


def validate_ad_account_id(account_id: str) -> str:
    """Ensure ad account ID is in the correct format."""
    cleaned = account_id.strip()
    if not cleaned.startswith("act_"):
        cleaned = f"act_{cleaned}"
    if not re.match(r"^act_\d+$", cleaned):
        raise ValueError(f"Invalid ad account ID format: {account_id}")
    return cleaned


def validate_objective(objective: str) -> str:
    """Map and validate campaign objective."""
    lower = objective.lower().strip()
    if lower in OBJECTIVE_MAP:
        return OBJECTIVE_MAP[lower]
    if objective.startswith("OUTCOME_"):
        return objective
    raise ValueError(
        f"Unknown objective: {objective}. "
        f"Valid: {list(OBJECTIVE_MAP.keys())}"
    )


def validate_cta(cta: str) -> str:
    """Validate CTA button type."""
    upper = cta.upper().strip()
    if upper in CTA_OPTIONS:
        return upper
    raise ValueError(f"Unknown CTA: {cta}. Valid: {CTA_OPTIONS}")


def extract_drive_folder_id(url: str) -> str:
    """Extract Google Drive folder ID from URL."""
    patterns = [
        r"folders/([a-zA-Z0-9_-]+)",
        r"id=([a-zA-Z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract folder ID from URL: {url}")
