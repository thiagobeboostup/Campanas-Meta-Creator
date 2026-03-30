"""Vercel serverless function entry point - wraps FastAPI app."""
import sys
import os
import traceback

# Add backend directory to Python path
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_dir)

# Override DB path to /tmp for Vercel (serverless has no persistent FS)
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///tmp/meta_ads_builder.db")

try:
    from main import app
except Exception as e:
    # If main app fails to import, create a minimal debug app
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
            "files_in_cwd": os.listdir("."),
            "backend_dir": backend_dir,
            "backend_exists": os.path.isdir(backend_dir),
            "backend_files": os.listdir(backend_dir) if os.path.isdir(backend_dir) else "NOT FOUND",
        }
