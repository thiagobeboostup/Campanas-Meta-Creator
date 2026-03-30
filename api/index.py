"""Vercel serverless function entry point."""
import sys
import os
import traceback

# Backend files are copied into this directory during build
api_dir = os.path.dirname(__file__)
sys.path.insert(0, api_dir)

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
    async def debug_error(path: str):
        return {
            "error": "App failed to start",
            "detail": str(e),
            "traceback": error_detail,
            "cwd": os.getcwd(),
            "api_dir": api_dir,
            "api_files": os.listdir(api_dir)[:30],
        }
