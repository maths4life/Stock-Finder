# Shareholding Pattern Module Report (brief's "Module 7.5")

## Audit summary

`shareholding_pattern` and the Research page's Shareholding section
already existed and were partially working — `promoter_pct`/`fii_pct`/
`dii_pct`/`public_pct` were populated via `fetch_fundamentals.py`'s
yfinance-approximation path (`heldPercentInsiders`/
`heldPercentInstitutions` as proxies, documented in that script as an
approximation, not a real NSE disclosure). What was genuinely missing:
Mutual Funds, Government, and Others as their own categories (no source
column existed for them at all), and the "latest vs. previous quarter,
percentage change" summary view the brief asked for.

## What was built

- **`db/schema.sql`**: `shareholding_pattern` extended with
  `mutual_funds_pct`, `government_pct`, `others_pct`, `period_end date`
  (a real chronological sort key — `quarter` labels like `'Q1 FY26'`
  don't text-sort chronologically). Same migration file as the
  Financial Statements module, verified idempotent.
- **`ingest/nse_client.py`** (new): a best-effort NSE shareholding
  disclosure client — the actually-correct free source for a genuine
  7-category promoter/FII/DII/MF/public/government/others split, per
  the brief's own stated source priority.
- **`ingest/fetch_shareholding.py`** (new): tries NSE first, falls back
  automatically to the existing yfinance approximation on any failure.
  Every written row is tagged `source = 'nse'` or `'yfinance_approx'`
  so nothing downstream mistakes an approximation for a real
  disclosure.
- **`services/shareholding_service.py`** (new, dedicated):
  `get_shareholding_summary(symbol)` — latest vs. previous reporting
  quarter, all 7 categories, percentage-point change per category,
  computed server-side.
- **`routes/financial_statements.py`**: `GET
  /company/{symbol}/shareholding` added alongside the Module 7
  endpoints (kept in the same route file rather than a fourth new one —
  small enough not to warrant its own module, and it shares the
  "dedicated statement-style endpoint" pattern with quarterly/annual).
- **`services/fundamental_service.py`**: `get_shareholding_trend`
  (the existing multi-quarter table) now also returns the 3 new
  categories, and orders by the new `period_end` column instead of a
  text sort on `quarter`.
- **`services/company_service.py`**: new `Company.shareholdingSummary`
  field populated alongside the existing `shareholdingTrend`.
- **`ingest/fetch_fundamentals.py`**: refactored to delegate its own
  shareholding write to `fetch_shareholding.py`'s shared
  `_from_yfinance` implementation instead of keeping a second,
  independent copy of the same approximation logic. This also fixed a
  latent bug: the old copy wrote `quarter='latest'` forever, while
  `fetch_shareholding.py` writes a real fiscal-quarter label — since
  both shared the `(symbol, quarter)` primary key, running both
  independently would have left a permanent, never-cleaned-up
  `'latest'` row sitting alongside the real dated ones indefinitely.
  One shared implementation now, called from both scripts; `info` is
  passed through when the caller already fetched it, avoiding a
  redundant Yahoo call for the same ticker in the same run.

## Frontend

- `shared/api/types.ts`: `ShareholdingRow` extended with
  `mutualFunds`/`government`/`others` (all `number | null` — `null`
  means the source didn't report that category, never a fabricated
  `0`). New `ShareholdingCategoryChange`/`ShareholdingSummary` types.
- `routes/research.$symbol.tsx`: the Shareholding table extended from 4
  to 7 data columns (wrapped in `overflow-x-auto` since this is the
  first table in this codebase wide enough to need it — kept the same
  ring/typography/spacing conventions as every other section, no
  redesign), plus a one-line summary above it
  (`{latestQuarter} vs {previousQuarter}`, with an "approximate" note
  when `source === 'yfinance_approx'`). A category with `null` renders
  as `N/A`, not `0.0%`.

## Data source honesty

**NSE integration is implemented but not verified against the live
site.** This sandbox cannot reach `nseindia.com` — see
`ingest/nse_client.py`'s own docstring for the full explanation
(session-bootstrap pattern, guessed-but-documented endpoint path and
JSON field names based on how NSE's unofficial API is known to work,
defensive `.get(...)` parsing throughout so a shape mismatch degrades
to `None` fields rather than a wrong number). Every parse step was unit
tested against realistic synthetic NSE-shaped JSON, including a
malformed-payload case (confirms it returns honest `None`s, not a
crash and not a guess). Before production use: run `python -c "from
ingest.nse_client import fetch_shareholding_pattern; print(
fetch_shareholding_pattern('RELIANCE'))"` from an environment with real
internet access and confirm the categories sum to roughly 100%.

**yfinance approximation genuinely cannot populate every category.**
`heldPercentInsiders`/`heldPercentInstitutions` are Yahoo's own (US-
filing-shaped) fields — Institutions is one combined number, so it
cannot be honestly split into FII vs. DII vs. Mutual Funds, and Yahoo
has no field mapping to Government or Others at all. All four are left
`null` on a `yfinance_approx` row — this is a hard data-source limit,
not a bug to fix.

## Verification performed

- `ingest/nse_client._parse_response` unit-tested against a realistic
  synthetic multi-period payload (correct category extraction, correct
  date parsing) and a garbled payload (confirmed `None` fields, not a
  crash, not a guess).
- `ingest/fetch_shareholding._fetch_one`'s fallback chain unit-tested
  with mocking across all three paths: NSE succeeds; NSE fails →
  yfinance fallback; both fail → reported as a clean per-symbol
  ingestion failure (never a crash of the whole run).
- `services/shareholding_service.get_shareholding_summary` tested
  against real seeded Postgres data — confirmed correct latest/previous
  quarter labels and correct percentage-point change math (e.g.
  Promoter 52.34% vs. 52.10% → `+0.24`, not a growth-rate percent).
- Full round-trip through the live FastAPI app: `GET
  /company/TESTCO/shareholding` and the embedded
  `Company.shareholdingSummary` field both verified against the same
  seeded data, alongside the Module 7 statement endpoints in the same
  test run (confirms the two modules coexist without interfering with
  each other or with the pre-existing scoring/verdict sections).
- Frontend: `npx tsc --noEmit` diffed against a from-scratch baseline
  of the original uploaded frontend — zero new errors introduced (see
  `CHANGELOG.md` for the full diff methodology). `npm run build`
  succeeds, including the modified `research.$symbol` route bundle.

## Honest limitations

1. NSE client unverified live (above) — degrades safely to
   yfinance-approx on any failure, so this is a data-quality risk, not
   an availability risk.
2. yfinance-approx cannot populate FII, Mutual Funds, Government, or
   Others individually — these stay `null` on approximated rows by
   design, per the brief's "never fabricate, return null" instruction.
