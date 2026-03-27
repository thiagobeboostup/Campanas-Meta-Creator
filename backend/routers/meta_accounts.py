"""Meta account selection and campaign listing endpoints."""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db
from models.auth import AuthToken, ProviderEnum
from models.campaign import Project, AdSet, Ad, ProjectStatus
from schemas.auth import AccountSelectionRequest, MetaCampaignSummary
from services.meta_api import MetaAPIService
from routers.auth import get_meta_token, get_meta_auth

router = APIRouter(prefix="/api/meta", tags=["meta-accounts"])


@router.get("/businesses")
async def list_businesses(db: AsyncSession = Depends(get_db)):
    """List all Business Portfolios accessible with the current token."""
    token = await get_meta_token(db)
    meta = MetaAPIService(token)
    businesses = await meta.get_businesses()
    return {"businesses": businesses}


@router.get("/businesses/{business_id}/ad-accounts")
async def list_business_ad_accounts(
    business_id: str, db: AsyncSession = Depends(get_db)
):
    """List ad accounts for a specific Business Portfolio."""
    token = await get_meta_token(db)
    meta = MetaAPIService(token)
    accounts = await meta.get_business_ad_accounts(business_id)
    return {"ad_accounts": accounts}


@router.get("/pages")
async def list_pages(db: AsyncSession = Depends(get_db)):
    """List Facebook Pages accessible with the current token."""
    token = await get_meta_token(db)
    meta = MetaAPIService(token)
    pages = await meta.get_pages()
    return {"pages": pages}


@router.post("/select-account")
async def select_account(
    data: AccountSelectionRequest, db: AsyncSession = Depends(get_db)
):
    """Save the selected business, ad account, and page."""
    result = await db.execute(
        select(AuthToken).where(AuthToken.provider == ProviderEnum.meta)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(401, "Meta not authenticated")

    token.business_id = data.business_id
    token.business_name = data.business_name
    token.ad_account_id = data.ad_account_id
    if data.page_id:
        token.page_id = data.page_id

    await db.commit()
    return {
        "status": "selected",
        "business_id": data.business_id,
        "business_name": data.business_name,
        "ad_account_id": data.ad_account_id,
        "page_id": token.page_id,
    }


@router.get("/campaigns/{ad_account_id}")
async def list_campaigns(ad_account_id: str, db: AsyncSession = Depends(get_db)):
    """List all campaigns (active + inactive) for an ad account."""
    token = await get_meta_token(db)
    meta = MetaAPIService(token)
    campaigns = await meta.get_campaigns(ad_account_id)
    return {"campaigns": campaigns}


@router.get("/campaign-structure/{campaign_id}")
async def get_campaign_structure(
    campaign_id: str, db: AsyncSession = Depends(get_db)
):
    """Fetch full campaign structure (campaign + ad sets + ads) for Modify mode."""
    token = await get_meta_token(db)
    meta = MetaAPIService(token)
    structure = await meta.get_campaign_structure(campaign_id)
    return structure


@router.post("/import-campaign/{campaign_id}")
async def import_campaign_for_editing(
    campaign_id: str,
    ad_account_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Import an existing Meta campaign into a local Project for editing."""
    auth = await get_meta_auth(db)
    meta = MetaAPIService(auth.access_token, page_id=auth.page_id or "")
    structure = await meta.get_campaign_structure(campaign_id)

    campaign_data = structure.get("campaign", {})

    # Create local Project
    project = Project(
        name=campaign_data.get("name", "Imported Campaign"),
        status=ProjectStatus.previewed,
        campaign_objective=campaign_data.get("objective"),
        daily_budget=float(campaign_data["daily_budget"]) / 100 if campaign_data.get("daily_budget") else None,
        lifetime_budget=float(campaign_data["lifetime_budget"]) / 100 if campaign_data.get("lifetime_budget") else None,
        ad_account_id=ad_account_id,
        business_id=auth.business_id,
        mode="modify",
        meta_source_campaign_id=campaign_id,
        meta_campaign_id=campaign_id,
    )
    db.add(project)
    await db.flush()

    # Create local AdSets and Ads
    for adset_data in structure.get("ad_sets", []):
        targeting = adset_data.get("targeting", {})
        adset = AdSet(
            project_id=project.id,
            name=adset_data.get("name", ""),
            generated_name=adset_data.get("name", ""),
            targeting_json=json.dumps(targeting) if isinstance(targeting, dict) else None,
            optimization_goal=adset_data.get("optimization_goal", "OFFSITE_CONVERSIONS"),
            bid_strategy=adset_data.get("bid_strategy", "LOWEST_COST_WITHOUT_CAP"),
            budget=float(adset_data["daily_budget"]) / 100 if adset_data.get("daily_budget") else None,
            meta_adset_id=adset_data.get("id"),
            status=adset_data.get("status", "PAUSED").lower(),
        )
        db.add(adset)
        await db.flush()

        for ad_data in adset_data.get("ads", []):
            ad = Ad(
                ad_set_id=adset.id,
                name=ad_data.get("name", ""),
                generated_name=ad_data.get("name", ""),
                meta_ad_id=ad_data.get("id"),
                status=ad_data.get("status", "PAUSED").lower(),
            )
            db.add(ad)

    await db.commit()
    await db.refresh(project)

    return {
        "project_id": project.id,
        "name": project.name,
        "mode": "modify",
        "ad_sets_count": len(structure.get("ad_sets", [])),
    }
