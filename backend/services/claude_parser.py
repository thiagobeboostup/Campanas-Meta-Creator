"""Parse campaign structure documents using Claude API."""
import json
import anthropic
from config import get_settings
from schemas.document import ParsedStructure

SYSTEM_PROMPT = """You are a Meta Ads campaign structure parser. You receive text extracted from a marketing brief or media plan document and must extract the campaign structure as JSON.

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
Valid optimization_goals: OFFSITE_CONVERSIONS, VALUE, LINK_CLICKS, LANDING_PAGE_VIEWS, IMPRESSIONS, REACH, LEAD_GENERATION, QUALITY_LEAD, POST_ENGAGEMENT, THRUPLAY, AD_RECALL_LIFT"""


async def parse_document(document_text: str) -> ParsedStructure:
    """Parse a campaign document into a structured campaign plan."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        temperature=0,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Parse the following campaign brief into the JSON structure:\n\n{document_text}",
            }
        ],
    )

    response_text = response.content[0].text.strip()

    # Extract JSON from response (handle markdown code blocks)
    if "```json" in response_text:
        response_text = response_text.split("```json")[1].split("```")[0].strip()
    elif "```" in response_text:
        response_text = response_text.split("```")[1].split("```")[0].strip()

    parsed_json = json.loads(response_text)

    # Validate with Pydantic
    try:
        structure = ParsedStructure(**parsed_json)
    except Exception as validation_error:
        # Retry once with the validation errors
        retry_response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8192,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Parse the following campaign brief into the JSON structure:\n\n{document_text}",
                },
                {"role": "assistant", "content": response_text},
                {
                    "role": "user",
                    "content": f"The JSON had validation errors: {str(validation_error)}. Please fix and return valid JSON only.",
                },
            ],
        )
        retry_text = retry_response.content[0].text.strip()
        if "```json" in retry_text:
            retry_text = retry_text.split("```json")[1].split("```")[0].strip()
        elif "```" in retry_text:
            retry_text = retry_text.split("```")[1].split("```")[0].strip()

        parsed_json = json.loads(retry_text)
        structure = ParsedStructure(**parsed_json)

    return structure


def validate_parsed_completeness(structure) -> list[str]:
    """Check which required campaign fields are missing. Returns list of missing field names."""
    missing = []
    campaign = structure.campaign if hasattr(structure, 'campaign') else structure.get("campaign", {})

    # Check campaign-level required fields
    name = getattr(campaign, 'name', None) or campaign.get('name')
    if not name or not str(name).strip():
        missing.append("campaign_name")

    objective = getattr(campaign, 'objective', None) or campaign.get('objective')
    if not objective or not str(objective).strip():
        missing.append("campaign_objective")

    budget_type = getattr(campaign, 'budget_type', None) or campaign.get('budget_type')
    if not budget_type or not str(budget_type).strip():
        missing.append("budget_type")

    daily_budget = getattr(campaign, 'daily_budget', None) or campaign.get('daily_budget')
    if daily_budget is None:
        missing.append("daily_budget")

    destination_url = getattr(campaign, 'destination_url', None) or campaign.get('destination_url')
    if not destination_url or not str(destination_url).strip():
        missing.append("destination_url")

    return missing
