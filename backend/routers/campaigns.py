"""Campaign/Project CRUD endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models.campaign import Project, AdSet, Ad
from schemas.campaign import ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.post("/", response_model=ProjectResponse)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    """Create a new campaign project."""
    from utils.validators import validate_ad_account_id, validate_objective

    account_id = validate_ad_account_id(data.ad_account_id)
    objective = validate_objective(data.campaign_objective)

    project = Project(
        name=data.name,
        campaign_objective=objective,
        budget_type=data.budget_type,
        daily_budget=data.daily_budget,
        lifetime_budget=data.lifetime_budget,
        ad_account_id=account_id,
        destination_url=data.destination_url,
    )
    db.add(project)
    await db.commit()

    # Reload with relationships to satisfy ProjectResponse
    result = await db.execute(
        select(Project)
        .where(Project.id == project.id)
        .options(selectinload(Project.ad_sets).selectinload(AdSet.ads))
    )
    return result.scalar_one()


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    """List all projects."""
    result = await db.execute(
        select(Project)
        .order_by(Project.created_at.desc())
        .options(selectinload(Project.ad_sets).selectinload(AdSet.ads))
    )
    return list(result.scalars().all())


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get project with full structure."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.ad_sets).selectinload(AdSet.ads)
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int, data: ProjectUpdate, db: AsyncSession = Depends(get_db)
):
    """Update project basics."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await db.commit()

    # Reload with relationships
    result2 = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.ad_sets).selectinload(AdSet.ads))
    )
    return result2.scalar_one()


@router.delete("/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    await db.delete(project)
    await db.commit()
    return {"status": "deleted"}
