"""Authentication endpoints for Meta and Google."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db
from models.auth import AuthToken, ProviderEnum, TokenTypeEnum
from pydantic import BaseModel as PydanticBaseModel
from schemas.auth import TokenCreate, AuthStatusResponse
from services.meta_api import MetaAPIService
from config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/meta/token")
async def set_meta_token(data: TokenCreate, db: AsyncSession = Depends(get_db)):
    """Set a long-lived Meta access token."""
    # Validate token
    try:
        meta = MetaAPIService(data.access_token)
        user_info = await meta.validate_token()
    except Exception as e:
        raise HTTPException(400, f"Invalid token: {e}")

    # Get ad accounts and pages
    try:
        accounts = await meta.get_ad_accounts()
    except Exception:
        accounts = []
    try:
        pages = await meta.get_pages()
    except Exception:
        pages = []

    # Remove existing Meta tokens
    await db.execute(delete(AuthToken).where(AuthToken.provider == ProviderEnum.meta))

    # Store new token
    token = AuthToken(
        provider=ProviderEnum.meta,
        token_type=TokenTypeEnum.long_lived,
        access_token=data.access_token,
        ad_account_id=data.ad_account_id,
        page_id=data.page_id,
    )
    db.add(token)
    await db.commit()

    return {
        "status": "connected",
        "user": user_info,
        "ad_accounts": accounts,
        "pages": pages,
    }


@router.get("/meta/pages")
async def get_meta_pages(db: AsyncSession = Depends(get_db)):
    """Get Facebook Pages accessible with the current token."""
    token = await get_meta_token(db)
    meta = MetaAPIService(token)
    pages = await meta.get_pages()
    return {"pages": pages}


class MetaConfigUpdate(PydanticBaseModel):
    ad_account_id: str | None = None
    page_id: str | None = None


@router.put("/meta/config")
async def update_meta_config(
    data: MetaConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update Meta ad account ID and/or page ID."""
    result = await db.execute(
        select(AuthToken).where(AuthToken.provider == ProviderEnum.meta)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(401, "Meta not authenticated")

    if data.ad_account_id is not None:
        token.ad_account_id = data.ad_account_id
    if data.page_id is not None:
        token.page_id = data.page_id

    await db.commit()
    return {"status": "updated", "ad_account_id": token.ad_account_id, "page_id": token.page_id}


@router.get("/meta/oauth/url")
async def get_meta_oauth_url():
    """Generate Meta OAuth login URL."""
    settings = get_settings()
    if not settings.meta_app_id:
        raise HTTPException(400, "META_APP_ID not configured")

    scopes = "ads_management,ads_read,business_management,pages_read_engagement"
    url = (
        f"https://www.facebook.com/v21.0/dialog/oauth?"
        f"client_id={settings.meta_app_id}"
        f"&redirect_uri={settings.base_url}/api/auth/meta/oauth/callback"
        f"&scope={scopes}"
        f"&response_type=code"
    )
    return {"url": url}


@router.get("/meta/oauth/callback")
async def meta_oauth_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle Meta OAuth callback and exchange code for long-lived token."""
    import httpx
    settings = get_settings()

    # Exchange code for short-lived token
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.facebook.com/v21.0/oauth/access_token",
            params={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "redirect_uri": "{settings.base_url}/api/auth/meta/oauth/callback",
                "code": code,
            },
        )
        data = resp.json()
        if "error" in data:
            raise HTTPException(400, data["error"].get("message", "OAuth failed"))
        short_token = data["access_token"]

    # Exchange for long-lived token
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.facebook.com/v21.0/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "fb_exchange_token": short_token,
            },
        )
        data = resp.json()
        if "error" in data:
            raise HTTPException(400, data["error"].get("message", "Token exchange failed"))
        long_token = data["access_token"]

    # Store token
    await db.execute(delete(AuthToken).where(AuthToken.provider == ProviderEnum.meta))
    token = AuthToken(
        provider=ProviderEnum.meta,
        token_type=TokenTypeEnum.oauth,
        access_token=long_token,
    )
    db.add(token)
    await db.commit()

    # Redirect to frontend
    from fastapi.responses import RedirectResponse
    frontend_url = settings.cors_origins.split(",")[0]
    return RedirectResponse(url=f"{frontend_url}/auth?meta=success")


class GoogleCredentials(PydanticBaseModel):
    credentials_json: str


@router.post("/google/service-account")
async def set_google_service_account(
    data: GoogleCredentials, db: AsyncSession = Depends(get_db)
):
    """Upload Google service account credentials."""
    import json
    try:
        json.loads(data.credentials_json)  # Validate JSON
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    credentials_json = data.credentials_json

    await db.execute(delete(AuthToken).where(AuthToken.provider == ProviderEnum.google))
    token = AuthToken(
        provider=ProviderEnum.google,
        token_type=TokenTypeEnum.service_account,
        access_token=credentials_json,
    )
    db.add(token)
    await db.commit()
    return {"status": "connected"}


@router.get("/status")
async def get_auth_status(db: AsyncSession = Depends(get_db)):
    """Check authentication status for all providers."""
    result = await db.execute(select(AuthToken))
    tokens = list(result.scalars().all())

    meta_token = next((t for t in tokens if t.provider == ProviderEnum.meta), None)
    google_token = next((t for t in tokens if t.provider == ProviderEnum.google), None)

    return AuthStatusResponse(
        meta_connected=meta_token is not None,
        meta_ad_account_id=meta_token.ad_account_id if meta_token else None,
        meta_page_id=meta_token.page_id if meta_token else None,
        meta_business_id=meta_token.business_id if meta_token else None,
        meta_business_name=meta_token.business_name if meta_token else None,
        google_connected=google_token is not None,
    )


async def get_meta_token(db: AsyncSession) -> str:
    """Helper: get the current Meta access token."""
    result = await db.execute(
        select(AuthToken).where(AuthToken.provider == ProviderEnum.meta)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(401, "Meta not authenticated. Please add a token first.")
    return token.access_token


async def get_meta_auth(db: AsyncSession) -> AuthToken:
    """Helper: get the full Meta auth record (token + page_id + ad_account_id)."""
    result = await db.execute(
        select(AuthToken).where(AuthToken.provider == ProviderEnum.meta)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(401, "Meta not authenticated. Please add a token first.")
    return token
