# Stock Finder — API Contract

The contract between the FastAPI backend and the React frontend, written
module by module to match the Phase 2 migration plan. **Module 1 is
implemented and described in full below. Modules 2–9 are specced so the
shape is agreed before code is written — they are not built yet.**

Base URL (dev): `http://127.0.0.1:8000`

Golden rule: **React never screens, ranks, filters, or calculates. FastAPI
does. React displays, searches (via the backend), sorts UI tables, and
shows loading/error states.**

> Note on history: an earlier pass at this file described a more elaborate
> Module 1 (query-param filtering by sector/ROE/ROCE/etc., a paginated
> envelope from the backend) that was never actually implemented in code —
> only a Pydantic schema and this doc existed. This version replaces that
> draft with what is genuinely built and runnable today.

---

## Overview — all modules

| # | Module | Endpoint(s) | Frontend uses | Backend service | Status |
|---|--------|-------------|----------------|------------------|--------|
| 1 | Companies | `GET /companies`, `GET /company/{symbol}` | `research.tsx`, `screener.tsx`, `research.$symbol.tsx`, `CommandPalette` | `company_service.py`, `scoring_service.py` | ✅ Built |
| 2 | Dashboard | `GET /dashboard`, `GET /market-status`, `GET /top-gainers`, `GET /top-losers`, `GET /popular` | `index.tsx` | `dashboard_service.py` | Not built |
| 3 | Company Page (deep detail) | extends `GET /company/{symbol}` | `research.$symbol.tsx` | `fundamental_service.py`, `technical_service.py` | Not built |
| 4 | Screener | `POST /screener` (filters currently accepted by the UI but not yet applied anywhere — see below) | `screener.tsx` | `screener_service.py` | Not built |
| 5 | Charts | `GET /company/{symbol}/prices` | chart components | `technical_service.py` | Not built |
| 6 | News | `GET /company/{symbol}/news` | news components | `news_service.py` (needs a news table — not yet in schema) | Not built |
| 7 | Portfolio | `GET /portfolio` | portfolio page | `portfolio_service.py` (needs a holdings table) | Not built |
| 8 | Journal | `GET/POST/PUT/DELETE /journal` | `journal.tsx` | `journal_service.py` (needs a `journal_entries` table) | Not built |
| 9 | AI Insights | `GET /analysis/{symbol}` | `research.$symbol.tsx` (pros/cons/summary) | `analysis_service.py` | Not built |

---

## Module 1 — Companies ✅ implemented

### `GET /companies`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | none | Matches company name or symbol, case-insensitive (`ILIKE`) |
| `limit` | int | 500 | Row cap (today's universe is small; this is effectively "all") |

**Response `200`** — flat array of `Company` objects (shape below). No
server-side pagination yet — the frontend still slices the array for
display (that's a UI concern, not screening/filtering, so it's left as-is
for Module 1; real query-param filtering by sector/ROE/PE/etc. is Module
4's job, see below).

### `GET /company/{symbol}`

**Response `200`** — one `Company` object, same shape as list items.
**Response `404`** — `{"detail": "No company found for symbol \"XYZ\""}`.

### `Company` shape (matches `frontend/src/shared/api/types.ts` exactly — camelCase, no transform layer needed)

```
symbol, exchange, name, sector                     -- companies table
price, changePct                                    -- technical_snapshot.close / change_pct
marketCap (display string), marketCapCr             -- financials_quarterly.market_cap_cr (quarter='latest')
pe, pb, peg, roe, roce, salesGrowthPct,
profitGrowthPct, debtToEquity, currentRatio,
divYield                                            -- latest financials_quarterly row (+ most recent
                                                        non-null debt_to_equity from history, since the
                                                        'latest' snapshot row itself never has one)
promoterHoldingPct, fiiHoldingPct, diiHoldingPct    -- latest shareholding_pattern row
rsi, aboveEma200, aboveEma50                        -- technical_snapshot
volumeBreakout                                      -- computed: latest prices_daily.volume > 1.5x
                                                        technical_snapshot.avg_volume_20
fundamentalScore, technicalScore, overallScore,
verdict, rationale                                  -- scores table
spark                                                -- last 14 closes from prices_daily, chronological
```

### Frontend functions this replaces (`features/company/api/companies.ts`)

| Function | Behavior now |
|---|---|
| `fetchCompanies(params)` | Calls `GET /companies?search=...`, then paginates the array client-side for display |
| `fetchCompany(symbol)` | Calls `GET /company/{symbol}` |
| `searchCompanies(query, limit)` | Calls `GET /companies?search=<query>&limit=<limit>` |
| `fetchAllCompanies()` | Calls `GET /companies` (used for dropdowns) |
| `fetchCompaniesBySymbols(symbols)` | Unchanged: filters the result of `fetchAllCompanies()` client-side — an exact-ID lookup, not screening/ranking, so left as-is |

The legacy mock files (`features/company/api/mock/*`, and the entirely
unused pre-refactor `src/lib/api`, `src/hooks`, `src/components/*`
directories) are not imported by any live route and were left untouched.

### Known data gaps (documented, not silently faked)

| Field | What Module 1 does | Why |
|---|---|---|
| `epsGrowthPct` | Proxied as `profit_growth_pct` | No dedicated EPS-growth column in the schema; only `revenue_growth_pct` / `profit_growth_pct` exist. Real fix is computing it from `financials_quarterly` history, not a schema change — worth a follow-up. |
| `peg`, `currentRatio` | `0` when null | Source Kaggle dataset leaves these `NULL` (see `seed_fundamentals.py` comments). |
| `riskLevel` | Heuristic from `debt_to_equity` + `roe` | No risk model in the schema. Same transparent-rule-based spirit as `ingest/compute_scores.py`, not a real risk assessment. |
| `expectedReturnPct`, `investmentHorizonMonths` | Heuristic keyed off `riskLevel` + `overallScore` | Placeholder pending a real target-price/model source — flagged so it's never mistaken for investment guidance. |
| `pros`, `cons`, `shareholdingTrend`, `quarterlyFinancials`, `checklist`, `businessSummary`, `verdictSummary` | Empty defaults (`[]` / `""`) | Explicitly **Module 3**'s job — needs financials/shareholding *history*, not the latest snapshot. The company page will look sparse in these sections until then; that's expected. |

### Build-breaking import fix

`features/company/hooks/useCompanies.ts`, `features/journal/hooks/useJournalEntries.ts`,
and `features/market/hooks/useDiscover.ts` all imported `./queryKeys` — a
file that doesn't exist in any of those three folders. (The repo has a
`src/shared/hooks/queryKeys.ts`, which is the real one used everywhere
else, and a dead-code `src/hooks/queryKeys.ts` left over from before the
refactor.) Fixed all three to `@/shared/hooks/queryKeys` — no new file
created, no duplication.

Verified with static checkers covering: import resolution, named-export
existence, default-export existence, asset resolution, and package.json
dependency completeness, across every file in `src/`. All clean. Real
`npm run build` / `npm run dev` still need to be run locally — no network
access here to install `node_modules`.

### Scalability review (post-implementation pass)

A follow-up review of Module 1 found and fixed three real issues before
moving to Module 2:

1. **N+1 queries.** `_build_company` was calling `_fetch_spark` and
   `_fetch_latest_volume` once per company row — for a 500-row
   `GET /companies`, that was 1,001 DB round trips (1 main query + 500 +
   500). Both are now batched: `_fetch_spark_batch` and
   `_fetch_latest_volume_batch` each take the full list of symbols from
   the main query and run **one** query total (window function +
   `array_agg` for spark; `DISTINCT ON` for latest volume), regardless of
   how many companies match. `GET /companies` is now exactly 3 queries no
   matter the result size; `GET /company/{symbol}` is the same 3 queries
   scoped to one symbol.
2. **List vs. detail payload.** `schemas/company.py` now splits
   `CompanyBase` (everything list/search views actually render — verified
   against `CompanyRow.tsx`, `CompanyCard.tsx`, and the `ResultCard` in
   `screener.tsx`, which uses nearly every fundamental/technical/score
   field) from `Company` (adds `pros`, `cons`, `shareholdingTrend`,
   `quarterlyFinancials`, `checklist`, `businessSummary`,
   `verdictSummary` — confirmed via `grep` that no list-context component
   reads any of these). `get_all_companies` returns `CompanyListItem`;
   `get_company_by_symbol` returns the full `Company`. Today this doesn't
   change bytes-on-the-wire much (those fields are still empty defaults
   with no cost), but it means when Module 3 makes them genuinely
   expensive (real financials/shareholding *history* queries), that cost
   is structurally confined to the single-symbol endpoint and can never
   leak into the list endpoint by accident.
3. **Heuristics moved to `services/scoring_service.py`.** `risk_level` and
   `expected_return_and_horizon` were inline in `company_service.py`.
   Moved out since Module 4 (Screener) will filter on `riskLevel`/horizon
   and Module 9 (AI Insights) will likely want to explain or replace these
   — both should import one function, not reimplement or copy-paste the
   rule.

**Also found and fixed a real frontend bug while reviewing:** the previous
pass's `fetchCompanies` returned `{ data: [...], ... }`, but
`Paginated<Company>` (and every consumer — `screener.tsx`'s
`query.data?.items`, `research.tsx`'s same pattern) expects `{ items:
[...], ... }`. Pagination on both the Research and Screener pages would
have silently rendered nothing. Fixed to `items`.

### Also fixed while implementing this

- `backend/requirements.txt` was missing `fastapi`, `uvicorn`, and
  `pydantic` — the app couldn't have run at all with just the original
  list. Added.
- `backend/app.py` had no CORS middleware, so the browser would have
  blocked every request from the Vite dev server. Added permissive
  dev-only CORS — tighten `allow_origins` before deploying anywhere public.

### Validation

- Verified every column referenced in the SQL (`market_cap_cr`, `roe_pct`,
  `debt_to_equity`, `promoter_pct`, `rsi_14`, `avg_volume_20`,
  `overall_score`, ...) against what `ingest/seed_fundamentals.py`,
  `ingest/compute_technicals.py`, and `ingest/compute_scores.py` actually
  write — no invented columns.
- Confirmed via `grep` that the live route tree (`src/routes/*.tsx`) only
  imports from `@/features/*` and `@/shared/*`, never the legacy
  `@/lib/api` / `@/hooks` / `@/components` (non-shared) paths.
- `python -m py_compile` passed on all touched backend files.
- **Could not run** `uvicorn app:app --reload`, hit `/docs`, or run
  `npm run build` in this environment — no network access and no live
  Postgres connection reachable from here. Please run these yourself
  before treating Module 1 as done:
  ```
  cd backend && pip install -r requirements.txt && uvicorn app:app --reload
  # then open http://127.0.0.1:8000/docs and try GET /companies, GET /company/{symbol}
  cd frontend && npm install && npm run build && npm run dev
  ```

---

## Module 2 — Dashboard (spec only)

| Endpoint | Purpose | Frontend uses | Backend service |
|---|---|---|---|
| `GET /dashboard` | Aggregated home-page bundle | `routes/index.tsx` | `dashboard_service.py` |
| `GET /market-status` | Index-level indicators | `useMarketIndicators` | `dashboard_service.py` |
| `GET /top-gainers` / `GET /top-losers` | Ranked by `changePct` | Discover feed | `dashboard_service.py` |
| `GET /popular` | Curated/most-viewed | Discover feed | `dashboard_service.py` |

Company list items reuse the Module 1 `Company` shape.

## Module 3 — Company Page (spec only)

Extends `GET /company/{symbol}` — same endpoint, richer payload. Fills in
`pros`, `cons`, `shareholdingTrend` (from `shareholding_pattern` history),
`quarterlyFinancials` (from `financials_quarterly` history), `checklist`,
`businessSummary`, `verdictSummary`. Backed by `fundamental_service.py` +
`technical_service.py`.

## Module 4 — Screener (spec only)

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /screener` | POST | Body: `{sector, marketCap, roe, roce, pe, debtToEquity, promoterHolding, epsGrowth, salesGrowth, technicalFilters, investmentHorizon}` → filtered `Company[]` |

Today, `screener.tsx` calls the same `fetchCompanies()` as `research.tsx`
and applies no server-side filters beyond `search` — the sector/ROE/PE/etc.
controls in the UI don't filter anything yet. This module moves that logic
into `screener_service.py`.

## Module 5 — Charts (spec only)
`GET /company/{symbol}/prices?range=1M|6M|1Y|5Y` → `{date, open, high, low, close, volume}[]` from `prices_daily`. Service: `technical_service.py`.

## Module 6 — News (spec only)
`GET /company/{symbol}/news` → `{title, source, url, publishedAt, sentiment}[]`. Needs a news table/ingestion source — not yet in schema, to be scoped with the user before implementation.

## Module 7 — Portfolio (spec only)
`GET /portfolio`, `POST /portfolio/holdings` → computed allocation/returns server-side. Needs a `portfolio_holdings` table — schema addition to be scoped with the user first.

## Module 8 — Journal (spec only)
`GET/POST/PATCH/DELETE /journal` CRUD matching `JournalEntry`. Needs a `journal_entries` table — schema addition to be scoped first.

## Module 9 — AI Insights (spec only)
`GET /analysis/{symbol}` → `{summary, scores, trend, strengths, weaknesses, opportunities, risks}`. Likely composes `scoring_service.py` output with an LLM summarization step.
