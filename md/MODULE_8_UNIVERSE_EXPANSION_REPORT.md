# Universe Expansion & Ingestion Hardening Module Report (brief's "Module 8")

## Audit summary

`ingest/universe.py` (built in an earlier milestone — see
`CHANGELOG.md`'s Milestone 5 entry) was already a CSV-backed,
config-driven loader (`UNIVERSE_CSV_PATH` env var), not a hardcoded
list — the brief's "Universe Builder: do NOT hardcode a giant list,
make it configurable" requirement was substantially already met by the
existing architecture. What this module actually needed: (1) a larger
CSV, (2) an additional `UNIVERSE_SIZE` knob for fast local iteration,
(3) retry/concurrency in the ingest scripts that actually make
external network calls (`fetch_prices.py`, `fetch_fundamentals.py`),
and (4) the "One additional improvement" company-metadata quality
request.

## Universe data

`data/universe_nifty500.csv` — **498 real NSE companies**, sourced from
a live, market-cap-ranked NSE company listing fetched at the time this
module was built (not hand-typed, not hallucinated — see provenance
note below). 2 near-duplicate/non-primary listings of already-included
companies were excluded (a duplicate row for the same GE Vernova T&D
India entity; UPL's partly-paid-shares trading line, not a distinct
company). Special-character ticker mappings were corrected (`M_M` →
`M&M`, `M_MFIN` → `M&MFIN`, `J_KBANK` → `J&KBANK`, `BAJAJ_AUTO` →
`BAJAJ-AUTO`, `ARE_M` → `ARE&M`) since NSE/Yahoo use `&`/`-`, not `_`.
Verified: 498 unique symbols, no blank required fields.

`index_membership` (`NIFTY50`/`NIFTYNEXT50`/`NIFTYMIDCAP150`/
`NIFTYSMALLCAP250`) is assigned by total-market-cap rank as an
**approximation** of the official indices — see `ingest/universe.py`'s
own docstring for the full explanation of where this approximation is
safe (top 100 — large, unambiguous blue chips) vs. where it's weakest
(the ~250 rank boundary, where NSE's actual free-float/6-month-average
methodology and semi-annual rebalance calendar will disagree with a
today's-market-cap snapshot at the margins). This is a labeling
approximation only — it never affects which companies are in the
universe, only which of the four tags a given company gets.

`sector` was pre-filled from the previously-curated 100-company file
for every symbol present in both (99 of 498); the remaining rows are
blank and self-heal on the first `fetch_fundamentals.py` run (see
metadata enrichment, below) rather than being guessed here.

## Ingestion hardening

- **`ingest/resilience.py`** (new, shared): `retry()` — exponential
  backoff decorator for a single fetch call. `ConcurrentRunner` —
  bounded-concurrency fan-out with a shared rate limiter (minimum delay
  between *submissions*, shared across all worker threads, so the
  aggregate request rate is actually bounded regardless of worker
  count) and per-item failure isolation (one bad symbol is recorded and
  the run continues — never raises past a single item). Unit tested:
  backoff timing, exhaustion-after-N-attempts, and
  concurrent-with-isolated-failures.
- **`ingest/fetch_prices.py`**: `fetch_one` now retried; the main loop
  fans out through `ConcurrentRunner` (`--workers`, default 4) instead
  of a strict one-at-a-time loop, while keeping its pre-existing
  incremental-fetch logic (only pull days after the latest stored date)
  unchanged. Tested with mocked yfinance calls, including a
  failure-isolation case.
- **`ingest/fetch_fundamentals.py`**: same retry/concurrency treatment.
  Also gained `enrich_company_metadata` (below) and now delegates its
  shareholding write to `fetch_shareholding.py`'s shared implementation
  (see the Shareholding module report for why).
- **`ingest/compute_technicals.py` / `compute_scores.py`**: **no logic
  changes** — both are DB-only (no external API calls), so a larger
  universe means more per-symbol DB queries, not more network
  flakiness; retry/concurrency wasn't the relevant lever here. Comments
  updated to reflect the new universe size.

## Company metadata quality ("One additional improvement")

`fetch_fundamentals.py`'s `enrich_company_metadata` now writes
`companies.sector`/`.industry` from the same `Ticker.info` payload the
script already fetches for its financial ratios — Yahoo's own
classification, not derived from the company name or guessed. New
`companies.industry` column (migrated). This makes sector/industry
self-healing on every ingestion run instead of depending entirely on
whatever the universe CSV happened to have hand-curated at seed time —
directly closing the gap the brief called out ("Better company
metadata... industry, sector, market cap").

## Scoring engine

**Not touched.** `analysis/scoring_engine.py`,
`services/scoring_service.py`, `ingest/compute_scores.py`'s call into
the shared engine — all unchanged, per the brief's explicit "do not
remove or simplify the recently implemented scoring engine." The
larger universe flows through unchanged scoring logic via the same
`UNIVERSE` import every other ingest script uses.

## Verification performed

- `data/universe_nifty500.csv`: validated 498 unique symbols, correct
  index-tier bucketing (50/50/150/248), spot-checked all 6
  special-character symbol overrides, confirmed no blank required
  fields.
- `ingest/universe.py`: ran as `__main__` — loads 498 active companies,
  correct per-tier counts. Confirmed `UNIVERSE_SIZE=50` correctly
  yields exactly the NIFTY50 block (order-dependent, since the CSV is
  index-priority ordered). Confirmed `UNIVERSE_CSV_PATH` override still
  works against the old 100-company file (backward compatible).
  Confirmed `UNIVERSE_SIZE=0` fails loudly at import time rather than
  silently running against an empty universe.
- `ingest/resilience.py`: unit tested standalone (see above).
- `ingest/fetch_prices.py` / `fetch_fundamentals.py`: both tested
  end-to-end with mocked yfinance calls — correct write counts, correct
  metadata-enrichment content, correct failure isolation (a raised
  exception for one symbol doesn't stop the rest of the run).
- `python3 -m py_compile` on every backend `.py` file, and a full `from
  app import app` import against a live local PostgreSQL 16 instance —
  both pass.

## Honest limitations

1. **The 498-company list itself was fetched, not hand-typed or
   generated from memory** — a live, market-cap-sorted NSE listing
   pulled via web search/fetch tooling during this session. This is
   materially more reliable than the alternative (hand-compiling ~500
   tickers from training-data recall, which risks stale/delisted/wrong
   symbols) but it is a snapshot as of the date this module was built,
   not a live-refreshed feed — NSE index composition changes at
   semi-annual rebalances, so this file should be periodically
   refreshed the same way it was built, not treated as permanently
   authoritative.
2. `index_membership`'s tier boundaries are an approximation, not a
   verified read of NSE's official constituent lists for the middle two
   tiers — see above.
3. Ingestion scripts' actual network behavior against live
   Yahoo/NSE at 498-company scale is unverified in this sandbox (same
   network restriction noted in the other two module reports) — the
   retry/concurrency/rate-limiting logic itself is unit tested, but a
   full live run against all 498 companies has not been executed. Run
   `python -m ingest.fetch_prices --limit 20` and `python -m
   ingest.fetch_fundamentals --limit 20` first in a real environment
   before a full run.
