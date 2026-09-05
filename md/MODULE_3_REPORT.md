# Module 3 — Research Dashboard Report

## Audit summary

The Research page (`routes/research.$symbol.tsx`) fetches one object —
`Company`, via `useCompany(symbol)` → `GET /company/{symbol}` — no
per-section mock APIs existed to replace. The backend side of Module 3
(price history endpoint, deep-research fields on `Company`) was already
built in the uploaded repo before this session (`services/technical_service.py`,
`services/fundamental_service.py`, `services/scoring_service.py`'s Module 3
additions, `schemas/technical.py`). Verified by reading the code, compiling
every backend file, and confirming every SQL column referenced exists in
`db/schema.sql`.

What was actually missing was on the frontend: several fields the backend
already returned were never typed, fetched, or rendered.

## Endpoints

| Endpoint | Status |
|---|---|
| `GET /company/{symbol}` | Pre-existing, unchanged |
| `GET /company/{symbol}/prices?range=` | Pre-existing, unchanged — now consumed by the frontend for the first time |

No new backend endpoints were added; none were needed.

## Services

No new services added. `services/technical_service.py`,
`services/fundamental_service.py`, and the Module 3 additions to
`services/scoring_service.py` were audited and left unchanged.

## Frontend hooks updated / added
- `useCompanyPrices(symbol, range)` — **new**, in
  `features/company/hooks/useCompanies.ts`.
- `useCompany(symbol)` — unchanged, but the `Company` type it returns now
  correctly includes `eps`, `goldenCross`, `trend` so the component can
  read them.

## Frontend components updated / added
- `features/company/components/PriceChart.tsx` — **new**.
- `routes/research.$symbol.tsx` — added Price History, Fundamentals,
  Technicals sections and Scorecard extras (Risk Level, Expected Return,
  Investment Horizon).

## Mock APIs removed
None existed for this page — see CHANGELOG.md's "Mock APIs removed"
section for why.

## Remaining limitations
1. No `industry` column in the `companies` table — only `sector`.
   Documented, not invented.
2. `businessSummary` remains `""` — no source column exists; Module 3's
   brief forbids fabricating this or calling an LLM.
3. A pre-existing, unrelated TypeScript error in the dead
   `src/lib/api/companies.ts` (Module 1 legacy tree, not on any live
   route) was left untouched — see CHANGELOG.md.

## Validation performed
- `python3 -m py_compile` on every backend `.py` file — pass.
- Cross-checked every SQL column referenced against `db/schema.sql` — all
  present, none invented.
- `npm install` + `npx tsc --noEmit` on the frontend — passes except the
  one pre-existing, out-of-scope error noted above (confirmed present
  before this session's edits and outside the Research page's import
  graph).
- Confirmed the SSR route loader's prefetch for both `companies.detail`
  and the new `companies.prices` keys uses the identical query key and
  query function as the corresponding hooks (`useCompany`,
  `useCompanyPrices`) — no hydration mismatch.
- Confirmed no duplicate query keys, no duplicate API wrapper functions,
  no schema/table/column invention.

## Stop condition
Module 4 has not been started. Awaiting approval.
