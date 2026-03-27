"""Post-deploy campaign management endpoints."""
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.campaign import Project, AdSet, Ad
from models.creative import Creative
from services.campaign_manager import CampaignManager
from services.meta_api import MetaAPIService
from services.claude_creative_analyzer import analyze_creative, analyze_carousel
from routers.auth import get_meta_token, get_meta_auth
from config import get_settings
import os

router = APIRouter(prefix="/api/manage", tags=["manage"])


class BudgetUpdate(BaseModel):
    daily_budget: Optional[float] = None
    lifetime_budget: Optional[float] = None


class AdSetCreateRequest(BaseModel):
    name: str
    targeting_json: str
    optimization_goal: str = "OFFSITE_CONVERSIONS"
    bid_strategy: str = "LOWEST_COST_WITHOUT_CAP"
    budget: Optional[float] = None
    placements_json: Optional[str] = None


class AdCreateRequest(BaseModel):
    name: str
    creative_id: int
    headline: str = ""
    primary_text: str = ""
    description: str = ""
    cta: str = "SHOP_NOW"
    url: Optional[str] = None


@router.put("/{project_id}/budget")
async def update_campaign_budget(
    project_id: int, data: BudgetUpdate, db: AsyncSession = Depends(get_db)
):
    """Update campaign budget (CBO)."""
    auth = await get_meta_auth(db)
    manager = CampaignManager(db, MetaAPIService(auth.access_token, page_id=auth.page_id or ""))
    return await manager.update_budget(project_id, data.daily_budget, data.lifetime_budget)


@router.put("/adset/{adset_id}/budget")
async def update_adset_budget(
    adset_id: int, daily_budget: float, db: AsyncSession = Depends(get_db)
):
    """Update ad set budget (ABO)."""
    auth = await get_meta_auth(db)
    manager = CampaignManager(db, MetaAPIService(auth.access_token, page_id=auth.page_id or ""))
    return await manager.update_adset_budget(adset_id, daily_budget)


@router.post("/{project_id}/adset")
async def add_adset_to_campaign(
    project_id: int, data: AdSetCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Add a new ad set to a deployed campaign."""
    auth = await get_meta_auth(db)
    manager = CampaignManager(db, MetaAPIService(auth.access_token, page_id=auth.page_id or ""))
    adset = await manager.add_adset(
        project_id=project_id,
        name=data.name,
        targeting_json=data.targeting_json,
        optimization_goal=data.optimization_goal,
        bid_strategy=data.bid_strategy,
        budget=data.budget,
        placements_json=data.placements_json,
    )
    return {
        "status": "created",
        "adset_id": adset.id,
        "meta_adset_id": adset.meta_adset_id,
        "generated_name": adset.generated_name,
    }


@router.post("/adset/{adset_id}/ad")
async def add_ad_to_adset(
    adset_id: int, data: AdCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Add a new ad to an existing ad set."""
    auth = await get_meta_auth(db)
    manager = CampaignManager(db, MetaAPIService(auth.access_token, page_id=auth.page_id or ""))
    ad = await manager.add_ad(
        adset_id=adset_id,
        name=data.name,
        creative_id=data.creative_id,
        headline=data.headline,
        primary_text=data.primary_text,
        description=data.description,
        cta=data.cta,
        url=data.url,
    )
    return {
        "status": "created",
        "ad_id": ad.id,
        "meta_ad_id": ad.meta_ad_id,
        "generated_name": ad.generated_name,
    }


@router.post("/{project_id}/analyze-creative")
async def analyze_new_creative(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload and analyze a new creative with AI.
    Returns recommendation for which ad set it should be placed in.
    User must confirm before any action is taken.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    # Save uploaded file
    settings = get_settings()
    upload_dir = os.path.join(settings.storage_path, str(project_id), "new_creatives")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Determine media type
    ext = os.path.splitext(file.filename)[1].lower()
    media_type = "video" if ext in {".mp4", ".mov", ".avi", ".mkv"} else "image"

    # Get campaign strategy from parsed structure
    strategy = ""
    if project.parsed_structure_json:
        parsed = json.loads(project.parsed_structure_json)
        strategy = f"Campaign: {parsed.get('campaign', {}).get('name', project.name)}\n"
        strategy += f"Objective: {project.campaign_objective}\n"
        strategy += "Ad Sets (each represents a different angle/audience):\n"
        for adset_data in parsed.get("ad_sets", []):
            strategy += f"- {adset_data.get('name', 'Unknown')}"
            if adset_data.get("description"):
                strategy += f": {adset_data['description']}"
            strategy += "\n"

    # Get existing ad sets
    adsets_result = await db.execute(
        select(AdSet).where(AdSet.project_id == project_id)
    )
    ad_sets = [
        {"id": a.id, "name": a.name, "description": a.generated_name}
        for a in adsets_result.scalars().all()
    ]

    # Analyze with AI
    try:
        analysis = await analyze_creative(file_path, media_type, strategy, ad_sets)
    except Exception as e:
        raise HTTPException(500, f"Creative analysis failed: {e}")

    # Save creative to DB (but don't assign to any ad set yet - user must confirm)
    from services.google_drive import GoogleDriveService
    creative = Creative(
        project_id=project_id,
        original_name=file.filename,
        base_name=os.path.splitext(file.filename)[0],
        media_type=media_type,
        local_path=file_path,
        file_size_bytes=os.path.getsize(file_path),
    )
    db.add(creative)
    await db.commit()
    await db.refresh(creative)

    return {
        "creative_id": creative.id,
        "filename": file.filename,
        "media_type": media_type,
        "analysis": analysis,
        "message": "Review the AI recommendation and confirm the placement.",
    }


class StatusUpdate(BaseModel):
    status: str  # "ACTIVE" or "PAUSED"


@router.put("/ad/{ad_id}/status")
async def update_ad_status(
    ad_id: int, data: StatusUpdate, db: AsyncSession = Depends(get_db)
):
    """Toggle ad status (ACTIVE/PAUSED)."""
    result = await db.execute(select(Ad).where(Ad.id == ad_id))
    ad = result.scalar_one_or_none()
    if not ad or not ad.meta_ad_id:
        raise HTTPException(404, "Ad not found or not deployed")

    auth = await get_meta_auth(db)
    meta = MetaAPIService(auth.access_token, page_id=auth.page_id or "")
    await meta.update_ad_status(ad.meta_ad_id, data.status)

    ad.status = data.status.lower()
    await db.commit()

    return {"status": "updated", "ad_id": ad.id, "new_status": data.status}


class CopyUpdate(BaseModel):
    headline: Optional[str] = None
    primary_text: Optional[str] = None
    description: Optional[str] = None


@router.put("/ad/{ad_id}/copy")
async def update_ad_copy(
    ad_id: int,
    data: CopyUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update ad copy (local DB only - requires re-deploy to sync to Meta)."""
    result = await db.execute(select(Ad).where(Ad.id == ad_id))
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(404, "Ad not found")

    if data.headline is not None:
        ad.headline = data.headline
    if data.primary_text is not None:
        ad.primary_text = data.primary_text
    if data.description is not None:
        ad.description = data.description

    await db.commit()
    return {"status": "updated", "ad_id": ad.id}
