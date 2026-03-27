"""Document upload and AI parsing endpoints."""
import os
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.campaign import Project, AdSet, Ad, ProjectStatus
from schemas.document import ParsedStructure
from pydantic import BaseModel
from typing import Optional, Dict, Any
from services.claude_parser import parse_document, validate_parsed_completeness
from utils.file_processing import extract_text
from config import get_settings

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/{project_id}/upload")
async def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a campaign structure document (PDF, DOCX, TXT)."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    # Save file temporarily
    settings = get_settings()
    upload_dir = os.path.join(settings.storage_path, str(project_id), "docs")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Extract text
    try:
        text = extract_text(file_path)
    except ValueError as e:
        raise HTTPException(400, str(e))

    project.raw_document_text = text
    await db.commit()

    return {"status": "uploaded", "filename": file.filename, "text_length": len(text)}


@router.post("/{project_id}/parse")
async def parse_structure(project_id: int, db: AsyncSession = Depends(get_db)):
    """Parse the uploaded document with AI to extract campaign structure."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.raw_document_text:
        raise HTTPException(400, "No document uploaded. Upload a document first.")

    try:
        structure = await parse_document(project.raw_document_text)
    except Exception as e:
        raise HTTPException(500, f"AI parsing failed: {e}")

    # Save parsed structure JSON
    project.parsed_structure_json = structure.model_dump_json()

    # Update project from parsed campaign-level fields
    if structure.campaign.name:
        project.name = structure.campaign.name
    if structure.campaign.objective:
        project.campaign_objective = structure.campaign.objective
    if structure.campaign.budget_type:
        from models.campaign import BudgetType
        project.budget_type = BudgetType(structure.campaign.budget_type)
    if structure.campaign.daily_budget is not None:
        project.daily_budget = structure.campaign.daily_budget
    if structure.campaign.destination_url:
        project.destination_url = structure.campaign.destination_url

    # Create AdSet and Ad records from parsed structure
    # First, clear existing ad sets for this project
    existing_sets = await db.execute(select(AdSet).where(AdSet.project_id == project_id))
    for adset in existing_sets.scalars().all():
        await db.delete(adset)
    await db.flush()

    for parsed_adset in structure.ad_sets:
        adset = AdSet(
            project_id=project_id,
            name=parsed_adset.name,
            targeting_json=parsed_adset.targeting.model_dump_json(),
            placements_json=(
                json.dumps(parsed_adset.placements)
                if isinstance(parsed_adset.placements, dict)
                else None
            ),
            budget=parsed_adset.budget_daily,
            bid_strategy=parsed_adset.bid_strategy,
            optimization_goal=parsed_adset.optimization_goal,
        )
        db.add(adset)
        await db.flush()

        for parsed_ad in parsed_adset.ads:
            ad = Ad(
                ad_set_id=adset.id,
                name=parsed_ad.name,
                creative_ref=parsed_ad.creative_ref,
                headline=parsed_ad.headline,
                primary_text=parsed_ad.primary_text,
                description=parsed_ad.description,
                cta=parsed_ad.cta,
                url=parsed_ad.url,
            )
            db.add(ad)

    project.status = ProjectStatus.parsed
    await db.commit()

    # Check for missing required fields
    missing_fields = validate_parsed_completeness(structure)

    return {
        "status": "parsed",
        "structure": structure.model_dump(),
        "missing_fields": missing_fields,
        "ad_sets_count": len(structure.ad_sets),
        "total_ads": sum(len(s.ads) for s in structure.ad_sets),
    }


@router.get("/{project_id}/parsed")
async def get_parsed_structure(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get the parsed campaign structure."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.parsed_structure_json:
        raise HTTPException(400, "No parsed structure available")

    return json.loads(project.parsed_structure_json)


@router.put("/{project_id}/parsed")
async def update_parsed_structure(
    project_id: int,
    structure: ParsedStructure,
    db: AsyncSession = Depends(get_db),
):
    """Manually edit the parsed structure."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    project.parsed_structure_json = structure.model_dump_json()
    await db.commit()

    return {"status": "updated"}


class CompleteFieldsRequest(BaseModel):
    campaign_name: Optional[str] = None
    campaign_objective: Optional[str] = None
    budget_type: Optional[str] = None
    daily_budget: Optional[float] = None
    destination_url: Optional[str] = None


@router.post("/{project_id}/complete-fields")
async def complete_missing_fields(
    project_id: int,
    data: CompleteFieldsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Fill in missing required fields that weren't in the strategy document."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    if data.campaign_name:
        project.name = data.campaign_name
    if data.campaign_objective:
        project.campaign_objective = data.campaign_objective
    if data.budget_type:
        from models.campaign import BudgetType
        project.budget_type = BudgetType(data.budget_type)
    if data.daily_budget is not None:
        project.daily_budget = data.daily_budget
    if data.destination_url:
        project.destination_url = data.destination_url

    # Also update the parsed_structure_json if it exists
    if project.parsed_structure_json:
        parsed = json.loads(project.parsed_structure_json)
        campaign = parsed.get("campaign", {})
        if data.campaign_name:
            campaign["name"] = data.campaign_name
        if data.campaign_objective:
            campaign["objective"] = data.campaign_objective
        if data.budget_type:
            campaign["budget_type"] = data.budget_type
        if data.daily_budget is not None:
            campaign["daily_budget"] = data.daily_budget
        if data.destination_url:
            campaign["destination_url"] = data.destination_url
        parsed["campaign"] = campaign
        project.parsed_structure_json = json.dumps(parsed)

    await db.commit()

    # Verify completeness
    remaining = []
    if not project.name or not project.name.strip():
        remaining.append("campaign_name")
    if not project.campaign_objective:
        remaining.append("campaign_objective")
    if not project.budget_type:
        remaining.append("budget_type")
    if project.daily_budget is None:
        remaining.append("daily_budget")
    if not project.destination_url:
        remaining.append("destination_url")

    return {
        "status": "completed" if not remaining else "incomplete",
        "missing_fields": remaining,
    }
