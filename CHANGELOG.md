# Changelog

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
