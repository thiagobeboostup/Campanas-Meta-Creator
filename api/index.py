"""Vercel serverless function entry point."""
import sys
import os
import traceback

# The entire project root is available in Vercel's serverless environment
project_root = os.getcwd()
backend_dir = os.path.join(project_root, "backend")
sys.path.insert(0, backend_dir)

# Vercel serverless: use /tmp for DB and storage
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///tmp/meta_ads_builder.db")

try:
    from main import app
except Exception as e:
    from fastapi import FastAPI
    app = FastAPI()
    error_detail = traceback.format_exc()

    @app.get("/api/{path:path}")
    @app.post("/api/{path:path}")
    @app.put("/api/{path:path}")
    @app.delete("/api/{path:path}")
    async def debug_error(path: str):
        return {
            "error": "App failed to start",
            "detail": str(e),
            "traceback": error_detail.split("\n"),
            "project_root": project_root,
            "backend_dir": backend_dir,
            "backend_exists": os.path.isdir(backend_dir),
            "cwd_files": sorted(os.listdir(project_root))[:20],
        }
