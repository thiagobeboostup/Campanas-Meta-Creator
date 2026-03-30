"""Meta Ads Campaign Builder - FastAPI Backend."""
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings
from database import init_db

# Ensure backend dir is in path for imports
sys.path.insert(0, os.path.dirname(__file__))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create DB tables
    await init_db()
    # Create storage directory
    os.makedirs(get_settings().storage_path, exist_ok=True)
    yield
    # Shutdown


app = FastAPI(
    title="Meta Ads Campaign Builder",
    description="Automate Meta Ads campaign creation from documents and Google Drive creatives",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from routers.auth import router as auth_router
from routers.campaigns import router as campaigns_router
from routers.documents import router as documents_router
from routers.creatives import router as creatives_router
from routers.preview import router as preview_router
from routers.deploy import router as deploy_router
from routers.manage import router as manage_router
from routers.meta_accounts import router as meta_accounts_router

app.include_router(auth_router)
app.include_router(campaigns_router)
app.include_router(documents_router)
app.include_router(creatives_router)
app.include_router(preview_router)
app.include_router(deploy_router)
app.include_router(manage_router)
app.include_router(meta_accounts_router)

# Serve creative files (thumbnails and originals) as static files
storage_path = os.path.abspath(settings.storage_path)
os.makedirs(storage_path, exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_path), name="storage")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# Serve frontend static files in production
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend SPA - all non-API routes return index.html."""
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
