"""Shared DB connection. Reads TURSO_DATABASE_URL / DATABASE_URL from the environment.
"""
from db.db import create_app_engine

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_app_engine()
    return _engine

