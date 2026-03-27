"""Rollback service for undoing Meta campaign deployments."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.campaign import Project, ProjectStatus
from models.job import DeployLog, DeployStep, DeployStatus
from services.meta_api import MetaAPIService

logger = logging.getLogger(__name__)

# Rollback order: reverse of creation order
ROLLBACK_ORDER = [
    DeployStep.ad,
    DeployStep.ad_creative,
    DeployStep.adset,
    DeployStep.campaign,
]

STEP_TO_ENTITY_TYPE = {
    DeployStep.ad: "ad",
    DeployStep.ad_creative: "ad_creative",
    DeployStep.adset: "adset",
    DeployStep.campaign: "campaign",
}


async def rollback_project(
    db: AsyncSession,
    meta_service: MetaAPIService,
    project_id: int,
    keep_partial: bool = False,
) -> dict:
    """
    Rollback a deployed project by deleting all created Meta entities.

    Args:
        keep_partial: If True, only rollback failed entities. If False, rollback everything.

    Returns:
        {"rolled_back": [...], "errors": [...]}
    """
    result = await db.execute(
        select(DeployLog)
        .where(DeployLog.project_id == project_id)
        .where(DeployLog.meta_id.isnot(None))
        .order_by(DeployLog.id.desc())
    )
    logs = list(result.scalars().all())

    if keep_partial:
        # Only rollback entries that are marked as failed
        logs = [l for l in logs if l.status == DeployStatus.failed]

    rolled_back = []
    errors = []

    # Process in reverse order (ads first, then adsets, then campaign)
    for step in ROLLBACK_ORDER:
        step_logs = [l for l in logs if l.step == step and l.status != DeployStatus.rolled_back]
        for log_entry in step_logs:
            entity_type = STEP_TO_ENTITY_TYPE.get(log_entry.step)
            if not entity_type or not log_entry.meta_id:
                continue

            # Skip creative uploads - they don't need rollback
            if log_entry.step == DeployStep.creative_upload:
                continue

            try:
                await meta_service.delete_entity(entity_type, log_entry.meta_id)
                log_entry.status = DeployStatus.rolled_back
                rolled_back.append({
                    "type": entity_type,
                    "meta_id": log_entry.meta_id,
                    "name": log_entry.entity_name,
                })
                logger.info(f"Rolled back {entity_type} {log_entry.meta_id}")
            except Exception as e:
                error_msg = f"Failed to rollback {entity_type} {log_entry.meta_id}: {e}"
                errors.append(error_msg)
                logger.error(error_msg)

    # Update project status
    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one_or_none()
    if project:
        project.status = ProjectStatus.failed
        project.meta_campaign_id = None

    await db.commit()

    return {"rolled_back": rolled_back, "errors": errors}
