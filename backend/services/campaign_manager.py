"""Post-deploy campaign management: edit budgets, add ad sets/ads to live campaigns."""
import json
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.campaign import Project, AdSet, Ad
from models.creative import Creative
from models.job import DeployLog, DeployStep, DeployStatus
from services.meta_api import MetaAPIService
from services.naming import generate_adset_name, generate_ad_name
from services.utm_builder import build_url_tags

logger = logging.getLogger(__name__)


class CampaignManager:
    def __init__(self, db: AsyncSession, meta_service: MetaAPIService):
        self.db = db
        self.meta = meta_service

    async def update_budget(
        self,
        project_id: int,
        daily_budget: Optional[float] = None,
        lifetime_budget: Optional[float] = None,
    ) -> dict:
        """Update campaign-level budget (CBO)."""
        project = await self._get_project(project_id)
        if not project.meta_campaign_id:
            raise ValueError("Campaign not deployed yet")

        await self.meta.update_campaign_budget(
            project.meta_campaign_id, daily_budget, lifetime_budget
        )

        if daily_budget is not None:
            project.daily_budget = daily_budget
        if lifetime_budget is not None:
            project.lifetime_budget = lifetime_budget
        await self.db.commit()

        return {"status": "updated", "campaign_id": project.meta_campaign_id}

    async def update_adset_budget(
        self, adset_id: int, daily_budget: float
    ) -> dict:
        """Update ad set budget (ABO)."""
        result = await self.db.execute(select(AdSet).where(AdSet.id == adset_id))
        adset = result.scalar_one_or_none()
        if not adset or not adset.meta_adset_id:
            raise ValueError("Ad set not found or not deployed")

        await self.meta.update_adset_budget(adset.meta_adset_id, daily_budget)
        adset.budget = daily_budget
        await self.db.commit()

        return {"status": "updated", "adset_id": adset.meta_adset_id}

    async def add_adset(
        self,
        project_id: int,
        name: str,
        targeting_json: str,
        optimization_goal: str = "OFFSITE_CONVERSIONS",
        bid_strategy: str = "LOWEST_COST_WITHOUT_CAP",
        budget: Optional[float] = None,
        placements_json: Optional[str] = None,
    ) -> AdSet:
        """Add a new ad set to a deployed campaign."""
        project = await self._get_project(project_id)
        if not project.meta_campaign_id:
            raise ValueError("Campaign not deployed yet")

        # Count existing ad sets for variant naming
        existing = await self.db.execute(
            select(AdSet).where(AdSet.project_id == project_id)
        )
        variant_index = len(list(existing.scalars().all()))

        generated_name = generate_adset_name(
            project.name, name, optimization_goal, variant_index
        )

        # Create in Meta
        targeting = json.loads(targeting_json)
        placements = json.loads(placements_json) if placements_json else None

        meta_adset_id = await self.meta.create_adset(
            account_id=project.ad_account_id,
            campaign_id=project.meta_campaign_id,
            name=generated_name,
            optimization_goal=optimization_goal,
            targeting=targeting,
            bid_strategy=bid_strategy,
            daily_budget=budget,
            placements=placements,
        )

        # Save to DB
        adset = AdSet(
            project_id=project_id,
            name=name,
            generated_name=generated_name,
            targeting_json=targeting_json,
            placements_json=placements_json,
            budget=budget,
            bid_strategy=bid_strategy,
            optimization_goal=optimization_goal,
            meta_adset_id=meta_adset_id,
            status="deployed",
        )
        self.db.add(adset)

        # Log
        log = DeployLog(
            project_id=project_id, step=DeployStep.adset,
            entity_name=name, meta_id=meta_adset_id, status=DeployStatus.success,
        )
        self.db.add(log)
        await self.db.commit()

        return adset

    async def add_ad(
        self,
        adset_id: int,
        name: str,
        creative_id: int,
        headline: str = "",
        primary_text: str = "",
        description: str = "",
        cta: str = "SHOP_NOW",
        url: Optional[str] = None,
    ) -> Ad:
        """Add a new ad to an existing ad set."""
        result = await self.db.execute(select(AdSet).where(AdSet.id == adset_id))
        adset = result.scalar_one_or_none()
        if not adset or not adset.meta_adset_id:
            raise ValueError("Ad set not found or not deployed")

        project = await self._get_project(adset.project_id)

        # Get creative info
        creative_result = await self.db.execute(
            select(Creative).where(Creative.id == creative_id)
        )
        creative = creative_result.scalar_one_or_none()
        if not creative:
            raise ValueError(f"Creative {creative_id} not found")

        # Ensure creative is uploaded
        if not creative.meta_image_hash and not creative.meta_video_id:
            # Upload it first
            if creative.media_type and creative.media_type.value == "image":
                creative.meta_image_hash = await self.meta.upload_image(
                    project.ad_account_id, creative.local_path
                )
            else:
                creative.meta_video_id = await self.meta.upload_video(
                    project.ad_account_id, creative.local_path
                )

        # Count existing ads for version naming
        existing_ads = await self.db.execute(
            select(Ad).where(Ad.ad_set_id == adset_id)
        )
        version_index = len(list(existing_ads.scalars().all()))

        generated_name = generate_ad_name(
            adset.generated_name or adset.name,
            creative.base_name or name,
            creative.format.value if creative.format else "",
            version_index,
        )

        url_tags = build_url_tags()
        final_url = url or project.destination_url or ""

        # Create creative in Meta
        meta_creative_id = await self.meta.create_ad_creative(
            account_id=project.ad_account_id,
            name=f"creative_{generated_name}",
            image_hash=creative.meta_image_hash,
            video_id=creative.meta_video_id,
            headline=headline,
            primary_text=primary_text,
            description=description,
            cta=cta,
            url=final_url,
            url_tags=url_tags,
        )

        # Create ad in Meta
        meta_ad_id = await self.meta.create_ad(
            account_id=project.ad_account_id,
            name=generated_name,
            adset_id=adset.meta_adset_id,
            creative_id=meta_creative_id,
        )

        # Save to DB
        ad = Ad(
            ad_set_id=adset_id,
            name=name,
            generated_name=generated_name,
            creative_ref=creative.base_name,
            headline=headline,
            primary_text=primary_text,
            description=description,
            cta=cta,
            url=final_url,
            url_tags=url_tags,
            meta_ad_id=meta_ad_id,
            meta_creative_id=meta_creative_id,
            status="deployed",
        )
        self.db.add(ad)

        log = DeployLog(
            project_id=project.id, step=DeployStep.ad,
            entity_name=name, meta_id=meta_ad_id, status=DeployStatus.success,
        )
        self.db.add(log)
        await self.db.commit()

        return ad

    async def _get_project(self, project_id: int) -> Project:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project {project_id} not found")
        return project
