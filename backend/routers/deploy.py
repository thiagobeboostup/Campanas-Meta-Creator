"""Deploy and rollback endpoints."""
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.campaign import Project
from models.job import DeployLog
from services.campaign_builder import CampaignBuilder
from services.meta_api import MetaAPIService
from services.rollback import rollback_project
from routers.auth import get_meta_token, get_meta_auth

router = APIRouter(prefix="/api/deploy", tags=["deploy"])


@router.post("/{project_id}")
async def deploy_campaign(project_id: int, db: AsyncSession = Depends(get_db)):
    """Start deploying a campaign to Meta. Returns progress via SSE."""
    auth = await get_meta_auth(db)
    meta = MetaAPIService(auth.access_token, page_id=auth.page_id or "")
    builder = CampaignBuilder(db, meta)

    # Use SSE for real-time progress
    progress_queue: asyncio.Queue = asyncio.Queue()

    async def progress_callback(event):
        await progress_queue.put(event)

    builder.on_progress(progress_callback)

    async def event_stream():
        # Start deployment in background
        task = asyncio.create_task(_run_deploy(builder, project_id, progress_queue))

        while True:
            try:
                event = await asyncio.wait_for(progress_queue.get(), timeout=120)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("status") in ("complete", "error"):
                    break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'status': 'heartbeat'})}\n\n"

        await task

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _run_deploy(builder: CampaignBuilder, project_id: int, queue: asyncio.Queue):
    """Run deployment and signal completion."""
    try:
        result = await builder.deploy(project_id)
        await queue.put({
            "status": "complete",
            "success": result["success"],
            "campaign_id": result.get("campaign_id"),
            "errors": result.get("errors", []),
        })
    except Exception as e:
        await queue.put({"status": "error", "detail": str(e)})


@router.get("/{project_id}/status")
async def get_deploy_status(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get current deployment status."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    return {
        "status": project.status.value if project.status else "unknown",
        "campaign_id": project.meta_campaign_id,
    }


@router.post("/{project_id}/rollback")
async def rollback_deployment(
    project_id: int,
    keep_partial: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Rollback a deployed campaign."""
    auth = await get_meta_auth(db)
    meta = MetaAPIService(auth.access_token, page_id=auth.page_id or "")

    result = await rollback_project(db, meta, project_id, keep_partial)
    return result


@router.get("/{project_id}/log")
async def get_deploy_log(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get full deploy log."""
    result = await db.execute(
        select(DeployLog)
        .where(DeployLog.project_id == project_id)
        .order_by(DeployLog.created_at)
    )
    logs = list(result.scalars().all())
    return [
        {
            "id": l.id,
            "step": l.step.value,
            "entity_name": l.entity_name,
            "meta_id": l.meta_id,
            "status": l.status.value,
            "error_message": l.error_message,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
