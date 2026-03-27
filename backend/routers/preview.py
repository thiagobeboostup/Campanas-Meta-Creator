"""Preview endpoints: full campaign structure with names and creative mapping."""
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models.campaign import Project, AdSet, Ad, ProjectStatus
from models.creative import Creative
from services.naming import generate_all_names
from services.utm_builder import build_url_tags, preview_utm_url, get_utm_params_display
from services.creative_mapper import CreativeMapper, build_creatives_index

router = APIRouter(prefix="/api/preview", tags=["preview"])


@router.get("/{project_id}")
async def get_full_preview(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get complete preview: campaign tree + generated names + creative mapping + UTMs."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.ad_sets).selectinload(AdSet.ads))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    # Parse naming templates
    templates = json.loads(project.naming_template) if project.naming_template else None

    # Build ad_sets data for naming
    ad_sets_data = []
    for adset in project.ad_sets:
        ads_data = [
            {
                "name": ad.name,
                "creative_ref": ad.creative_ref or "",
                "format": "",
                "headline": ad.headline,
                "primary_text": ad.primary_text,
                "description": ad.description,
                "cta": ad.cta,
                "url": ad.url,
            }
            for ad in adset.ads
        ]
        ad_sets_data.append({
            "name": adset.name,
            "optimization_goal": adset.optimization_goal,
            "targeting_json": adset.targeting_json,
            "placements_json": adset.placements_json,
            "budget": adset.budget,
            "bid_strategy": adset.bid_strategy,
            "ads": ads_data,
        })

    # Generate names
    naming_result = generate_all_names(
        project_name=project.name,
        objective=project.campaign_objective or "OUTCOME_SALES",
        budget_type=project.budget_type.value if project.budget_type else "CBO",
        ad_sets=ad_sets_data,
        templates=templates,
    )

    # Update generated names in DB
    for i, adset in enumerate(project.ad_sets):
        if i < len(naming_result["ad_sets"]):
            adset.generated_name = naming_result["ad_sets"][i]["generated_name"]
            for j, ad in enumerate(adset.ads):
                if j < len(naming_result["ad_sets"][i]["ads"]):
                    ad.generated_name = naming_result["ad_sets"][i]["ads"][j]["generated_name"]
                    ad.url_tags = build_url_tags()

    await db.flush()

    # Build creative mapping
    creatives_result = await db.execute(
        select(Creative).where(Creative.project_id == project_id)
    )
    creatives = list(creatives_result.scalars().all())
    creative_list = [
        {"id": c.id, "base_name": c.base_name, "format": c.format.value if c.format else None,
         "original_name": c.original_name}
        for c in creatives
    ]
    index = build_creatives_index(creative_list)
    mapper = CreativeMapper(index)

    # Build preview
    url_tags = build_url_tags()
    base_url = project.destination_url or "https://example.com"

    preview = {
        "campaign": {
            "generated_name": naming_result["campaign_name"],
            "objective": project.campaign_objective,
            "budget_type": project.budget_type.value if project.budget_type else "CBO",
            "daily_budget": project.daily_budget,
            "lifetime_budget": project.lifetime_budget,
        },
        "utm_params": get_utm_params_display(url_tags),
        "utm_preview_url": preview_utm_url(base_url, url_tags),
        "ad_sets": [],
        "warnings": [],
    }

    for i, adset in enumerate(project.ad_sets):
        adset_preview = {
            "id": adset.id,
            "name": adset.name,
            "generated_name": adset.generated_name,
            "targeting": json.loads(adset.targeting_json) if adset.targeting_json else {},
            "optimization_goal": adset.optimization_goal,
            "budget": adset.budget,
            "ads": [],
        }

        for ad in adset.ads:
            mapping = mapper.get_mapping_for_ad(ad.creative_ref or "")
            ad_preview = {
                "id": ad.id,
                "name": ad.name,
                "generated_name": ad.generated_name,
                "creative_ref": ad.creative_ref,
                "headline": ad.headline,
                "primary_text": ad.primary_text,
                "cta": ad.cta,
                "url": ad.url,
                "url_tags": ad.url_tags,
                "creative_mapping": mapping["mappings"][:5],  # Top 5 placements
                "creative_warnings": mapping["warnings"],
            }
            adset_preview["ads"].append(ad_preview)
            preview["warnings"].extend(mapping["warnings"])

        preview["ad_sets"].append(adset_preview)

    project.status = ProjectStatus.previewed
    await db.commit()

    return preview


class NamingTemplateUpdate(BaseModel):
    campaign: Optional[str] = None
    adset: Optional[str] = None
    ad: Optional[str] = None


@router.put("/{project_id}/naming-template")
async def update_naming_template(
    project_id: int,
    templates: NamingTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update naming templates for a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    project.naming_template = json.dumps(templates.model_dump(exclude_unset=True))
    await db.commit()

    return {"status": "updated"}
