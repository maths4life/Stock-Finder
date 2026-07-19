# Module 5 — Charts Report

## Audit summary

`API_CONTRACT.md` listed Module 5 (`GET /company/{symbol}/prices`) as
"Not built," but `CHANGELOG.md`'s Module 3 entry shows the endpoint,
`services/technical_service.py`, `schemas/technical.py`, the frontend
`fetchCompanyPrices()`/`useCompanyPrices()` pair, the
`queryKeys.companies.prices(symbol, range)` key, and a `PriceChart.tsx`
component were all already built and live as fallout of Module 3 (the
Research page needed *a* price chart, so one was added ahead of Module 5
formally starting). Verified this directly against the uploaded repo:

- `backend/routes/companies.py` — `GET /company/{symbol}/prices` exists,
  delegates to `technical_service.get_price_history`, deliberately
  returns `[]` instead of 404 for a symbol with no price rows.
- `backend/services/technical_service.py` — one query against
  `prices_daily`, returns `PriceBar` (`date`, `open`, `high`, `low`,
  `close`, `volume`) for every bar in the requested range. Full OHLCV was
  already being read from the database and sent over the wire.
- `frontend/src/features/company/components/PriceChart.tsx` — rendered
  only `close` as a recharts `AreaChart`. `open`/`high`/`low`/`volume`
  were fetched, typed, and unused.

So the actual gap wasn't missing data or a missing endpoint — it was that
the existing chart didn't match `CLAUDE.md`'s own charting rule
(`Price → Candlestick`) or its tech-stack entry (`TradingView Lightweight
Charts`). Per your direction, Module 5's job is exactly that: turn the
already-correct data into a real candlestick + volume chart.

## Architectural decision

Rather than add a second component or a parallel data path,
`PriceChart.tsx` was rewritten in place, keeping its exact external
contract:

```ts
type Props = {
  data: PriceBar[];
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  isLoading?: boolean;
};
```

`research.$symbol.tsx` (the only consumer) calls it exactly as before —
**zero changes needed there**, in `useCompanyPrices`, in
`fetchCompanyPrices`, in the query key, or on the backend. Same principle
Module 4 used for `GET /companies`: change the implementation behind an
already-agreed contract instead of touching every call site.

**Library choice — Lightweight Charts, not recharts.** Candlesticks need
OHLC geometry (wicks + bodies) that recharts doesn't provide a first-class
primitive for; hand-rolling it on top of recharts' `Bar`/`ReferenceLine`
primitives would be a second, bespoke charting system living next to the
`shared/components/ui/chart.tsx` recharts wrapper already used everywhere
else. `CLAUDE.md`'s own tech-stack section names TradingView Lightweight
Charts for exactly this job, so this module adds it as a dependency
scoped to price charts specifically — recharts remains the default for
every other chart type per `CLAUDE.md`'s chart-type table (allocation →
pie/treemap, returns → line, revenue → bar, etc.), nothing about that
changes.

**Colors — theme tokens, not new ones.** `<canvas>` can't resolve
`var(--token)` the way SVG/DOM styles can (recharts's old
`stroke="var(--color-accent)"` worked because SVG attributes are real CSS
properties; Lightweight Charts paints on a 2D canvas context, which needs
concrete resolved color strings). `readThemeColors()` reads
`getComputedStyle(document.documentElement)` for the same tokens already
defined in `styles.css` and consumed by `shared/components/ui/chart.tsx`'s
`THEMES` map (`--positive`/`--negative` for up/down candles and volume
bars, `--hairline`/`--hairline-strong` for gridlines/axis borders,
`--ink-muted` for axis text) — no new colors invented, and it will follow
the `.dark` class the same way the rest of the app's charts do if/when a
theme toggle is wired up.

## Endpoints

| Endpoint | Status |
|---|---|
| `GET /company/{symbol}/prices` | Unchanged. Audited only — already correct, already returns full OHLCV, already consumed correctly by the frontend query layer. |

No backend files were modified for this module.

## Services

No backend service changes. `technical_service.py` was audited and needs
nothing — every field the new chart renders (`open`, `high`, `low`,
`close`, `volume`) was already in `PriceBar` and already populated from
`prices_daily` by `ingest/compute_technicals.py` / `ingest/fetch_prices.py`. Nothing was added to the database or the ingest
pipeline.

## Frontend hooks / API layer

- `fetchCompanyPrices`, `useCompanyPrices`,
  `queryKeys.companies.prices(symbol, range)` — audited, unchanged. All
  three already matched this module's needs exactly.

## Frontend components updated

- `frontend/src/features/company/components/PriceChart.tsx` — rewritten.
  - Renders a candlestick series (`open`/`high`/`low`/`close`) plus a
    volume histogram beneath it on a separate price scale, colored by
    the same up/down logic (`close >= open`).
  - Range selector buttons (`1M`/`3M`/`6M`/`1Y`/`5Y`/`ALL`) unchanged —
    same markup, same `onRangeChange` callback.
  - Loading skeleton and "No price history available for this range."
    empty state preserved exactly, same thresholds (`data.length < 2`).
  - Chart instance is created once (`useEffect` with `[]` deps) and
    updated via `.setData()` on range/data changes, rather than
    recreated per range switch — avoids flicker and repeated
    `ResizeObserver` setup/teardown.
  - A `ResizeObserver` on the chart's container keeps it responsive
    without a hardcoded width, consistent with the rest of the app's
    layout (`AppShell`'s `max-w-4xl` container, etc.).
  - Chart height increased from `220px` to `280px` to make room for the
    volume pane beneath the candles; range-selector row and empty/loading
    states unchanged otherwise.
- `frontend/package.json` — added `lightweight-charts` (`^4.2.0`).

## Mock APIs removed

None existed for this module.

## Known limitations / follow-ups

1. **Dark mode isn't actually wired up yet** — `routes/__root.tsx` never
   applies a `.dark` class to `<html>`, so `readThemeColors()` currently
   always resolves the light-theme tokens. The chart will pick up dark
   colors automatically the moment a theme toggle adds/removes `.dark`
   on `<html>` (each chart (re)build/data-update re-reads computed
   style), but there's no live re-theming *without* a remount/update —
   acceptable since nothing else in the app re-themes live either.
2. **`lightweight-charts` version pinned, not verified against a real
   install.** No network access in this environment to run
   `npm install`, so the `addCandlestickSeries`/`addHistogramSeries` API
   surface used here (v4-style) couldn't be checked against actual
   installed type declarations. `^4.2.0` is a real, stable major
   version; if the project standardizes on v5 later, `addSeries(CandlestickSeries, ...)` replaces the `addCandlestickSeries(...)` calls — a small, contained change confined to this one file.
3. **Mouse wheel zoom disabled deliberately** (`handleScroll.mouseWheel: false`, `handleScale.mouseWheel: false`) so the chart doesn't hijack
   normal page scrolling on the Research page, which is a long scrolling
   document. Pinch-zoom and click-drag pan are still enabled.
4. Volume bars use only `--positive`/`--negative` (no separate
   "volume color" token exists in `styles.css`) — consistent with how the
   candles themselves are colored, not a new design decision.

## Validation performed

- `PriceChart.tsx` and every other touched/audited `.ts`/`.tsx` file
  parsed with the TypeScript compiler's parser (syntax-only, via
  `ts.createSourceFile`) — zero syntax errors.
- `package.json` validated as well-formed JSON after the dependency
  addition.
- Manually traced the full data path end-to-end against the actual
  uploaded source (not from memory): `routes/companies.py` →
  `technical_service.get_price_history` → `PriceBar` → `fetchCompanyPrices` → `useCompanyPrices` → `research.$symbol.tsx` →
  `PriceChart` — confirmed every field the new chart consumes
  (`open`/`high`/`low`/`close`/`volume`/`date`) is present at every hop
  with matching names/types, and that `date`'s `YYYY-MM-DD` format from
  Python's `date.isoformat()` matches the `BusinessDay`-string format
  Lightweight Charts expects for daily series (no conversion needed).
- Confirmed via `grep` that `PriceChart` has exactly one consumer
  (`research.$symbol.tsx`) and that its props usage there
  (`data`, `range`, `onRangeChange`, `isLoading`) matches the rewritten
  component's signature unchanged.
- **Could not run** `npm install`, `npx tsc --noEmit` against the real
  dependency graph, `npm run build`, `npm run dev`, or exercise the chart
  in a browser — no network access and no `node_modules` in this
  environment (same constraint noted in `API_CONTRACT.md`'s Module 1
  validation section and `MODULE_4_REPORT.md`'s validation section).
  **Please run before treating Module 5 as done:**

  ```
  cd frontend && npm install && npx tsc --noEmit && npm run build && npm run dev
  # then open a company's Research page and confirm the candlestick +
  # volume chart renders correctly across all six range buttons
  ```
- No backend changes were made, so no backend validation was required
  beyond the audit above; `technical_service.py` was not touched.

## Stop condition

Module 6 (News) has not been started — it needs a news table/ingestion
source not yet in the schema, per `API_CONTRACT.md`. Awaiting approval
before scoping that.
