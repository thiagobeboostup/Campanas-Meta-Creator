"""Meta Marketing API wrapper for campaign creation and management."""
import asyncio
import logging
from typing import Optional

try:
    from facebook_business.api import FacebookAdsApi
    from facebook_business.adobjects.adaccount import AdAccount
    from facebook_business.adobjects.campaign import Campaign
    from facebook_business.adobjects.adset import AdSet
    from facebook_business.adobjects.ad import Ad
    from facebook_business.adobjects.adcreative import AdCreative
    from facebook_business.adobjects.adimage import AdImage
    from facebook_business.adobjects.advideo import AdVideo
    from facebook_business.exceptions import FacebookRequestError
    FB_SDK_AVAILABLE = True
except Exception:
    FB_SDK_AVAILABLE = False

logger = logging.getLogger(__name__)

# Retry config
MAX_RETRIES = 3
RETRY_DELAYS = [5, 15, 45]


class MetaAPIService:
    def __init__(self, access_token: str, app_id: str = "", app_secret: str = "", page_id: str = ""):
        self.access_token = access_token
        self.page_id = page_id
        if FB_SDK_AVAILABLE:
            FacebookAdsApi.init(app_id, app_secret, access_token)

    async def get_pages(self) -> list[dict]:
        """Get Facebook Pages accessible with the current token."""
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://graph.facebook.com/v21.0/me/accounts",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name,access_token",
                    "limit": 100,
                },
            )
            data = resp.json()
            return data.get("data", [])

    async def get_businesses(self) -> list[dict]:
        """Get Business Manager accounts accessible with the current token."""
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://graph.facebook.com/v21.0/me/businesses",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name",
                    "limit": 100,
                },
            )
            data = resp.json()
            return data.get("data", [])

    async def get_business_ad_accounts(self, business_id: str) -> list[dict]:
        """Get ad accounts owned by a specific Business Manager."""
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://graph.facebook.com/v21.0/{business_id}/owned_ad_accounts",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name,account_status,currency,timezone_name",
                    "limit": 100,
                },
            )
            data = resp.json()
            return data.get("data", [])

    async def get_campaigns(self, ad_account_id: str) -> list[dict]:
        """Get all campaigns for an ad account."""
        import httpx
        if not ad_account_id.startswith("act_"):
            ad_account_id = f"act_{ad_account_id}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://graph.facebook.com/v21.0/{ad_account_id}/campaigns",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name,status,objective,daily_budget,lifetime_budget",
                    "limit": 500,
                },
            )
            data = resp.json()
            return data.get("data", [])

    async def get_campaign_structure(self, campaign_id: str) -> dict:
        """Fetch the full nested structure of a campaign (campaign -> ad sets -> ads)."""
        import httpx
        base_url = "https://graph.facebook.com/v21.0"
        async with httpx.AsyncClient() as client:
            # Fetch campaign details
            campaign_resp = await client.get(
                f"{base_url}/{campaign_id}",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name,status,objective,daily_budget,lifetime_budget",
                },
            )
            campaign_data = campaign_resp.json()

            # Fetch ad sets for the campaign
            adsets_resp = await client.get(
                f"{base_url}/{campaign_id}/adsets",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name,status,targeting,optimization_goal,bid_strategy,daily_budget",
                },
            )
            adsets_data = adsets_resp.json().get("data", [])

            # Fetch ads for each ad set concurrently
            async def fetch_ads(adset_id: str) -> list[dict]:
                ads_resp = await client.get(
                    f"{base_url}/{adset_id}/ads",
                    params={
                        "access_token": self.access_token,
                        "fields": "id,name,status,creative{id,name,effective_object_story_spec,url_tags}",
                    },
                )
                return ads_resp.json().get("data", [])

            ads_tasks = [fetch_ads(adset["id"]) for adset in adsets_data]
            ads_results = await asyncio.gather(*ads_tasks)

            # Combine ad sets with their ads
            ad_sets_with_ads = []
            for adset, ads in zip(adsets_data, ads_results):
                ad_sets_with_ads.append({**adset, "ads": ads})

            return {
                "campaign": campaign_data,
                "ad_sets": ad_sets_with_ads,
            }

    def _get_account(self, account_id: str) -> AdAccount:
        if not account_id.startswith("act_"):
            account_id = f"act_{account_id}"
        return AdAccount(account_id)

    async def _retry_api_call(self, func, *args, **kwargs):
        """Execute API call with retry logic for rate limits."""
        for attempt in range(MAX_RETRIES):
            try:
                return await asyncio.to_thread(func, *args, **kwargs)
            except FacebookRequestError as e:
                if e.api_error_code() == 17 and attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAYS[attempt]
                    logger.warning(f"Rate limit hit, retrying in {delay}s (attempt {attempt + 1})")
                    await asyncio.sleep(delay)
                else:
                    raise

    async def validate_token(self) -> dict:
        """Validate the access token and return account info."""
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://graph.facebook.com/v21.0/me",
                    params={"access_token": self.access_token, "fields": "id,name"},
                )
                return resp.json()
        except Exception as e:
            raise ValueError(f"Invalid token: {e}")

    async def get_ad_accounts(self) -> list:
        """Get all ad accounts accessible with the current token."""
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://graph.facebook.com/v21.0/me/adaccounts",
                params={
                    "access_token": self.access_token,
                    "fields": "id,name,account_status,currency,timezone_name",
                    "limit": 100,
                },
            )
            data = resp.json()
            return data.get("data", [])

    async def create_campaign(
        self,
        account_id: str,
        name: str,
        objective: str,
        budget_type: str = "CBO",
        daily_budget: Optional[float] = None,
        lifetime_budget: Optional[float] = None,
    ) -> str:
        """Create a campaign and return its ID."""
        account = self._get_account(account_id)
        params = {
            Campaign.Field.name: name,
            Campaign.Field.objective: objective,
            Campaign.Field.status: Campaign.Status.paused,
            Campaign.Field.special_ad_categories: [],
        }

        if budget_type == "CBO":
            params["campaign_budget_optimization"] = True
            if daily_budget:
                params[Campaign.Field.daily_budget] = int(daily_budget * 100)  # cents
            elif lifetime_budget:
                params[Campaign.Field.lifetime_budget] = int(lifetime_budget * 100)

        def _create():
            return account.create_campaign(params=params)

        result = await self._retry_api_call(_create)
        campaign_id = result["id"]
        logger.info(f"Created campaign {name} -> {campaign_id}")
        return campaign_id

    async def create_adset(
        self,
        account_id: str,
        campaign_id: str,
        name: str,
        optimization_goal: str,
        targeting: dict,
        bid_strategy: str = "LOWEST_COST_WITHOUT_CAP",
        daily_budget: Optional[float] = None,
        placements: Optional[dict] = None,
    ) -> str:
        """Create an ad set and return its ID."""
        account = self._get_account(account_id)
        params = {
            AdSet.Field.name: name,
            AdSet.Field.campaign_id: campaign_id,
            AdSet.Field.optimization_goal: optimization_goal,
            AdSet.Field.billing_event: "IMPRESSIONS",
            AdSet.Field.bid_strategy: bid_strategy,
            AdSet.Field.targeting: targeting,
            AdSet.Field.status: AdSet.Status.paused,
        }

        if daily_budget:
            params[AdSet.Field.daily_budget] = int(daily_budget * 100)

        # Handle placements
        if placements and placements != "automatic":
            publisher_platforms = []
            positions = {}
            for platform, placement_list in placements.items():
                publisher_platforms.append(platform)
                from utils.constants import META_PLACEMENT_POSITIONS
                platform_positions = META_PLACEMENT_POSITIONS.get(platform, {})
                mapped = [platform_positions[p] for p in placement_list if p in platform_positions]
                if mapped:
                    positions[f"{platform}_positions"] = mapped
            params[AdSet.Field.targeting]["publisher_platforms"] = publisher_platforms
            params[AdSet.Field.targeting].update(positions)

        def _create():
            return account.create_ad_set(params=params)

        result = await self._retry_api_call(_create)
        adset_id = result["id"]
        logger.info(f"Created ad set {name} -> {adset_id}")
        return adset_id

    async def upload_image(self, account_id: str, file_path: str) -> str:
        """Upload an image and return the image hash."""
        account = self._get_account(account_id)

        def _upload():
            image = AdImage(parent_id=account.get_id())
            image[AdImage.Field.filename] = file_path
            image.remote_create()
            return image[AdImage.Field.hash]

        image_hash = await self._retry_api_call(_upload)
        logger.info(f"Uploaded image {file_path} -> hash {image_hash}")
        return image_hash

    async def upload_video(self, account_id: str, file_path: str) -> str:
        """Upload a video and return the video ID. Polls until ready."""
        account = self._get_account(account_id)

        def _upload():
            video = AdVideo(parent_id=account.get_id())
            video[AdVideo.Field.filepath] = file_path
            video.remote_create()
            return video["id"]

        video_id = await self._retry_api_call(_upload)
        logger.info(f"Uploaded video {file_path} -> {video_id}, waiting for processing...")

        # Poll until ready (max 10 minutes)
        for _ in range(120):
            await asyncio.sleep(5)
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://graph.facebook.com/v21.0/{video_id}",
                    params={
                        "access_token": self.access_token,
                        "fields": "status",
                    },
                )
                status_data = resp.json().get("status", {})
                video_status = status_data.get("video_status")
                if video_status == "ready":
                    logger.info(f"Video {video_id} is ready")
                    return video_id
                if video_status == "error":
                    raise RuntimeError(f"Video processing failed: {status_data}")

        raise TimeoutError(f"Video {video_id} processing timed out after 10 minutes")

    async def create_ad_creative(
        self,
        account_id: str,
        name: str,
        image_hash: Optional[str] = None,
        video_id: Optional[str] = None,
        headline: str = "",
        primary_text: str = "",
        description: str = "",
        cta: str = "SHOP_NOW",
        url: str = "",
        url_tags: str = "",
        asset_customization: Optional[list] = None,
    ) -> str:
        """Create an ad creative and return its ID."""
        account = self._get_account(account_id)

        if not self.page_id:
            raise ValueError("page_id is required to create ad creatives. Set it in Auth settings.")

        object_story_spec = {
            "page_id": self.page_id,
            "link_data": {
                "message": primary_text,
                "link": url,
                "name": headline,
                "description": description,
                "call_to_action": {"type": cta, "value": {"link": url}},
            },
        }

        if image_hash:
            object_story_spec["link_data"]["image_hash"] = image_hash
        elif video_id:
            object_story_spec = {
                "page_id": self.page_id,
                "video_data": {
                    "video_id": video_id,
                    "message": primary_text,
                    "title": headline,
                    "link_description": description,
                    "call_to_action": {"type": cta, "value": {"link": url}},
                },
            }

        params = {
            AdCreative.Field.name: name,
            AdCreative.Field.object_story_spec: object_story_spec,
        }

        if url_tags:
            params[AdCreative.Field.url_tags] = url_tags

        # Placement Asset Customization for multi-format creatives
        if asset_customization:
            params["asset_feed_spec"] = {
                "images": [],
                "videos": [],
                "bodies": [{"text": primary_text}] if primary_text else [],
                "titles": [{"text": headline}] if headline else [],
                "descriptions": [{"text": description}] if description else [],
                "call_to_action_types": [cta],
                "link_urls": [{"website_url": url}] if url else [],
                "asset_customization_rules": asset_customization,
            }
            # Remove object_story_spec when using asset_feed_spec
            del params[AdCreative.Field.object_story_spec]

        def _create():
            return account.create_ad_creative(params=params)

        result = await self._retry_api_call(_create)
        creative_id = result["id"]
        logger.info(f"Created ad creative {name} -> {creative_id}")
        return creative_id

    async def create_ad(
        self,
        account_id: str,
        name: str,
        adset_id: str,
        creative_id: str,
    ) -> str:
        """Create an ad and return its ID."""
        account = self._get_account(account_id)
        params = {
            Ad.Field.name: name,
            Ad.Field.adset_id: adset_id,
            Ad.Field.creative: {"creative_id": creative_id},
            Ad.Field.status: Ad.Status.paused,
        }

        def _create():
            return account.create_ad(params=params)

        result = await self._retry_api_call(_create)
        ad_id = result["id"]
        logger.info(f"Created ad {name} -> {ad_id}")
        return ad_id

    # --- Management methods (post-deploy) ---

    async def update_campaign_budget(
        self, campaign_id: str, daily_budget: Optional[float] = None,
        lifetime_budget: Optional[float] = None
    ):
        """Update campaign budget (CBO)."""
        campaign = Campaign(campaign_id)
        params = {}
        if daily_budget is not None:
            params[Campaign.Field.daily_budget] = int(daily_budget * 100)
        if lifetime_budget is not None:
            params[Campaign.Field.lifetime_budget] = int(lifetime_budget * 100)

        def _update():
            campaign.api_update(params=params)

        await self._retry_api_call(_update)
        logger.info(f"Updated campaign {campaign_id} budget")

    async def update_adset_budget(self, adset_id: str, daily_budget: float):
        """Update ad set budget (ABO)."""
        adset = AdSet(adset_id)

        def _update():
            adset.api_update(params={AdSet.Field.daily_budget: int(daily_budget * 100)})

        await self._retry_api_call(_update)
        logger.info(f"Updated ad set {adset_id} budget to {daily_budget}")

    async def update_ad_status(self, ad_id: str, status: str):
        """Update ad status (ACTIVE, PAUSED)."""
        ad = Ad(ad_id)

        def _update():
            ad.api_update(params={Ad.Field.status: status})

        await self._retry_api_call(_update)

    async def delete_entity(self, entity_type: str, entity_id: str):
        """Delete a Meta entity for rollback."""
        entity_map = {
            "campaign": Campaign,
            "adset": AdSet,
            "ad": Ad,
            "ad_creative": AdCreative,
        }
        cls = entity_map.get(entity_type)
        if not cls:
            raise ValueError(f"Unknown entity type: {entity_type}")

        entity = cls(entity_id)

        def _delete():
            entity.api_delete()

        await self._retry_api_call(_delete)
        logger.info(f"Deleted {entity_type} {entity_id}")
