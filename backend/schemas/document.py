from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ParsedAd(BaseModel):
    name: str
    creative_ref: str  # matches base_name of creative file
    headline: Optional[str] = None
    primary_text: Optional[str] = None
    description: Optional[str] = None
    cta: str = "SHOP_NOW"
    url: Optional[str] = None


class TargetingSpec(BaseModel):
    age_min: int = 18
    age_max: int = 65
    genders: List[int] = [1, 2]  # 1=male, 2=female
    geo_locations: Dict[str, Any] = {"countries": ["ES"]}
    interests: List[Dict[str, str]] = []
    custom_audiences: List[Dict[str, str]] = []
    excluded_audiences: List[Dict[str, str]] = []
    lookalike_audiences: List[Dict[str, str]] = []


class ParsedAdSet(BaseModel):
    name: str
    description: Optional[str] = None  # angle, awareness level, etc.
    targeting: TargetingSpec = TargetingSpec()
    optimization_goal: str = "OFFSITE_CONVERSIONS"
    bid_strategy: str = "LOWEST_COST_WITHOUT_CAP"
    budget_daily: Optional[float] = None
    placements: str | Dict[str, List[str]] = "automatic"
    ads: List[ParsedAd] = []


class ParsedCampaign(BaseModel):
    name: str
    objective: str = "OUTCOME_SALES"
    budget_type: Optional[str] = None  # "CBO" or "ABO"
    daily_budget: Optional[float] = None
    destination_url: Optional[str] = None


class ParsedStructure(BaseModel):
    campaign: ParsedCampaign
    ad_sets: List[ParsedAdSet] = []
