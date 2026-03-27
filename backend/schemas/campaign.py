from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    campaign_objective: str  # OUTCOME_SALES, OUTCOME_TRAFFIC, etc.
    budget_type: str = "CBO"
    daily_budget: Optional[float] = None
    lifetime_budget: Optional[float] = None
    ad_account_id: str
    destination_url: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    campaign_objective: Optional[str] = None
    budget_type: Optional[str] = None
    daily_budget: Optional[float] = None
    lifetime_budget: Optional[float] = None
    drive_folder_url: Optional[str] = None
    naming_template: Optional[str] = None
    destination_url: Optional[str] = None


class AdSetCreate(BaseModel):
    name: str
    targeting_json: Optional[str] = None
    placements_json: Optional[str] = None
    budget: Optional[float] = None
    bid_strategy: str = "LOWEST_COST_WITHOUT_CAP"
    optimization_goal: str = "OFFSITE_CONVERSIONS"


class AdCreate(BaseModel):
    name: str
    creative_ref: Optional[str] = None
    headline: Optional[str] = None
    primary_text: Optional[str] = None
    description: Optional[str] = None
    cta: str = "SHOP_NOW"
    url: Optional[str] = None


class AdResponse(BaseModel):
    id: int
    name: str
    generated_name: Optional[str] = None
    creative_ref: Optional[str] = None
    headline: Optional[str] = None
    primary_text: Optional[str] = None
    description: Optional[str] = None
    cta: str
    url: Optional[str] = None
    url_tags: Optional[str] = None
    meta_ad_id: Optional[str] = None
    status: str

    model_config = {"from_attributes": True}


class AdSetResponse(BaseModel):
    id: int
    name: str
    generated_name: Optional[str] = None
    targeting_json: Optional[str] = None
    placements_json: Optional[str] = None
    budget: Optional[float] = None
    bid_strategy: str
    optimization_goal: str
    meta_adset_id: Optional[str] = None
    status: str
    ads: List[AdResponse] = []

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: int
    name: str
    status: str
    campaign_objective: Optional[str] = None
    budget_type: str
    daily_budget: Optional[float] = None
    lifetime_budget: Optional[float] = None
    ad_account_id: Optional[str] = None
    drive_folder_url: Optional[str] = None
    meta_campaign_id: Optional[str] = None
    destination_url: Optional[str] = None
    created_at: Optional[datetime] = None
    ad_sets: List[AdSetResponse] = []

    model_config = {"from_attributes": True}
