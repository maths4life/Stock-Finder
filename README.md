# Quant Terminal — Data Layer

This replaces `src/lib/mock-data.ts` in the React/TanStack app as the
source of truth. Everything here runs on free-tier infrastructure — see
the cost notes at the bottom.

## What's in here

```
db/schema.sql              Postgres schema: companies, prices, fundamentals,
                            shareholding, technical snapshots, scores, journal
ingest/db.py                Shared DB connection (reads DATABASE_URL)
ingest/universe.py           The list of tracked companies — start small, grow deliberately
ingest/indicators.py          RSI/MA/VWAP math, ported from the previous Streamlit project
ingest/fetch_prices.py        Daily job: yfinance -> prices_daily
ingest/compute_technicals.py  Daily job: prices_daily -> technical_snapshot
ingest/seed_fundamentals.py   One-time/occasional job: Kaggle CSV -> financials_quarterly + shareholding_pattern
ingest/compute_scores.py      Daily job: fundamentals + technicals -> scores
.github/workflows/ingest.yml  Free scheduled runner (GitHub Actions)
```

## One-time setup

1. **Create a free Postgres database.** Either [Supabase](https://supabase.com)
   or [Neon](https://neon.tech) — both have no-card free tiers. Copy the
   connection string.

2. **Apply the schema:**
   ```
   psql "$DATABASE_URL" -f db/schema.sql
   ```
   (Supabase and Neon both also let you paste this into their web SQL editor
   if you don't have `psql` installed locally.)

3. **Install dependencies locally** (for testing before you rely on the
   scheduled job):
   ```
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env   # then edit .env with your real DATABASE_URL
   ```

4. **Seed fundamentals from the free Kaggle dataset:**
   - Download "Detailed Financials Data Of 4492 NSE & BSE Company" from
     Kaggle (free account, no cost) and extract it. The archive contains
     one subfolder per company (e.g. `Pidilite Industries Ltd/`), each with
     `*_Basic_Info.csv`, `Ratios.csv`, `Yearly_Profit_Loss.csv`,
     `Quarterly_Profit_Loss.csv`, `Yearly_Balance_Sheet.csv`,
     `Yearly_Cash_flow.csv`, and (for most companies)
     `Yearly_Shareholding_Pattern.csv` / `Quarterly_Shareholding_Pattern.csv`
     — there is no single master CSV.
   - Smoke-test on a handful of companies first:
     ```
     python -m ingest.seed_fundamentals path/to/extracted/dataset --limit 50
     ```
   - Then run the full seed (~4,492 companies, ~25s against a local
     Postgres; a remote free-tier DB will be slower but should still finish
     in a few minutes since it's batched 150 companies per DB round trip):
     ```
     python -m ingest.seed_fundamentals path/to/extracted/dataset
     ```
   - `--dry-run` parses everything and prints counts without writing to the
     DB, useful for re-checking after a fresh Kaggle download in case the
     dataset's internal format changes again.

   This is a point-in-time snapshot, not a live feed — re-run it whenever
   you download a fresher export. It's your bootstrap, not your ongoing
   fundamentals pipeline. See the docstring at the top of
   `ingest/seed_fundamentals.py` for the exact field mappings and known
   approximations (e.g. `ebitda_margin_pct` is really OPM%, `debt_to_equity`
   is derived from the balance sheet, `current_ratio`/`peg`/
   `free_cash_flow_cr` are left NULL because the source doesn't have clean
   inputs for them). About half of the companies in this dataset are
   BSE-only (no NSE listing) — those get `symbol` = BSE code and
   `yahoo_ticker` ending in `.BO` instead of `.NS`.

5. **Run the daily jobs once locally to confirm everything works:**
   ```
   python -m ingest.fetch_prices
   python -m ingest.compute_technicals
   python -m ingest.compute_scores
   ```

6. **Turn on the free scheduler:**
   - Push this repo to GitHub.
   - In the repo's Settings → Secrets → Actions, add `DATABASE_URL` as a
     secret (same value as your `.env`).
   - The workflow in `.github/workflows/ingest.yml` runs automatically on
     weekday evenings after NSE market close. You can also trigger it
     manually from the Actions tab.

## Growing the universe

`ingest/universe.py` currently tracks the same 8 companies as the original
mock data, on purpose — confirm the pipeline works end-to-end on a small
set before scaling up. To grow it: pull the list of symbols you want from
your Kaggle CSV and append rows in the same shape. There's no code change
needed elsewhere; every script just loops over `UNIVERSE`.

## What's intentionally NOT here yet

- **Live/intraday prices** — everything here is end-of-day. Real-time
  needs a paid broker API license; out of scope while cost is $0.
- **Ongoing shareholding pattern updates** — the Kaggle seed is a
  snapshot. Keeping promoter/FII/DII % current requires either re-running
  the seed periodically or building a scraper against NSE's own public
  shareholding-pattern filings (no clean free API exists for this yet —
  see project notes).
- **AI-generated narrative rationale** — `compute_scores.py` currently
  generates a short templated explanation from real numbers, not an LLM
  call. This is deliberate: an explainable score beats an opaque one until
  the underlying data is trustworthy enough to hand to an LLM.
- **Journal review AI comparison** — `journal_reviews.ai_comparison_summary`
  exists in the schema but nothing populates it yet. That's the natural
  next piece once prices/fundamentals are flowing reliably.

## Cost check

Everything above runs at $0: Supabase/Neon free tier for Postgres, GitHub
Actions free minutes for the scheduled job, yfinance and the Kaggle
dataset cost nothing to use. The tradeoffs that come with "free" — daily
(not real-time) refresh, semi-manual shareholding updates — are the ones
already discussed and accepted.
