"""Vercel serverless function entry point - wraps FastAPI app."""
import sys
import os

# Add backend directory to Python path
backend_dir = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_dir)

# Override DB path to /tmp for Vercel (serverless has no persistent FS)
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///tmp/meta_ads_builder.db")

# Import the FastAPI app
from main import app
