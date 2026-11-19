"""
One-click migration script: Supabase (PostgreSQL) -> Turso (libSQL)

Usage:
    python backend/scripts/migrate_supabase_to_turso.py

Requirements in .env or environment:
    DATABASE_URL=postgresql://postgres:...@...supabase.com:5432/postgres
    TURSO_DATABASE_URL=libsql://stock-finder-<username>.turso.io
    TURSO_AUTH_TOKEN=<your-turso-jwt-token>
"""

import os
import sys
from pathlib import Path
from datetime import date, timedelta
import libsql
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()
load_dotenv(Path(__file__).parent.parent / ".env")


class LibsqlConnectionWrapper:
    """Lightweight DBAPI adapter allowing SQLAlchemy's SQLite dialect to seamlessly
    interact with modern libsql remote connections without requiring deprecated
    Rust compilation packages."""
    def __init__(self, conn):
        self._conn = conn

    def create_function(self, *args, **kwargs):
        pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_turso_engine(turso_url: str, auth_token: str):
    target = turso_url.strip()
    if target.startswith("libsql://"):
        target = target.replace("libsql://", "https://")
    elif not target.startswith("https://") and not target.startswith("file:"):
        target = f"https://{target}"

    return create_engine(
        "sqlite://",
        creator=lambda: LibsqlConnectionWrapper(libsql.connect(target, auth_token=auth_token)),
    )


def execute_migration(src_engine, turso_url: str, turso_token: str) -> dict:
    """Executes the data migration from src_engine (Supabase Postgres) to Turso."""
    report = {"status": "started", "tables": {}, "errors": []}

    dst_engine = get_turso_engine(turso_url, turso_token)

    # 1. Apply Schema
    schema_path = Path(__file__).parent.parent / "db" / "turso_schema.sql"
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    statements = [s.strip() for s in schema_sql.split(";") if s.strip()]
    with dst_engine.connect() as dst_conn:
        for stmt in statements:
            if stmt.startswith("--") and "\n" not in stmt:
                continue
            dst_conn.execute(text(stmt))
        dst_conn.commit()

    # 2. Migrate Tables in Dependency Order
    tables_to_migrate = [
        ("companies", "select * from companies"),
        ("financials_quarterly", "select * from financials_quarterly"),
        ("shareholding_pattern", "select * from shareholding_pattern"),
        ("financial_statements", "select * from financial_statements"),
        ("scores", "select * from scores"),
        ("technical_snapshot", "select * from technical_snapshot"),
        ("journal_entries", "select * from journal_entries"),
        ("journal_reviews", "select * from journal_reviews"),
        ("pipeline_items", "select * from pipeline_items"),
        ("news_articles", "select * from news_articles"),
        ("news_article_sectors", "select * from news_article_sectors"),
        ("weekly_sector_intelligence", "select * from weekly_sector_intelligence"),
    ]

    import math
    from decimal import Decimal
    from datetime import datetime

    for table_name, query in tables_to_migrate:
        try:
            with src_engine.connect() as src_conn:
                rows = [dict(r) for r in src_conn.execute(text(query)).mappings().all()]

            if not rows:
                report["tables"][table_name] = 0
                continue

            # Fetch columns that actually exist in Turso target table
            with dst_engine.connect() as dst_conn:
                cur = dst_conn.execute(text(f"PRAGMA table_info({table_name})"))
                target_cols = {row[1] for row in cur.fetchall()}

            clean_rows = []
            for r in rows:
                clean_r = {}
                for k, v in r.items():
                    if target_cols and k not in target_cols:
                        continue
                    if isinstance(v, (date, datetime)):
                        clean_r[k] = v.isoformat()
                    elif hasattr(v, "hex"):  # UUID
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

            cols = list(clean_rows[0].keys())
            col_names = ", ".join(cols)
            param_placeholders = ", ".join(f":{c}" for c in cols)
            insert_sql = text(f"INSERT OR REPLACE INTO {table_name} ({col_names}) VALUES ({param_placeholders})")

            chunk_size = 500
            with dst_engine.connect() as dst_conn:
                for i in range(0, len(clean_rows), chunk_size):
                    chunk = clean_rows[i : i + chunk_size]
                    dst_conn.execute(insert_sql, chunk)
                dst_conn.commit()

            report["tables"][table_name] = len(clean_rows)
        except Exception as e:
            report["errors"].append(f"{table_name}: {e}")

    # 3. Migrate prices_daily (recent 1 year = ~200k rows, fast and sufficient for all indicators)
    cutoff_date = (date.today() - timedelta(days=365)).isoformat()
    try:
        with src_engine.connect() as src_conn:
            prices_query = text("select * from prices_daily where date >= :cutoff::date order by date asc")
            price_rows = [dict(r) for r in src_conn.execute(prices_query, {"cutoff": cutoff_date}).mappings().all()]

        if price_rows:
            clean_price_rows = []
            for r in price_rows:
                clean_r = {}
                for k, v in r.items():
                    if isinstance(v, (date, datetime)):
                        clean_r[k] = v.isoformat()
                    elif isinstance(v, Decimal):
                        clean_r[k] = float(v)
                    elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                        clean_r[k] = None
                    else:
                        clean_r[k] = v
                clean_price_rows.append(clean_r)

            cols = list(clean_price_rows[0].keys())
            insert_sql = text(
                f"INSERT OR REPLACE INTO prices_daily ({', '.join(cols)}) VALUES ({', '.join(f':{c}' for c in cols)})"
            )

            chunk_size = 2000
            with dst_engine.connect() as dst_conn:
                for i in range(0, len(clean_price_rows), chunk_size):
                    chunk = clean_price_rows[i : i + chunk_size]
                    dst_conn.execute(insert_sql, chunk)
                dst_conn.commit()

            report["tables"]["prices_daily"] = len(clean_price_rows)
        else:
            report["tables"]["prices_daily"] = 0
    except Exception as e:
        report["errors"].append(f"prices_daily: {e}")

    report["status"] = "success" if not report["errors"] else "completed_with_errors"
    return report


def main():
    supabase_url = os.getenv("DATABASE_URL")
    turso_url = os.getenv("TURSO_DATABASE_URL")
    turso_token = os.getenv("TURSO_AUTH_TOKEN")

    if not supabase_url:
        print("ERROR: DATABASE_URL is not set.")
        sys.exit(1)
    if not turso_url or not turso_token:
        print("ERROR: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.")
        sys.exit(1)

    print("=" * 60)
    print("Stock Finder: Supabase -> Turso Migration")
    print("=" * 60)
    print(f"Target Turso: {turso_url}")

    src_engine = create_engine(supabase_url, pool_pre_ping=True)
    report = execute_migration(src_engine, turso_url, turso_token)

    print("\nMigration Results:")
    for tbl, count in report["tables"].items():
        print(f"  - {tbl:28}: {count:>6} rows")
    if report["errors"]:
        print("\nErrors encountered:")
        for err in report["errors"]:
            print(f"  ! {err}")
    else:
        print("\nAll data migrated successfully!")


if __name__ == "__main__":
    main()
