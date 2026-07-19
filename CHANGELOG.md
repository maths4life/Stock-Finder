# Changelog

## Milestone 2 — Journal Backend

Feature milestone: replaced the mock-only journal with a real, persistent, full-CRUD backend-backed feature. Also re-deleted the legacy dead frontend trees at the founder's explicit request (see note below) after finding them still present despite Milestone 1's changelog entry claiming their removal.

### Backend — files created
- `backend/backend/schemas/journal.py` — `JournalEntryBase`/`Create`/`Update`/full `JournalEntry` Pydantic models, camelCase, mirroring the `journal_entries` table in `db/schema.sql` exactly. Field validation: non-empty `symbol`/`thesis`, `confidenceLevel` constrained 1–5, `horizonMonths` must be positive.
- `backend/backend/services/journal_service.py` — business logic + SQL for all five operations (list, get-one, create, update, delete). Validates the referenced `symbol` exists in `companies` before writing (raises `SymbolNotFoundError`, translated to a 400 by the route layer). Auto-computes `reviewDueAt` from `createdAt` + `horizonMonths` on both create and update, per the column comment in `schema.sql`. Dependency-free month-addition helper (no `python-dateutil` in `requirements.txt`), handles month-end edge cases (e.g. Jan 31 + 1 month → Feb 28/29).
- `backend/backend/routes/journal.py` — thin route layer: `GET /journal-entries`, `GET /journal-entries/{id}`, `POST /journal-entries` (201), `PUT /journal-entries/{id}` (200), `DELETE /journal-entries/{id}` (204). Malformed (non-UUID) ids rejected with a clean 404 rather than a raw DB error.

### Backend — files modified
- `backend/backend/app.py` — registered `journal_router`.

### Frontend — files created
- `frontend/src/features/journal/components/JournalEntryForm.tsx` — create/edit dialog, `react-hook-form` + `zod`, company picker sourced from `useAllCompanies()`, covers every writable `journal_entries` column.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — `JournalEntry` type replaced to match the real backend contract (was previously an invented shape — `catalysts`/`risks` arrays, `conviction`, `date`, `reviewDue` — that never matched `db/schema.sql`); added `JournalEntryInput` for create/update payloads.
- `frontend/src/features/journal/api/journal.ts` — rewritten from `resolveMock(...)` over static data to real `fetch` calls against all five endpoints, following the same pattern as `features/company/api/companies.ts` and `features/market/api/market.ts`.
- `frontend/src/features/journal/hooks/useJournalEntries.ts` — added `useCreateJournalEntry`, `useUpdateJournalEntry`, `useDeleteJournalEntry` mutations, each invalidating `queryKeys.journalEntries` on success and showing a `sonner` toast on success/error.
- `frontend/src/routes/journal.tsx` — rebuilt: entries now render every real field (previously rendered `catalysts`/`risks` arrays that don't exist in the schema); "+ Start a new thesis" button now opens the create form (previously had no `onClick` at all); added per-entry Edit and Delete controls, the latter behind an `AlertDialog` confirmation.
- `frontend/src/routes/__root.tsx` — mounted `<Toaster />` (from `shared/components/ui/sonner.tsx`, already present but never mounted) so mutation feedback is visible.

### Frontend — files deleted
- `frontend/src/features/journal/api/mock/` (and its contents) — the journal's last remaining mock-data fallback.

### Frontend — dead trees re-deleted (see "Found: stale delivery" below)
- `frontend/src/components/**`, `frontend/src/hooks/**`, `frontend/src/lib/api/**`, `frontend/src/lib/mock-data.ts`, `frontend/src/lib/utils.ts` — re-verified zero live imports (all references were internal to the dead `components/` tree itself), then deleted. This is the same set Milestone 1's changelog entry already claims was deleted; see the finding below.

### Found: stale delivery, not a regression
At the start of this milestone, per the required documentation-vs-code verification step, the dead frontend trees listed above were found still physically present, despite `HANDOFF.md`, `CURRENT_STATE.md`, and this changelog's own Milestone 1 entry (above) all stating they were deleted. Zero live imports pointed to them at this check either, same as Milestone 1's finding — this points to a stale/pre-cleanup copy of the repository being delivered for this milestone, not a real regression of Milestone 1's work. Flagged to the founder before proceeding; founder approved re-deleting them as part of this milestone, outside the original journal-only scope.

### Verification performed
- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeded; SSR bundles generated for all six routes (`/`, `/research`, `/research/$symbol`, `/screener`, `/journal`, `/ideas`), including the rebuilt journal page and its new form/dialog components.
- `npm run lint` — CRLF/formatting findings (TD-015) grew from ~7,720 to ~8,249; confirmed this is only new files following the existing (CRLF) convention, not a new category of error — the only non-CRLF findings are pre-existing `react-refresh/only-export-components` warnings in shadcn UI files, unrelated to this milestone.
- Backend: `ast.parse` over every new/modified `.py` file; a full `app.py` import plus FastAPI `openapi()` schema generation, confirming all five journal routes register with the correct HTTP methods and paths (`GET`/`POST /journal-entries`, `GET`/`PUT`/`DELETE /journal-entries/{id}`) alongside the four pre-existing routers, unaffected.
- Backend: unit-level sanity check of `journal_service._add_months` (including the Jan 31 → Feb 28 month-end edge case) and the Pydantic validators (blank thesis rejected, out-of-range confidence rejected) run directly in Python.
- Manually grepped the full frontend tree for any other reference to the old mock `JournalEntry` shape (`catalysts`, `.risks`, `.conviction`, `reviewDue`) or to the deleted dead trees — none found outside the files listed above.
- **Not verified:** an actual end-to-end write/read/delete cycle against a live Postgres database — no `DATABASE_URL`/database instance was available in this environment. SQL was verified by direct comparison against `db/schema.sql`'s column list and by successful route registration, not by execution. Flagged in `CURRENT_MILESTONE.md`'s "Remaining limitations."

---

## Milestone 1 — Product Realignment

Cleanup-only milestone: no features added, no scoring/UI/API behavior changed. Full audit, plan, and completion report are in the Milestone 1 planning conversation; `CURRENT_MILESTONE.md` holds the durable summary.

### Frontend — deleted (confirmed zero live imports before removal)
- `frontend/src/components/**` — dead duplicate of `shared/components/**` (shadcn `ui/` set, `common/`, `company/`, `layout/`, plus top-level `AppShell.tsx`, `CommandPalette.tsx`, `Sparkline.tsx`).
- `frontend/src/hooks/**` — dead duplicate of `shared/hooks/**` and `features/*/hooks/**`.
- `frontend/src/lib/api/**` — dead duplicate of `features/*/api/**`, including its own `mock/`.
- `frontend/src/lib/mock-data.ts`, `frontend/src/lib/utils.ts` — orphaned once `components/` (their only importer) was deleted; removed as a direct, mechanical consequence rather than left as new dead code.

### Frontend — modified
- `frontend/src/routes/__root.tsx` — page `<title>`, `og:title`, and `author` meta corrected from the leftover scaffold name "Quant Terminal" to "Stock Finder", matching every product document. (Same "Quant" naming was found in `shared/components/layout/AppShell.tsx`'s nav logo and in per-route `<title>` tags in `screener.tsx`, `journal.tsx`, `ideas.tsx`, `research.tsx`, `research.$symbol.tsx`, and `index.tsx` — left untouched, out of the milestone's approved scope; see the completion report's "found but not fixed" list.)

### Backend — deleted
- `backend/backend/{db,ingest,.github/workflows}` — an empty stray directory, an artifact of a `mkdir -p {a,b,c}` command run without brace expansion. No files were inside it; deletion has no functional effect.

### Documentation — updated to remove stale references
`CLAUDE.MD`, `Product_Vision.md`, and `API_CONTRACT.md` were confirmed by the founder as intentionally removed from the repository (not missing from an upload). Every document that referenced them as live files needing future reconciliation was updated to reflect that the reconciliation already happened, by removal:
- `README.md`, `PRODUCT_REQUIREMENTS.md`, `CURRENT_STATE.md` (§0, module table, §3, §6), `ARCHITECTURE.md` (§3), `TECHNICAL_DEBT.md` (TD-002, TD-012, TD-013 marked resolved), `ENGINEERING_GUIDE.md`, `ENGINEERING_ROADMAP.md`, `UI_UX.md` — updated in place.
- `DECISIONS.md` — left ADR-006 and ADR-009 unedited per the log's append-only rule; added ADR-012 to record the resolution.
- `MODULE_4_REPORT.md`, `MODULE_5_REPORT.md`, `MODULE_7_REPORT.md`, and this changelog's own historical entries below — intentionally left untouched; they're timestamped records of past work, not current-state descriptions.

### Verification performed
- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeded; SSR bundles generated for all six routes (`/`, `/research`, `/research/$symbol`, `/screener`, `/journal`, `/ideas`).
- `npm run lint` — pre-existing CRLF/formatting issues found across most of the frontend (~7,720 `prettier/prettier` findings); confirmed pre-existing by checking an untouched file (`screener.tsx`, CRLF) against an edited one (`__root.tsx`, LF, only 3 pre-existing unrelated formatting nits). Not caused by this milestone; not fixed, since a repo-wide reformat is out of scope. See `TECHNICAL_DEBT.md` for a new entry.
- `ast.parse` over every backend `.py` file — no syntax errors after removing the stray directory.
- Re-verified, immediately before deletion, that zero files under `routes/`, `features/`, `shared/`, or `router.tsx` imported from any of the three deleted trees.

---

## Module 7 — Weekly Market Intelligence

### Backend — files created
- `backend/config/sectors.py` — sector keyword lexicon + polarity word
  lists used by the classifier/summary generator (data, not logic).
- `backend/services/news_provider.py` — RSS-based multi-provider news
  fetcher (Google News, Yahoo Finance, Moneycontrol, Economic Times,
  Business Standard) with a registry pattern for adding providers.
- `backend/services/sector_classifier.py` — classifies articles into the
  DB's real sector set (never invents new sector names) and scores
  importance/polarity.
- `backend/services/market_summary_generator.py` — rule-based sector
  outlook, weekly summary prose, and major-event grouping. No LLM calls,
  same documented-heuristic philosophy as `services/scoring_service.py`.
- `backend/services/weekly_market_intelligence.py` — the Weekly
  Intelligence Engine: owns the weekly refresh pipeline and the
  read path for `GET /company/{symbol}/weekly-market-intelligence`.
  Reuses `company_service.get_company_by_symbol` and
  `screener_service.screen_companies` for company/ranking data — no
  Opportunity Score or AI Insight logic duplicated.
- `backend/schemas/weekly_intelligence.py` — `WeeklyMarketIntelligence`,
  `MajorEvent`, `WeeklyRefreshResult`. Reuses `CompanyListItem` from
  `schemas/company.py` for `sectorResearchCandidates`.
- `backend/routes/weekly_intelligence.py` —
  `GET /company/{symbol}/weekly-market-intelligence` and
  `POST /weekly-market-intelligence/refresh` (manual dev refresh).
- `backend/ingest/weekly_news_refresh.py` — CLI entry point
  (`python -m ingest.weekly_news_refresh`) for the weekly cron job,
  mirroring the existing `ingest/compute_scores.py`-style scripts.

### Backend — files modified
- `backend/db/schema.sql` — added `news_articles`,
  `news_article_sectors`, `weekly_sector_intelligence` tables.
- `backend/app.py` — registered the new router.
- `backend/requirements.txt` — added `feedparser`.

### Frontend — files created
- `frontend/src/features/company/components/WeeklyMarketIntelligence.tsx`
  — the Research page section. Reuses `CompanyRow` for "Companies Worth
  Research" and the new `OutlookBadge`.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — added `SectorOutlook`,
  `WeeklyMarketEvent`, `WeeklyMarketIntelligence` types.
- `frontend/src/shared/hooks/queryKeys.ts` — added
  `companies.weeklyMarketIntelligence(symbol)`.
- `frontend/src/features/company/api/companies.ts` — added
  `fetchWeeklyMarketIntelligence`.
- `frontend/src/features/company/hooks/useCompanies.ts` — added
  `useWeeklyMarketIntelligence`.
- `frontend/src/shared/components/common/Badge.tsx` — added
  `OutlookBadge` (Positive/Neutral/Negative), alongside the existing
  `RatingBadge`/`RiskBadge`/`SentimentBadge` family.
- `frontend/src/routes/research.$symbol.tsx` — added SSR prefetch +
  a new `<Section label="Weekly Market Intelligence">` below the
  existing sections. No existing section was reordered or altered.

**Architectural note:** Module 7 does not call an LLM anywhere — sector
outlook, weekly summaries, and "why it matters"/"expected impact" text
are all template-filled from real counts/keyword scores, the same
transparent-heuristic approach `analysis/engine.py` (Module 6) already
established for this codebase. News fetching (`services/news_provider.py`)
could not be executed against live feeds in the environment this module
was built in (no outbound network access) — logic was validated with
synthetic `RawArticle` data instead. See MODULE_7_REPORT.md's Validation
section before relying on this in production.

Full findings, decisions, and validation: see `MODULE_7_REPORT.md`.

---



### Backend — files modified
- None. `GET /company/{symbol}/prices`, `services/technical_service.py`,
  and `schemas/technical.py` already existed and were already correct
  (built as fallout of Module 3 — see that section below) — audited, no
  changes required.

### Frontend — files modified
- `frontend/src/features/company/components/PriceChart.tsx` — rewritten.
  Was a recharts `AreaChart` of `close` only; now a candlestick + volume
  chart built on `lightweight-charts`, rendering the `open`/`high`/`low`/`close`/`volume` fields the backend already returned but the old chart
  never used. Same external prop contract (`data`, `range`,
  `onRangeChange`, `isLoading`) as before, so no other file needed to
  change to consume it.
- `frontend/package.json` — added `lightweight-charts` (`^4.2.0`) to
  `dependencies`.

### Files audited, no changes needed
- `frontend/src/routes/research.$symbol.tsx` — already calls `PriceChart` with the exact props it still expects; no changes.
- `frontend/src/shared/api/types.ts` — `PriceBar`/`PriceRange` already
  matched the backend exactly (added in Module 3); no changes.
- `frontend/src/features/company/api/companies.ts`,
  `frontend/src/features/company/hooks/useCompanies.ts`, `frontend/src/shared/hooks/queryKeys.ts` — `fetchCompanyPrices`, `useCompanyPrices`, and
  the `companies.prices(symbol, range)` query key were all already
  correct; no changes.

**Architectural note:** colors for the candlestick/volume series are read
from the theme's resolved CSS custom properties (`--positive`, `--negative`, `--hairline`, etc.) via `getComputedStyle` at chart-build/data-update
time, not hardcoded — `<canvas>` can't resolve `var()` references the way
SVG/DOM elements can, so this is the closest equivalent to the old
chart's `var(--color-accent)` usage while staying on the same theme
tokens `shared/components/ui/chart.tsx`'s `THEMES` map already defines.

Full findings, decisions, and validation: see `MODULE_5_REPORT.md`.

---

## Module 4 — Screener

### Backend — files modified
- `backend/services/screener_service.py` — **new file**. Owns Module 4's
  filtering/sorting/pagination business logic. Reuses
  `company_service.get_all_companies()` for the candidate universe (no
  duplicate SQL/derivation logic); see the file's docstring for the
  scalability tradeoff of filtering in Python vs. SQL at today's scale.
- `backend/schemas/company.py` — added `PaginatedCompanies` response
  model (mirrors `Paginated<Company>` in `frontend/src/shared/api/types.ts`).
- `backend/routes/companies.py` — `GET /companies` now accepts the full
  `CompanyQueryParams` contract (sector, riskLevel, horizon, min/max
  fundamental+technical thresholds, sort, sortDirection, page, pageSize)
  and returns `PaginatedCompanies` instead of a flat array. Replaces the
  `limit` param with `page`/`pageSize`.

**Architectural decision:** superseded the originally-specced standalone
`POST /screener` — see `API_CONTRACT.md`'s Module 4 section and
`MODULE_4_REPORT.md` for the reasoning (both `screener.tsx` and
`research.tsx` were already built against `GET /companies`, so extending
it in place avoids two implementations of the same filtering logic).

### Frontend — files modified
- `frontend/src/features/company/api/companies.ts` — `fetchCompanies()`
  now sends the full filter/sort/pagination query string and returns the
  backend's `Paginated<Company>` response directly (no more client-side
  slicing/filtering). `fetchAllCompanies()` and `searchCompanies()`
  rewritten to call `fetchCompanies()` internally and unwrap `.items` —
  one implementation instead of a second flat-array code path.
- `frontend/src/routes/research.tsx` — fixed a latent bug: the "Sort:
  Name (A–Z)" option always sent `sortDirection: "desc"`, which sorts
  Z→A. Invisible while sorting was fake; real backend sorting exposed it.
  Now sends `"asc"` when `sort === "name"`.

Full findings, decisions, and validation: see `MODULE_4_REPORT.md`.

---

## Module 2 — Discover Page (audited, no changes required)

The Discover page backend integration was already complete in the uploaded
repository — `GET /discover/groups`, `GET /pipeline`, `GET /sectors/pulse`,
and `GET /market/indicators` were all implemented in
`backend/routes/discover.py` / `backend/services/discover_service.py`,
registered in `backend/app.py`, and consumed by the frontend
(`features/market/api/market.ts`, `features/market/hooks/useDiscover.ts`)
with SSR loaders using matching query keys. No files were modified.

## Module 3 — Research Dashboard

### Backend
Audited and found already complete (present before this session, not
written now): `GET /company/{symbol}/prices` (`routes/companies.py`,
`services/technical_service.py`, `schemas/technical.py`), and the deep
research fields on `GET /company/{symbol}` — pros/cons, checklist, verdict
summary, shareholding trend, quarterly financials, business summary
(`services/fundamental_service.py`, `services/scoring_service.py`,
`services/company_service.py`). No backend files modified.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — added `eps`, `goldenCross`, `trend`
  (`Trend` union type added) to `Company`; the backend's `CompanyBase`
  already sent these fields but the frontend type didn't declare them, so
  they were unusable in the UI. Added `PriceBar` and `PriceRange` types
  mirroring `backend/schemas/technical.py`.
- `frontend/src/shared/hooks/queryKeys.ts` — added
  `companies.prices(symbol, range)` key factory entry.
- `frontend/src/features/company/api/companies.ts` — added
  `fetchCompanyPrices(symbol, range)` calling
  `GET /company/{symbol}/prices`.
- `frontend/src/features/company/hooks/useCompanies.ts` — added
  `useCompanyPrices(symbol, range)`.
- `frontend/src/features/company/components/PriceChart.tsx` — **new file**.
  Renders the Price History section using the existing shadcn
  `ChartContainer` (recharts) wrapper already in the repo; range selector
  (1M/3M/6M/1Y/5Y/ALL) re-fetches from the backend per range, no client
  side data invention.
- `frontend/src/routes/research.$symbol.tsx` — added SSR prefetch for the
  default price range (identical query key/fn pair to `useCompanyPrices`,
  per the SSR requirement), rendered the Price History chart, and added
  three previously-missing display sections: Fundamentals (P/B, ROCE,
  Debt/Equity, EPS, Revenue Growth, Profit Growth, Promoter Holding),
  Technicals (RSI, Above 50/200 DMA, Golden Cross, Volume Breakout,
  Trend), and Scorecard extras (Risk Level, Expected Return, Investment
  Horizon). All of these were already returned by the backend but not
  rendered anywhere on the page.
- `frontend/src/features/company/api/mock/companies.data.ts` — added the
  three new required `Company` fields (`eps`, `goldenCross`, `trend`) to
  all 8 fixture records so the (unused, dead-code) file still type-checks.
  This file is not imported by any live route.

### Mock APIs removed
None — the Research page was already backend-driven for every field it
rendered. The gap was that several backend fields (fundamentals,
technicals, price history) were never wired into the UI at all, not that
they were backed by mocks. That gap is closed above.

### Known limitations
- **Industry**: the task asked for an "Industry" field in Company
  Overview. `companies` has no `industry` column (only `sector` — see
  `backend/db/schema.sql`). Per the "reuse existing schema, don't invent
  columns" rule, this wasn't added; the page continues to show `sector`
  only.
- **businessSummary**: still returns `""` — `companies` has no
  description/about column, and Module 3's brief explicitly forbids
  fabricating one or calling an LLM for it.
- **Pre-existing, out-of-scope TypeScript error**: `src/lib/api/companies.ts`
  has an unrelated type error (`'data' does not exist in type
  'Paginated<Company>'`). It lives in the legacy `src/lib` / `src/hooks`
  tree flagged as dead code in Module 1 (parallel, unused duplicate of
  `src/features/company`) and isn't imported by any live route. Left
  untouched per "don't modify Modules 1/2 unless fixing a bug" — this bug
  predates this session and isn't on the Research page's path.
