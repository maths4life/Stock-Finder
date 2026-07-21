"""Milestone 5 — fresh market database initialization.

The pre-Milestone-5 database contains development data for the old
8-company hardcoded universe. This script clears *market-generated* data
so the new ~100-company universe (Nifty 50 + Nifty Next 50) starts from a
clean slate, while leaving the schema, constraints, indexes, and every
piece of first-party/user-generated data untouched.

What this script clears (in FK-safe order — children before parents):
    scores
    technical_snapshot
    prices_daily
    shareholding_pattern
    financials_quarterly

What this script NEVER touches, under any circumstances:
    journal_entries
    journal_reviews
    pipeline_items
    news_articles / news_article_sectors / weekly_sector_intelligence
        (not market-generated in the fetch_prices/seed_fundamentals sense,
        and out of scope for this milestone regardless)

`companies` is a special case — see `clear_stale_companies()` below. It
is reference data, not itself "market-generated," but the old 8 dev
symbols shouldn't linger in it once the new universe is loaded (they'd
otherwise show up in Discover/Search with permanently stale scores, since
nothing will ever refresh them again). A `companies` row is deleted ONLY
if:
  1. it is NOT one of the ~100 symbols in the new universe CSV, AND
  2. no journal_entries or pipeline_items row references it (the FK-safety
     check that protects user-generated data).
Any old symbol that fails check 2 is left in place and reported, never
force-deleted — per the explicit instruction not to modify or delete
user-generated data without a genuine architectural reason. A handful of
leftover rows in that case is a cheap, visible trade-off; deleting
someone's journal history to make a demo universe "clean" is not.

Usage:
    python -m ingest.reset_market_data --dry-run     # report only, no writes
    python -m ingest.reset_market_data                # actually clear

This is a one-time (or rare, deliberate) operation — it is NOT part of
the scheduled daily cron (.github/workflows/ingest.yml) and should never
be added to it.
"""
import argparse

from sqlalchemy import bindparam, text

from ingest.db import get_engine
from ingest.universe import load_universe

# Order matters: children (tables that reference companies, or reference
# nothing) before anything that could conflict with an FK. None of these
# five actually reference each other, only `companies`, so any order among
# them is technically safe — listed in the same order as db/schema.sql for
# readability.
MARKET_TABLES = [
    "scores",
    "technical_snapshot",
    "prices_daily",
    "shareholding_pattern",
    "financials_quarterly",
]


def count_rows(engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"select count(*) from {table}")).scalar_one()


def clear_market_tables(engine, dry_run: bool) -> dict:
    """TRUNCATE (or count, in dry-run) every table in MARKET_TABLES.
    TRUNCATE, not DELETE — same schema/indexes/constraints remain, just
    empty, and it's a single fast operation instead of a row-by-row
    delete. Safe here because nothing outside MARKET_TABLES references
    these tables via FK."""
    counts = {}
    for table in MARKET_TABLES:
        before = count_rows(engine, table)
        counts[table] = before
        if dry_run:
            print(f"  [dry-run] would clear {table}: {before} row(s)")
            continue
        with engine.begin() as conn:
            conn.execute(text(f"truncate table {table}"))
        print(f"  cleared {table}: {before} row(s) removed")
    return counts


def find_referenced_symbols(engine, symbols: list) -> set:
    """Given a list of company symbols, return the subset that are
    referenced by at least one journal_entries or pipeline_items row —
    i.e. the ones that are NOT safe to delete from `companies`."""
    if not symbols:
        return set()
    referenced = set()
    for table in ("journal_entries", "pipeline_items"):
        query = text(f"select distinct symbol from {table} where symbol in :symbols").bindparams(
            bindparam("symbols", expanding=True)
        )
        with engine.connect() as conn:
            rows = conn.execute(query, {"symbols": symbols}).scalars().all()
        referenced.update(rows)
    return referenced


def clear_stale_companies(engine, new_universe_symbols: set, dry_run: bool) -> dict:
    """Delete companies rows that are (a) not part of the new universe and
    (b) not referenced by any journal_entries/pipeline_items row. See the
    module docstring for the full reasoning."""
    with engine.connect() as conn:
        existing = set(conn.execute(text("select symbol from companies")).scalars().all())

    stale = existing - new_universe_symbols
    if not stale:
        print("  no stale (pre-Milestone-5) company rows found — nothing to remove.")
        return {"stale_total": 0, "deleted": 0, "kept_due_to_references": []}

    referenced = find_referenced_symbols(engine, sorted(stale))
    deletable = sorted(stale - referenced)
    kept = sorted(stale & referenced)

    print(f"  {len(stale)} company row(s) outside the new universe found: {sorted(stale)}")
    if kept:
        print(
            f"  KEEPING {len(kept)} of them because journal_entries/pipeline_items "
            f"still reference them (never deleting user-generated data): {kept}"
        )

    if dry_run:
        print(f"  [dry-run] would delete {len(deletable)} company row(s): {deletable}")
        return {"stale_total": len(stale), "deleted": 0, "kept_due_to_references": kept}

    if deletable:
        query = text("delete from companies where symbol in :symbols").bindparams(
            bindparam("symbols", expanding=True)
        )
        with engine.begin() as conn:
            conn.execute(query, {"symbols": deletable})
        print(f"  deleted {len(deletable)} stale company row(s): {deletable}")

    return {"stale_total": len(stale), "deleted": len(deletable), "kept_due_to_references": kept}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be cleared/deleted without writing anything.",
    )
    parser.add_argument(
        "--skip-companies",
        action="store_true",
        help="Clear the market-data tables but leave the companies table alone "
             "(e.g. if you want to inspect stale rows manually before deciding).",
    )
    args = parser.parse_args()

    engine = get_engine()
    universe = load_universe()
    new_symbols = {c["symbol"] for c in universe}

    print(f"Loaded {len(new_symbols)} symbols from the new universe CSV.")
    print()
    print(f"{'[DRY RUN] ' if args.dry_run else ''}Clearing market-generated tables:")
    clear_market_tables(engine, args.dry_run)

    print()
    if args.skip_companies:
        print("Skipping companies table cleanup (--skip-companies).")
    else:
        print(f"{'[DRY RUN] ' if args.dry_run else ''}Reviewing companies table for stale (pre-Milestone-5) rows:")
        clear_stale_companies(engine, new_symbols, args.dry_run)

    print()
    print("Preserved untouched, as required: journal_entries, journal_reviews, "
          "pipeline_items, news_articles, news_article_sectors, "
          "weekly_sector_intelligence, and the schema itself (tables, "
          "constraints, indexes all unchanged).")
    if args.dry_run:
        print()
        print("This was a dry run — nothing was written. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    main()
