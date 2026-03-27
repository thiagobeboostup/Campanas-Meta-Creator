from pydantic import BaseModel
from typing import Optional, List


class TokenCreate(BaseModel):
    access_token: str
    ad_account_id: Optional[str] = None
    page_id: Optional[str] = None


class GoogleServiceAccountUpload(BaseModel):
    credentials_json: str  # JSON string of service account


class AuthStatusResponse(BaseModel):
    meta_connected: bool
    meta_ad_account_id: Optional[str] = None
    meta_page_id: Optional[str] = None
    meta_business_id: Optional[str] = None
    meta_business_name: Optional[str] = None
    google_connected: bool


class BusinessPortfolio(BaseModel):
    id: str
    name: str


class BusinessAdAccount(BaseModel):
    id: str
    name: str
    account_status: int = 1
    currency: str = "EUR"


class AccountSelectionRequest(BaseModel):
    business_id: str
    business_name: str
    ad_account_id: str
    page_id: Optional[str] = None


class MetaCampaignSummary(BaseModel):
    id: str
    name: str
    status: str
    objective: Optional[str] = None
    daily_budget: Optional[float] = None
