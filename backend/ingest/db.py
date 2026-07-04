"""Shared DB connection. Reads DATABASE_URL from the environment.

Works with either Supabase or Neon's free-tier Postgres connection string,
e.g.:
  postgresql://user:password@host:5432/postgres
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError(
                "DATABASE_URL is not set. Copy .env.example to .env and fill "
                "in your Supabase/Neon connection string, or export it "
                "directly in your shell / GitHub Actions secrets."
            )
        _engine = create_engine(url, pool_pre_ping=True)
    return _engine
