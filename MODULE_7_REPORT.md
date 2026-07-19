# Module 7 — Weekly Market Intelligence Report

## Audit summary (before writing any code)

Read the full backend and frontend before touching anything. What
actually exists, versus what the brief assumed:

- **Opportunity Score** = `services/scoring_service.py`'s
  `fundamentalScore` / `technicalScore` / `overallScore` / `verdict` /
  `rationale` (0-100, weighted, transparent-rule-based). Reused as-is —
  never recomputed.
- **AI Insights** = `services/analysis_service.py` +
  `analysis/engine.py`, exposed as `GET /company/{symbol}/analysis` and
  rendered as the Research page's "AI Research Report" section
  (`AIResearchReport.tsx`). This *is* a real, built feature — it's a
  deterministic rule engine (fundamentals/technicals/risk-catalyst rules
  → strengths/weaknesses/opportunities/risks), not an LLM call. Reused
  its existing `rationale` field for candidate rows; did not duplicate
  its logic.
- **Company Research page** = `research.$symbol.tsx`. Sections top to
  bottom: header/price/stats → Price History (`PriceChart`) → AI
  Research Report → Checklist. Module 7's section was added directly
  below Checklist, using the same `<Section>` wrapper, spacing, and
  typography as everything above it.
- **Sectors** are a closed set defined by `companies.sector` (8 curated
  companies/sectors in `ingest/universe.py`: Private Banks, Defence,
  Automobiles, Consumer Internet, IT Services, Specialty Chemicals,
  Retail, Cables & FMEG) — Module 7 never invents a sector name outside
  this set.
- **No news infrastructure existed** — no news table, no provider
  integration, no sentiment/classification code anywhere in the repo.
  This module is fully new.

**Documentation discrepancy found and flagged, not silently fixed:**
`API_CONTRACT.md` still lists Module 6 as "News (spec only)" and Module
9 as "AI Insights (spec only)," but the AI Insights engine described
above is actually built and live under a different route/module number
than the doc's table implies. The doc appears to have gone stale after
that engine was added without a changelog/contract update. Left the
stale entries alone (out of scope for this task) but added a note next
to the new `Weekly Market Intelligence ✅ implemented` section in
`API_CONTRACT.md` pointing this out, and used a section heading instead
of overwriting the doc's own (unrelated) "Module 7 — Portfolio" spec
slot, since your brief's "Module 7" and this repo's numbering are two
different sequences.

## High-level architecture

```
services/news_provider.py         (I/O only: fetch + normalize, 5 RSS providers)
        │
        ▼
services/sector_classifier.py     (classify into real DB sectors, score importance/polarity)
        │
        ▼
services/market_summary_generator.py  (rule-based outlook, summary prose, event grouping)
        │
        ▼
services/weekly_market_intelligence.py  ── the Weekly Intelligence Engine
        │  refresh_weekly_intelligence()         → writes weekly_sector_intelligence
        │  get_weekly_market_intelligence_for_company(symbol) → reads it +
        │      reuses company_service.get_company_by_symbol
        │      reuses screener_service.screen_companies (existing Opportunity Score ranking)
        ▼
routes/weekly_intelligence.py
    GET  /company/{symbol}/weekly-market-intelligence
    POST /weekly-market-intelligence/refresh   (manual dev trigger)
        ▼
frontend: fetchWeeklyMarketIntelligence → useWeeklyMarketIntelligence →
    <WeeklyMarketIntelligence /> rendered inside a new <Section> on
    research.$symbol.tsx, below the existing sections.
```

Layering matches the rest of the project: routes are thin, all logic is
in `services/`, nothing sector/score/ranking-related was pushed to
React. `WeeklyMarketIntelligence.tsx` only renders the response —
no filtering, sorting, or scoring on the client.

## Weekly Intelligence Engine — how it works

1. **Fetch** — `news_provider.fetch_all_recent_articles(days=7)` pulls
   from 5 free RSS providers (Google News finance-scoped, Yahoo Finance,
   Moneycontrol, Economic Times, Business Standard). A provider failing
   doesn't fail the run — it's logged and skipped, matching the brief's
   "support multiple providers" + resilience expectation. Adding a new
   provider is one line in `PROVIDERS`.
2. **Merge + dedupe** — every article's `dedup_key` is a hash of its
   normalized title, so the same story syndicated by two providers
   collapses to one row via `insert ... on conflict (dedup_key) do
   nothing` against `news_articles`.
3. **Date filter** — the refresh always re-reads the full 7-day window
   from the DB (not just this run's fresh fetch), so a Wednesday manual
   refresh still sees Monday's stored articles. This directly satisfies
   the brief's explicit "must analyze the full week, never just
   today/yesterday" requirement.
4. **Classify** — `sector_classifier.classify_article` matches each
   article against `config/sectors.py`'s keyword lexicon *and* the real
   company names/symbols pulled live from the DB (via
   `company_service.get_all_companies`). An article can match 0, 1, or
   several sectors; 0-match articles are dropped (per the brief: "if it
   can't answer the question, it shouldn't appear").
5. **Group similar events** — `market_summary_generator._group_similar_events`
   clusters articles within a sector by title word-overlap (documented
   v1 heuristic — genuine event-clustering is a hard NLP problem; this
   is a simple, explainable stand-in, easy to swap later).
6. **Generate weekly sector intelligence** — for each sector with ≥1
   article this week: `sector_outlook_from_articles` (weighted
   polarity → Positive/Neutral/Negative), `weekly_sector_summary`
   (template prose), `build_major_events` (top 5 grouped events with
   headline/why-it-matters/expected-impact). Upserted into
   `weekly_sector_intelligence`, keyed on `(sector, week_start_date)`.
7. **Read path never recomputes any of the above** — it reads the
   latest `weekly_sector_intelligence` row for the requested company's
   sector, reuses `get_company_by_symbol` for the company's own
   score/verdict/rationale, and reuses `screen_companies(sector=...,
   sort="overallScore")` for the sibling-company ranking, excluding the
   researched company itself.

Verified this whole pipeline (steps 4-6) end-to-end with synthetic
`RawArticle` data reproducing your brief's own worked examples
(RBI repo cut + bank earnings + credit growth → Positive Banking;
HAL contract → Positive Defence) — output matched. See Validation below.

## Weekly refresh workflow

Two ways to run it, matching the brief's "weekly refresh, manual dev
endpoint acceptable" instruction:

- **Scheduled (intended production use):**
  `python -m ingest.weekly_news_refresh`, run once a week (e.g. Sunday
  via cron/GitHub Actions/Task Scheduler — same pattern this project
  would use for its daily `fetch_prices`/`compute_technicals`/
  `compute_scores` chain, which is also currently run manually per
  `README.md`).
- **Manual (dev/testing):** `POST /weekly-market-intelligence/refresh` —
  same underlying function, callable from Swagger/curl/Postman without
  shelling into the server.

A company whose sector hasn't been refreshed yet doesn't 404 — the read
path returns `hasCoverage: false` with an honest "not generated yet"
message, so the Research page degrades gracefully instead of breaking.

## Files created

**Backend**
- `config/sectors.py`
- `services/news_provider.py`
- `services/sector_classifier.py`
- `services/market_summary_generator.py`
- `services/weekly_market_intelligence.py`
- `schemas/weekly_intelligence.py`
- `routes/weekly_intelligence.py`
- `ingest/weekly_news_refresh.py`

**Frontend**
- `src/features/company/components/WeeklyMarketIntelligence.tsx`

## Files modified

**Backend**
- `db/schema.sql` — added `news_articles`, `news_article_sectors`,
  `weekly_sector_intelligence` tables (all `create table if not
  exists`, additive only).
- `app.py` — registered the new router.
- `requirements.txt` — added `feedparser`.
- `API_CONTRACT.md`, `CHANGELOG.md` — documented the new endpoints,
  matching this repo's own convention of updating both per module.

**Frontend**
- `src/shared/api/types.ts` — added `SectorOutlook`,
  `WeeklyMarketEvent`, `WeeklyMarketIntelligence`.
- `src/shared/hooks/queryKeys.ts` — added
  `companies.weeklyMarketIntelligence(symbol)`.
- `src/features/company/api/companies.ts` — added
  `fetchWeeklyMarketIntelligence`.
- `src/features/company/hooks/useCompanies.ts` — added
  `useWeeklyMarketIntelligence`.
- `src/shared/components/common/Badge.tsx` — added `OutlookBadge`.
- `src/routes/research.$symbol.tsx` — SSR prefetch + new
  `<Section label="Weekly Market Intelligence">` appended after
  Checklist. No existing section touched.

## New backend APIs

| Method | Path | Returns |
|---|---|---|
| GET | `/company/{symbol}/weekly-market-intelligence` | `WeeklyMarketIntelligence` |
| POST | `/weekly-market-intelligence/refresh` | `WeeklyRefreshResult` |

## New schemas / models

- `schemas/weekly_intelligence.py`: `MajorEvent`, `WeeklyMarketIntelligence`
  (reuses `schemas.company.CompanyListItem` for
  `sectorResearchCandidates` — not a new/duplicate company shape), `WeeklyRefreshResult`.
- `db/schema.sql`: `news_articles`, `news_article_sectors`,
  `weekly_sector_intelligence`.

## Reuse — what was *not* duplicated

- Opportunity Score: reused via `screener_service.screen_companies`, not
  recomputed.
- AI Insight rationale: reused via `company_service.get_company_by_symbol`'s
  existing `rationale` field, surfaced in each `CompanyRow`.
- Sector list: read live from `companies.sector`, never hardcoded.
- `CompanyRow.tsx`: reused as-is for "Companies Worth Research" — no new
  list/table component.
- `Section`, `ErrorState`, `Skeleton` (via a local `AIResearchSkeleton`-style
  loading state), and the existing `Badge` component family (extended,
  not replaced).

## Validation

Environment note: this sandbox has no outbound network access, so
`services/news_provider.py`'s actual HTTP/RSS calls could not be
executed or verified against live feeds, and `pip install feedparser`
could not run either. Everything downstream of fetching *was* validated:

- All new/modified Python files pass `python -m py_compile`.
- All new/modified TS/TSX files parse cleanly (TypeScript compiler,
  syntax-only — no `node_modules` in this sandbox for a full typecheck).
- Ran the classification → outlook → summary → major-events pipeline
  end-to-end against synthetic `RawArticle` data reproducing your
  brief's own worked examples:
  - RBI repo cut + bank earnings beat + credit growth articles →
    classified into **Private Banks**, outlook **Positive**, summary
    "Private Banks sentiment improved this week...Private Banks is one
    of this week's stronger sectors..." — matches your example almost
    verbatim.
  - HAL defence contract article → classified into **Defence**, outlook
    **Positive**.
  - Tata Motors weak-sales article → classified into **Automobiles**,
    outlook **Negative**.
  - Dedup-key hashing confirmed to collapse near-duplicate titles
    ("RBI cuts repo rate by 25 bps" vs "RBI CUTS repo rate by 25 bps!!")
    to the same key.

**Before trusting this in production:** run
`python -m ingest.weekly_news_refresh` once you have network access and
a real `DATABASE_URL`, and spot-check that each RSS feed URL in
`services/news_provider.py` still resolves (`curl -I <url>`) — financial
news sites occasionally move RSS paths.

## Confirmation nothing existing was broken

- No existing route, service, schema, or component was modified in a
  way that changes its behavior — only additive changes (new router
  registration in `app.py`; new tables in `schema.sql`; a new `<Section>`
  appended after, not replacing, existing sections in
  `research.$symbol.tsx`).
- `Company`/`CompanyListItem` shapes, `scoring_service.py`,
  `analysis_service.py`, `discover_service.py`, `screener_service.py`
  were read but not modified.
- All pre-existing Python/TS files that were touched (`app.py`,
  `types.ts`, `queryKeys.ts`, `companies.ts`, `useCompanies.ts`,
  `Badge.tsx`, `research.$symbol.tsx`) were edited with pure additions
  (new import, new function/type/section) — no existing lines removed
  or altered.

## How to run and test

```bash
# Backend
cd backend
pip install -r requirements.txt --break-system-packages
cp .env.example .env   # fill in DATABASE_URL
# apply the 3 new tables (schema.sql is additive/idempotent)
psql "$DATABASE_URL" -f db/schema.sql
uvicorn app:app --reload

# Populate Weekly Market Intelligence
python -m ingest.weekly_news_refresh
# or, with the server running:
curl -X POST http://localhost:8000/weekly-market-intelligence/refresh

# Verify
curl http://localhost:8000/company/HDFCBANK/weekly-market-intelligence
```

```bash
# Frontend
cd frontend
npm install
npm run dev
# open /research/HDFCBANK (or any seeded symbol) and scroll below
# the AI Research Report / Checklist sections
```
