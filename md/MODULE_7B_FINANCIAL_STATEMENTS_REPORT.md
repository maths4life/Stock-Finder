# Financial Statements Module Report (brief's "Module 7")

**Naming note:** this repo's own internal module numbering already has a
`MODULE_7_REPORT.md` (Weekly Market Intelligence) — a different feature
from the founder's brief's independent "Module 7" numbering (Quarterly &
Annual Financial Statements) used for this session. Filed as
`MODULE_7B_...` to avoid overwriting or colliding with the existing
report while still sorting near it. See `CHANGELOG.md`'s new entry for
the dated, ordered record.

## Audit summary (before writing any code)

Read `schemas/company.py`, `services/fundamental_service.py`,
`services/company_service.py`, `routes/companies.py`,
`db/schema.sql`, and the frontend's `FinancialComparisonTable.tsx` /
`research.$symbol.tsx` before touching anything.

Finding: the Quarterly/Annual Comparison tables were not broken code —
they were correct code with no real data to work from.
`financials_quarterly` only ever holds one row per symbol
(`quarter='latest'`), written from `yfinance`'s `Ticker.info` (a
point-in-time snapshot, not a time series — see
`ingest/fetch_fundamentals.py`'s own docstring, unchanged by this
module). The pre-existing comparison logic tried to infer
quarterly-vs-annual by the day-gap between two dated rows for the same
symbol; with only ever one row per symbol, it always returned an empty
table, which the frontend correctly rendered as N/A. The frontend and
the API contract (`ComparisonTable`/`ComparisonRow` in
`schemas/company.py` / `shared/api/types.ts`) were already exactly
right — nothing there needed to change.

## What was built

- **`db/schema.sql`**: new `financial_statements` table — one row per
  `(symbol, period_type, period_end)`, `period_type` an explicit
  `'quarterly'`/`'annual'` column (no inference needed). Also
  `db/migrations/001_financial_statements_shareholding_and_metadata.sql`
  for an existing database (verified idempotent — applied twice against
  a live Postgres instance with no error).
- **`ingest/fetch_financial_statements.py`** (new): pulls yfinance's
  *statement* endpoints (`quarterly_income_stmt`/`income_stmt`,
  `*_balance_sheet`, `*_cashflow`), which return real historical
  periods, unlike `Ticker.info`. Computes Revenue, Net Profit, EPS,
  EBITDA (direct or Operating Income + D&A), EBITDA Margin, Operating
  Margin, Cash, Debt (direct or LT+current fallback), Free Cash Flow
  (direct or OCF+CapEx fallback) — every fallback path documented in
  the file's own docstring and comments. Any metric with no matching
  line item anywhere in the three statements for a period is written
  as SQL `NULL`, never guessed.
- **`services/financial_statements_service.py`** (new, dedicated —
  per the brief's explicit "create a dedicated service, do not place
  business logic inside routes"): `get_quarterly_comparison(symbol)`,
  `get_annual_comparison(symbol)`. All Diff/Growth% arithmetic happens
  here.
- **`routes/financial_statements.py`** (new): `GET
  /company/{symbol}/quarterly`, `GET /company/{symbol}/annual`.
- **`services/fundamental_service.py`**: the old gap-inference
  functions removed; `get_quarterly_comparison`/`get_annual_comparison`
  re-exported from the new service so `company_service.py`'s existing
  import didn't need to change. `Company.quarterlyComparison` /
  `.annualComparison` now source from the same real data as the new
  dedicated endpoints — they can never disagree, because it's the same
  function call.

## Frontend

**No frontend changes were needed for this module.**
`FinancialComparisonTable.tsx` and the `ComparisonTable`/`ComparisonRow`
types already matched the new service's output shape exactly — the
table was always ready to render real data, it just never received any
before now.

## Data source honesty

yfinance's statement coverage for Indian companies is inconsistent for
banks/NBFCs in particular (different line-item taxonomy for
financial-sector filings than industrials/consumer companies use) — a
bank's Operating Margin or EBITDA may legitimately come back `null`
where the standard line items don't apply to how banks report. This is
expected, not a bug — see the ingest script's own docstring for the
full list of label-spelling fallbacks tried before giving up on a
field.

## Verification performed

- Unit-tested `build_statement_rows`/`_build_period_row` against
  synthetic yfinance-shaped `DataFrame`s (fabricated for the test only,
  never written to the DB or presented as real): confirmed correct
  parsing, correct fallback derivation (FCF from OCF+CapEx, Debt from
  LT+current), correct Indian-fiscal-year labeling, and correct `None`
  on missing data (no fabrication).
- `db/schema.sql` and the standalone migration file both applied
  successfully against a real local PostgreSQL 16 instance; migration
  file re-run twice to confirm idempotency.
- `services/financial_statements_service.py` tested against real
  seeded Postgres data — confirmed correct current/previous
  labels, diff, and growth% math, and correct honest-`None` behavior
  for a metric with no data (tested via the EBITDA field on a seeded
  annual row).
- Full round-trip through the actual FastAPI app via `TestClient`
  against the same live Postgres: `GET /company/TESTCO/quarterly`, `GET
  /company/TESTCO/annual`, and the full `GET /company/TESTCO` all
  returned correct data; confirmed an unrecognized symbol returns `200`
  with an honest empty comparison table rather than a `500`.
- `python3 -m py_compile` on every backend file — pass. Full `from
  app import app` import against a live Postgres — pass.

## Honest limitations

1. **Not tested against a live Yahoo Finance connection.** This
   sandbox's network egress is restricted to package registries and
   cannot reach `finance.yahoo.com`. The parsing/derivation logic is
   verified against realistic synthetic data; the actual network call
   in `_fetch_one` (`yf.Ticker(ticker).quarterly_income_stmt`, etc.) is
   unverified live. Run `python -m ingest.fetch_financial_statements
   --limit 5 --dry-run` in an environment with real internet access and
   inspect the logged output before a production run.
2. yfinance's statement history depth varies by company (typically 4-5
   quarters / 4 years, sometimes fewer for smaller/newer listings) — the
   Comparison tables need at least 2 periods of history to show a
   non-empty Previous column; a company with only 1 period of yfinance
   coverage will show Current populated and Previous as N/A, correctly.
