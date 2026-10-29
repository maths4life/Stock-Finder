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

app = FastAPI(title="Stock Finder API")

# Dev-only permissive CORS so the Vite frontend (localhost, any port) can
# call this API. Tighten to specific origins before deploying anywhere
# public.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.get("/")
def home():
    return {"message": "Stock Finder Backend Running"}


@app.get("/test-db")
def test_db():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT NOW();"))
        return {"server_time": str(result.scalar())}


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