"""Campaign deployment orchestrator. Coordinates the full deploy pipeline."""
import json
import logging
import asyncio
from typing import Optional, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.campaign import Project, AdSet, Ad, ProjectStatus
from models.creative import Creative, UploadStatus
from models.job import DeployLog, DeployStep, DeployStatus
from services.meta_api import MetaAPIService
from services.creative_mapper import CreativeMapper, build_creatives_index
from services.naming import generate_all_names
from services.utm_builder import build_url_tags

logger = logging.getLogger(__name__)


class CampaignBuilder:
    def __init__(self, db: AsyncSession, meta_service: MetaAPIService):
        self.db = db
        self.meta = meta_service
        self._progress_callbacks: list = []

    def on_progress(self, callback):
        """Register a progress callback for SSE updates."""
        self._progress_callbacks.append(callback)

    async def _emit(self, step: str, entity: str, status: str, detail: str = ""):
        """Emit progress event to all listeners."""
        event = {"step": step, "entity": entity, "status": status, "detail": detail}
        for cb in self._progress_callbacks:
            await cb(event)

    async def _log(
        self, project_id: int, step: DeployStep, entity_name: str,
        meta_id: Optional[str] = None, status: DeployStatus = DeployStatus.success,
        error: Optional[str] = None,
    ):
        """Write to deploy_log table."""
        log = DeployLog(
            project_id=project_id, step=step, entity_name=entity_name,
            meta_id=meta_id, status=status, error_message=error,
        )
        self.db.add(log)
        await self.db.flush()

    async def deploy(self, project_id: int) -> dict:
        """Execute full deployment pipeline."""
        # Load project with all relationships
        result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project {project_id} not found")

        project.status = ProjectStatus.deploying
        await self.db.flush()

        account_id = project.ad_account_id
        errors = []

        try:
            # Step 1: Upload all creatives
            await self._emit("creative_upload", "all", "started")
            creatives = await self._load_creatives(project_id)
            for creative in creatives:
                try:
                    await self._upload_creative(creative, account_id, project_id)
                    await self._emit("creative_upload", creative.original_name, "success")
                except Exception as e:
                    error_msg = str(e)
                    await self._log(project_id, DeployStep.creative_upload,
                                    creative.original_name, status=DeployStatus.failed, error=error_msg)
                    await self._emit("creative_upload", creative.original_name, "failed", error_msg)
                    errors.append(f"Creative upload failed: {creative.original_name}: {error_msg}")

            # Step 2: Create campaign
            await self._emit("campaign", project.name, "started")
            campaign_id = await self.meta.create_campaign(
                account_id=account_id,
                name=project.name,
                objective=project.campaign_objective,
                budget_type=project.budget_type.value if project.budget_type else "CBO",
                daily_budget=project.daily_budget,
                lifetime_budget=project.lifetime_budget,
            )
            project.meta_campaign_id = campaign_id
            await self._log(project_id, DeployStep.campaign, project.name, campaign_id)
            await self._emit("campaign", project.name, "success", campaign_id)

            # Step 3: Create ad sets
            ad_sets = await self._load_adsets(project_id)
            for adset in ad_sets:
                try:
                    await self._deploy_adset(adset, account_id, campaign_id, project_id, project)
                except Exception as e:
                    error_msg = str(e)
                    await self._log(project_id, DeployStep.adset, adset.name,
                                    status=DeployStatus.failed, error=error_msg)
                    await self._emit("adset", adset.name, "failed", error_msg)
                    errors.append(f"Ad set creation failed: {adset.name}: {error_msg}")

            # Update project status
            project.status = ProjectStatus.deployed if not errors else ProjectStatus.failed
            await self.db.commit()

            return {
                "success": not errors,
                "campaign_id": campaign_id,
                "errors": errors,
            }

        except Exception as e:
            project.status = ProjectStatus.failed
            await self.db.commit()
            raise

    async def _upload_creative(self, creative: Creative, account_id: str, project_id: int):
        """Upload a single creative to Meta."""
        if creative.upload_status == UploadStatus.uploaded:
            return  # Already uploaded

        creative.upload_status = UploadStatus.uploading
        await self.db.flush()

        if creative.media_type.value == "image":
            image_hash = await self.meta.upload_image(account_id, creative.local_path)
            creative.meta_image_hash = image_hash
        else:
            video_id = await self.meta.upload_video(account_id, creative.local_path)
            creative.meta_video_id = video_id

        creative.upload_status = UploadStatus.uploaded
        await self._log(project_id, DeployStep.creative_upload,
                        creative.original_name, creative.meta_image_hash or creative.meta_video_id)
        await self.db.flush()

    async def _deploy_adset(
        self, adset: AdSet, account_id: str, campaign_id: str,
        project_id: int, project: Project,
    ):
        """Deploy a single ad set with all its ads."""
        targeting = json.loads(adset.targeting_json) if adset.targeting_json else {}
        placements = json.loads(adset.placements_json) if adset.placements_json else None

        await self._emit("adset", adset.generated_name or adset.name, "started")

        adset_id = await self.meta.create_adset(
            account_id=account_id,
            campaign_id=campaign_id,
            name=adset.generated_name or adset.name,
            optimization_goal=adset.optimization_goal,
            targeting=targeting,
            bid_strategy=adset.bid_strategy,
            daily_budget=adset.budget,
            placements=placements,
        )
        adset.meta_adset_id = adset_id
        adset.status = "deployed"
        await self._log(project_id, DeployStep.adset, adset.name, adset_id)
        await self._emit("adset", adset.generated_name or adset.name, "success", adset_id)

        # Create ads for this ad set
        ads = await self._load_ads(adset.id)
        for ad in ads:
            try:
                await self._deploy_ad(ad, account_id, adset_id, project_id, project)
            except Exception as e:
                error_msg = str(e)
                await self._log(project_id, DeployStep.ad, ad.name,
                                status=DeployStatus.failed, error=error_msg)
                await self._emit("ad", ad.name, "failed", error_msg)

        await self.db.flush()

    async def _deploy_ad(
        self, ad: Ad, account_id: str, adset_id: str,
        project_id: int, project: Project,
    ):
        """Deploy a single ad (create creative + ad)."""
        await self._emit("ad", ad.generated_name or ad.name, "started")

        # Build UTM tags
        url_tags = ad.url_tags or build_url_tags()

        # Get the primary creative for this ad
        creatives = await self._load_creatives(project_id)
        creative_list = [
            {
                "id": c.id, "base_name": c.base_name, "format": c.format.value if c.format else None,
                "original_name": c.original_name,
                "meta_image_hash": c.meta_image_hash, "meta_video_id": c.meta_video_id,
                "media_type": c.media_type.value if c.media_type else None,
            }
            for c in creatives
        ]
        index = build_creatives_index(creative_list)

        # Find the primary creative (prefer square for single creative)
        creative_ref = ad.creative_ref or ""
        variants = index.get(creative_ref, {})
        primary = variants.get("square") or variants.get("horizontal") or variants.get("vertical")

        if not primary:
            raise ValueError(f"No creative found for ref '{creative_ref}'")

        # Create ad creative
        creative_id = await self.meta.create_ad_creative(
            account_id=account_id,
            name=f"creative_{ad.generated_name or ad.name}",
            image_hash=primary.get("meta_image_hash"),
            video_id=primary.get("meta_video_id"),
            headline=ad.headline or "",
            primary_text=ad.primary_text or "",
            description=ad.description or "",
            cta=ad.cta or "SHOP_NOW",
            url=ad.url or project.destination_url or "",
            url_tags=url_tags,
        )
        ad.meta_creative_id = creative_id
        await self._log(project_id, DeployStep.ad_creative, ad.name, creative_id)

        # Create the ad
        meta_ad_id = await self.meta.create_ad(
            account_id=account_id,
            name=ad.generated_name or ad.name,
            adset_id=adset_id,
            creative_id=creative_id,
        )
        ad.meta_ad_id = meta_ad_id
        ad.status = "deployed"
        await self._log(project_id, DeployStep.ad, ad.name, meta_ad_id)
        await self._emit("ad", ad.generated_name or ad.name, "success", meta_ad_id)
        await self.db.flush()

    async def _load_creatives(self, project_id: int) -> list[Creative]:
        result = await self.db.execute(
            select(Creative).where(Creative.project_id == project_id)
        )
        return list(result.scalars().all())

    async def _load_adsets(self, project_id: int) -> list[AdSet]:
        result = await self.db.execute(
            select(AdSet).where(AdSet.project_id == project_id)
        )
        return list(result.scalars().all())

    async def _load_ads(self, adset_id: int) -> list[Ad]:
        result = await self.db.execute(
            select(Ad).where(Ad.ad_set_id == adset_id)
        )
        return list(result.scalars().all())
