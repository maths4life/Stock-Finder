# Milestone 5 — Implementation Summary

Full detail lives in `md/CHANGELOG.md`, `md/CURRENT_MILESTONE.md`, `md/TECHNICAL_DEBT.md` (TD-023–026), and `md/DECISIONS.md` (ADR-015) inside the zip. This is a quick-reference summary.

## What changed

| File | Change |
|---|---|
| `backend/backend/data/universe_top100.csv` | **New.** Nifty 50 + Nifty Next 50, 100 companies. |
| `backend/backend/ingest/universe.py` | Rewritten: hardcoded list → `load_universe()` CSV loader. |
| `backend/backend/ingest/fetch_prices.py` | Uses the loader; now incremental (only fetches new trading days per symbol); `--full-refetch` flag added; writes `index_membership`/`is_active`. |
| `backend/backend/ingest/compute_technicals.py`, `compute_scores.py` | **No logic changes** — already universe-size-agnostic. |
| `backend/backend/db/schema.sql` | Additive `companies.index_membership` column. |
| `backend/backend/services/company_service.py` | `get_all_companies` now filters `where c.is_active` (list path only). |
| `backend/backend/ingest/reset_market_data.py` | **New.** One-time fresh-DB-init script — clears market tables + stale pre-Milestone-5 companies (FK-safety checked against journal/pipeline data). `--dry-run`, `--skip-companies`. |
| `frontend/src/routes/index.tsx` | Removed hardcoded "Eight companies..." copy. |

## Before you run it

```bash
# 1. See what would happen, without writing anything
python -m ingest.reset_market_data --dry-run

# 2. Actually clear market tables + stale companies rows
python -m ingest.reset_market_data

# 3. Populate the fresh universe (incremental-aware; full backfill on first run)
python -m ingest.fetch_prices

# 4. Fundamentals (only if you need to re-seed; check existing coverage first)
python -m ingest.seed_fundamentals

# 5. Technicals + scores
python -m ingest.compute_technicals
python -m ingest.compute_scores
```

Read the printed output of steps 1–3 carefully:
- `reset_market_data --dry-run` will tell you if any old company symbols are being **kept** because a journal entry or pipeline item still references them — that's expected and safe, not a bug.
- `fetch_prices`'s end-of-run summary will list any symbols that failed to fetch — check those against `data/universe_top100.csv` in case a ticker needs correcting.

## What's verified vs. not

**Verified this session:** every modified/new Python file compiles and was actually imported with real dependencies (including the full `app.py` + `app.openapi()` generation — 19 routes, all present); the CSV was validated programmatically (100 rows, no dupes, 50/50 split); SQL was reviewed statically.

**Not verified this session** (no live Postgres or `yfinance` access in the sandbox — a local Postgres install was attempted and failed on a missing server package): an actual end-to-end run of `reset_market_data.py` or the incremental fetch logic, and all 100 `yahoo_ticker`s against real `yfinance`. Tracked as `TECHNICAL_DEBT.md` TD-023/TD-024 — please run the steps above for real before trusting this at scale, and report back anything that fails.

## Notable finding

`services/discover_service.py`, `services/screener_service.py`, and `services/company_service.py` never imported the hardcoded `UNIVERSE` list — they already queried the `companies` table directly. So Discover, Search, and Screener needed **zero code changes** to work correctly against ~100 companies instead of 8; this milestone's real code footprint was almost entirely inside `ingest/`.
