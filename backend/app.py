from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from db.db import engine

from routes.companies import router as company_router
from routes.discover import router as discover_router

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



@app.get("/")
def home():
    return {"message": "Stock Finder Backend Running"}


@app.get("/test-db")
def test_db():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT NOW();"))
        return {"server_time": str(result.scalar())}