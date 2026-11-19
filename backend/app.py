import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, OperationalError
from db.db import engine

from routes.companies import router as company_router
from routes.discover import router as discover_router
from routes.financial_statements import router as financial_statements_router
from routes.journal import router as journal_router
from routes.journal_reviews import router as journal_reviews_router
from routes.news import router as news_router
from routes.pipeline import router as pipeline_router
from routes.weekly_intelligence import router as weekly_intelligence_router

logger = logging.getLogger("stock_finder")

app = FastAPI(title="Stock Finder API")

# CORS configuration — allow the production frontend and any localhost dev
# server.  Using explicit origins (not "*") so browsers that send
# credentials still work, and we get a predictable
# Access-Control-Allow-Origin on every response — including error responses
# from the catch-all handler below.
_ALLOWED_ORIGINS = [
    "https://mjtradingtrackr.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(company_router)
app.include_router(discover_router)
app.include_router(financial_statements_router)
app.include_router(news_router)
app.include_router(weekly_intelligence_router)
app.include_router(journal_router)
app.include_router(journal_reviews_router)
app.include_router(pipeline_router)


# ---------------------------------------------------------------------------
# Global database error handler
# Without this, a dropped Postgres connection or Supabase timeout returns a
# raw 500 traceback to the frontend. This handler converts any SQLAlchemy
# DB-level exception into a clean, structured 503 JSON response that the
# frontend can distinguish from a 4xx application error and display a proper
# "backend unavailable" message.
# ---------------------------------------------------------------------------
@app.exception_handler(DBAPIError)
async def dbapi_exception_handler(request: Request, exc: DBAPIError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The database is temporarily unreachable. Please retry in a moment.",
            "error_type": "database_unavailable",
        },
    )


@app.exception_handler(OperationalError)
async def operational_exception_handler(request: Request, exc: OperationalError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The database connection failed. Please retry in a moment.",
            "error_type": "database_connection_error",
        },
    )


# ---------------------------------------------------------------------------
# Catch-all handler for any unhandled exception.
#
# Without this, a bug in service code (TypeError, KeyError, ValueError, etc.)
# produces a bare "Internal Server Error" text/plain response from Uvicorn's
# default handler — which does NOT pass through Starlette's CORS middleware,
# so the browser sees no Access-Control-Allow-Origin header and reports a
# misleading "CORS error" instead of the actual 500.
#
# By catching Exception here and returning a JSONResponse, the response goes
# back through the middleware stack normally, CORS headers are attached, and
# the frontend receives a structured JSON error it can display.
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s %s: %s\n%s",
        request.method,
        request.url.path,
        exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred. Please try again or contact support.",
            "error_type": "internal_server_error",
        },
    )


@app.get("/")
def home():
    return {"message": "Stock Finder Backend Running"}


@app.get("/test-db")
def test_db():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT NOW();"))
        return {"server_time": str(result.scalar())}


@app.get("/admin/sync-universe")
def sync_universe():
    """Syncs the universe CSV (including all newly classified sectors & industries)
    directly into the companies table and migrates journal schema."""
    from ingest.fetch_prices import ensure_company_rows
    ensure_company_rows(engine)
    with engine.begin() as conn:
        # Ensure entry_price column exists on journal_entries
        try:
            conn.execute(text("alter table journal_entries add column if not exists entry_price numeric"))
            conn.execute(text("""
                update journal_entries j
                set entry_price = coalesce(
                    (select p.close from prices_daily p where p.symbol = j.symbol and p.date <= j.created_at::date order by p.date desc limit 1),
                    (select t.close from technical_snapshot t where t.symbol = j.symbol limit 1)
                )
                where entry_price is null
            """))
        except Exception as e:
            logger.warning("Could not migrate journal_entries: %s", e)

        unclassified = conn.execute(
            text("select count(*) from companies where sector is null or sector = '' or sector = 'Unclassified'")
        ).scalar()
        unclassified_ind = conn.execute(
            text("select count(*) from companies where industry is null or industry = ''")
        ).scalar()
        total = conn.execute(text("select count(*) from companies")).scalar()
    return {
        "status": "ok",
        "total_companies": total,
        "unclassified_sector": unclassified,
        "unclassified_industry": unclassified_ind,
    }


@app.get("/admin/migrate-to-turso")
def admin_migrate_to_turso(
    turso_url: str = None,
    turso_token: str = None,
):
    """Cloud-to-cloud migration trigger: transfers all tables directly from
    Supabase Postgres into Turso over high-speed datacenter connections,
    bypassing local ISP port blocks."""
    import os
    from scripts.migrate_supabase_to_turso import execute_migration

    target_url = turso_url or os.getenv("TURSO_DATABASE_URL")
    target_token = turso_token or os.getenv("TURSO_AUTH_TOKEN")

    if not target_url or not target_token:
        return {
            "status": "error",
            "detail": "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be provided as query params or environment variables.",
        }

    report = execute_migration(src_engine=engine, turso_url=target_url, turso_token=target_token)
    return report


@app.get("/admin/migrate-table")
def admin_migrate_table(
    table: str = "financials_quarterly",
    turso_url: str = None,
    turso_token: str = None,
):
    """Migrate a single table on demand with granular error reporting."""
    import math
    import os
    import traceback
    from datetime import date, datetime
    from decimal import Decimal
    from scripts.migrate_supabase_to_turso import get_turso_engine

    target_url = turso_url or os.getenv("TURSO_DATABASE_URL")
    target_token = turso_token or os.getenv("TURSO_AUTH_TOKEN")
    if not target_url or not target_token:
        return {"status": "error", "detail": "Missing Turso credentials"}

    try:
        dst_engine = get_turso_engine(target_url, target_token)
        with engine.connect() as src_conn:
            rows = [dict(r) for r in src_conn.execute(text(f"select * from {table}")).mappings().all()]

        with dst_engine.connect() as dst_conn:
            cur = dst_conn.execute(text(f"PRAGMA table_info({table})"))
            target_cols = {row[1] for row in cur.fetchall()}

        clean_rows = []
        for r in rows:
            clean_r = {}
            for k, v in r.items():
                if target_cols and k not in target_cols:
                    continue
                if isinstance(v, (date, datetime)):
                    clean_r[k] = v.isoformat()
                elif hasattr(v, "hex"):
                    clean_r[k] = str(v)
                elif isinstance(v, Decimal):
                    clean_r[k] = float(v)
                elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    clean_r[k] = None
                elif isinstance(v, bool):
                    clean_r[k] = 1 if v else 0
                elif isinstance(v, (dict, list)):
                    import json
                    clean_r[k] = json.dumps(v)
                else:
                    clean_r[k] = v
            clean_rows.append(clean_r)

        if clean_rows:
            cols = list(clean_rows[0].keys())
            col_names = ", ".join(cols)
            param_placeholders = ", ".join(f":{c}" for c in cols)
            insert_sql = text(f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({param_placeholders})")

            with dst_engine.connect() as dst_conn:
                for i in range(0, len(clean_rows), 500):
                    chunk = clean_rows[i : i + 500]
                    dst_conn.execute(insert_sql, chunk)
                dst_conn.commit()

        return {"status": "success", "table": table, "migrated_rows": len(clean_rows)}
    except Exception as e:
        return {"status": "error", "table": table, "error": str(e), "traceback": traceback.format_exc()}


@app.get("/healthz")
def healthz():
    """Structured health check for monitoring and debugging.

    Returns:
    - status: "healthy" | "degraded" | "unhealthy"
    - db: connectivity + response time in ms
    - data_freshness: latest prices date and scores as_of_date, so you can
      tell at a glance whether last week's ingestion pipeline actually ran.
    - company_count: number of active companies tracked.
    """
    import time

    result = {"status": "healthy", "checks": {}}

    # --- DB connectivity ---
    t0 = time.monotonic()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_latency_ms = round((time.monotonic() - t0) * 1000, 1)
            result["checks"]["db"] = {"ok": True, "latency_ms": db_latency_ms}
    except Exception as exc:
        result["status"] = "unhealthy"
        result["checks"]["db"] = {"ok": False, "error": str(exc)}
        return JSONResponse(status_code=503, content=result)

    # --- Data freshness ---
    try:
        with engine.connect() as conn:
            price_row = conn.execute(
                text("SELECT max(date) as latest_date FROM prices_daily")
            ).mappings().first()

            scores_row = conn.execute(
                text("SELECT max(as_of_date) as latest_score_date FROM scores")
            ).mappings().first()

            company_row = conn.execute(
                text("SELECT count(*) as n FROM companies WHERE is_active")
            ).mappings().first()

            result["checks"]["data_freshness"] = {
                "latest_price_date": str(price_row["latest_date"]) if price_row["latest_date"] else None,
                "latest_score_date": str(scores_row["latest_score_date"]) if scores_row["latest_score_date"] else None,
                "active_company_count": int(company_row["n"]) if company_row["n"] else 0,
            }
    except Exception as exc:
        result["status"] = "degraded"
        result["checks"]["data_freshness"] = {"ok": False, "error": str(exc)}

    return result