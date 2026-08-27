# Data Strategy

**Purpose:** what data comes from where, what's cached, what's never stored, and refresh cadence — both as currently implemented and as it should evolve.

**Audience:** engineers, especially anyone touching `ingest/`.

---

## 1. Sources, as actually implemented

| Data | Source | Ingest mechanism | Refresh reality |
|---|---|---|---|
| Daily OHLCV prices | Yahoo Finance via `yfinance` | `ingest/fetch_prices.py`, scheduled | Real, **weekly** (Milestone 9 — changed from weekdays-daily; column name `prices_daily`/`Daily OHLCV` refers to the granularity of each row, not the refresh frequency). `db/schema.sql`'s own comment: *"the only thing yfinance is fully trustworthy for."* |
| Technical indicators (RSI, moving averages, 52w range, VWAP, golden cross) | Derived from `prices_daily` | `ingest/compute_technicals.py`, scheduled | Real, weekly, recomputed not re-fetched — good pattern, keep it. |
| Fundamentals (ROE, ROCE, revenue/profit growth, margins, D/E, valuation ratios) | **Live, via `yfinance`'s `Ticker.info`** (the Kaggle dataset this used to depend on — "Detailed Financials Data Of 4492 NSE & BSE Company" — is no longer part of this project and `ingest/seed_fundamentals.py` cannot run without it) | `ingest/fetch_fundamentals.py`, scheduled weekly alongside prices/technicals (Milestone 9 — was daily) | Real, refreshable. Every row is tagged `source = 'yfinance'`. ROCE is a best-effort computation from Yahoo's own financial statements (EBIT / (Total Assets − Current Liabilities)) and is `NULL` when Yahoo's line items aren't present for a given company, rather than guessed. `ingest/seed_fundamentals.py` is kept only as a legacy/optional path for anyone who separately obtains the Kaggle export. |
| Shareholding pattern (promoter/FII/DII/pledge%) | Best-effort only, via the same `yfinance` call (`heldPercentInsiders`/`heldPercentInstitutions`), **or NSE's own disclosure when available (Milestone 7.5)** | `ingest/fetch_fundamentals.py` (delegates to `ingest/fetch_shareholding.py`'s shared implementation) / `ingest/fetch_shareholding.py` directly (`--skip-nse` to force the yfinance path) — weekly, per fetch_fundamentals's schedule (Milestone 9) | **Two-tier, tagged honestly per row.** `source='nse'` (real 7-category disclosure — Promoter/FII/DII/Mutual Funds/Public/Government/Others — via `ingest/nse_client.py`) is tried first; on any failure it falls back to `source='yfinance_approx'` (promoter/DII-combined proxy only, `mutual_funds_pct`/`government_pct`/`others_pct` left `NULL`, never guessed). **The NSE path is implemented but unverified against the live site** — see `MODULE_7C_SHAREHOLDING_REPORT.md` for why (this project's own build/verification environment has no route to `nseindia.com`) and what to check before trusting it in production. |
| Quarterly/Annual financial statements (Revenue, Net Profit, EPS, EBITDA, margins, Cash, Debt, FCF — real multi-period history) | `yfinance`'s statement endpoints (`quarterly_income_stmt`/`income_stmt`, `*_balance_sheet`, `*_cashflow`) — genuinely different from the `Ticker.info` snapshot the row above uses, and the only free source that returns real historical periods | `ingest/fetch_financial_statements.py`, scheduled weekly (Milestone 9 — was daily) | Writes to `financial_statements` (not `financials_quarterly` — see `ARCHITECTURE.md` §4's design-gap note for why this needed a new table). Every metric with no matching source line item is `NULL`, never derived from an assumption — see the ingest script's own docstring for the exact fallback chain per metric (e.g. EBITDA = direct line item, or Operating Income + D&A, or `NULL`). **Unverified against a live yfinance connection** — see `MODULE_7B_FINANCIAL_STATEMENTS_REPORT.md`. |
| Corporate announcements, results, dividends, board meetings (NSE) | Not built | — | Correctly deferred per `PRODUCT_ROADMAP.md` — lower priority than fixing fundamentals freshness. |
| Macro/sector/market news | RSS: Google News, Yahoo Finance, Moneycontrol, Economic Times, Business Standard | `services/news_provider.py` (provider registry) → `services/sector_classifier.py` → `services/market_summary_generator.py` → `ingest/weekly_news_refresh.py` | Built, **never run against a live feed** (no outbound network access in any build environment so far — validated with synthetic data only, per `CHANGELOG.md`). As of Milestone 9, present in `.github/workflows/ingest.yml` as a **manual `workflow_dispatch` opt-in step only** — deliberately not on the automatic weekly trigger, since TD-008 (below) is still open. Enabling the automatic schedule remains conditional on TD-008 being closed first — see §5. |
| Journal, thesis, watchlist, notes, ratings, tags | First-party, meant to be entirely user-authored | `POST`/`PUT`/`DELETE` on `journal_entries`, `journal_reviews`, `pipeline_items` (Milestones 2–4) | Real-time, on user action — write APIs exist for all three tables. Never touched by the ingest workflow, weekly or otherwise (`HANDOFF.md`'s "database safety requirements"). |

---

## 2. Caching and storage philosophy

**Stated principle (`PRODUCT_REQUIREMENTS.md` §9):** live market data comes from APIs on demand/cache; the database stores what's genuinely unique to the founder, plus derived/computed values. The database should not become a mirror of Yahoo Finance.

**What's actually stored and why it's still consistent with the principle:**
- `prices_daily` is cached, not fetched per-request — necessary because `yfinance` is rate-limited and technicals need historical series. This is *some* market data storage, but it's minimal (OHLCV only) and bounded to the tracked universe, which is consistent with "don't become a copy of Yahoo Finance" in spirit if not in absolute purity.
- `technical_snapshot` and `scores` are derived, recomputed on each refresh, never independently sourced — the correct pattern, and explicitly the reason the schema separates raw (`prices_daily`) from derived (`technical_snapshot`) tables.
- `financials_quarterly` and `shareholding_pattern` **were** the philosophy's weak point — a static Kaggle snapshot masquerading as live-cached data, with no refresh mechanism. As of `ingest/fetch_fundamentals.py`, `financials_quarterly` is refreshed on the same daily schedule as prices/technicals, closing most of the gap described in §4 option 2. `shareholding_pattern` is refreshed too, but only as an approximation (see the table above) — a genuine promoter/FII/DII/pledge% feed still requires the NSE-filings work described in §4.

**What should never be stored (and currently isn't):** full news article bodies (only title/summary/url are stored in `news_articles`), index-level or macro figures the schema has no source for (NIFTY 50, USD/INR, India VIX — correctly not faked; `discover_service.py`'s own comments document this as a deliberate gap, replaced with real market-breadth statistics computed over the tracked universe instead of invented index numbers).

---

## 3. Refresh cadence — current vs. target

| Data | Current cadence | Target cadence | Priority |
|---|---|---|---|
| Prices / technicals / fundamentals / financial statements / scores | **Weekly**, automated (Milestone 9 — changed from daily-weekdays; see `HANDOFF.md` §3) | No change needed | — |
| Fundamentals / shareholding UI staleness indicator | N/A — this is a UI gap, not a cadence one | A visible "as of" date on every score derived from fundamentals still doesn't exist in the UI — unaffected by Milestone 9's cadence change | High — see `TECHNICAL_DEBT.md` TD-001 |
| News / weekly intelligence | Manual `workflow_dispatch` opt-in only (Milestone 9) — still not automatic | Weekly, automatic, but only after being proven against a real feed manually first | Deferred — see `PRODUCT_ROADMAP.md` Phase 5 and `TECHNICAL_DEBT.md` TD-008, not Phase 1 |
| Journal / pipeline | Real-time, on user action — write APIs exist (Milestones 2–4) | No change needed | — |

---

## 4. The fundamentals freshness gap — specific recommendation

This was the single most consequential data decision facing the project, because every fundamental-side score in the product is built on it. Two honest paths forward, not mutually exclusive:

1. **Cheap and immediate:** add a `fundamentals_as_of` (or reuse `financials_quarterly.updated_at`) display everywhere a score is shown, so the founder is never silently trusting data of unknown age. This should ship before any new scoring factor is added — see `SCORING_ENGINE.md` §4. **Still not done** — this fix only addresses the underlying data staleness, not the missing UI indicator.
2. **Real fix, more effort:** replace or supplement the Kaggle seed with a genuinely refreshable source. **Partially done:** `ingest/fetch_fundamentals.py` now sources core fundamentals (ROE, ROCE, growth, valuation ratios, D/E) live from `yfinance`, free and refreshed daily — this closes the "frozen snapshot" problem for the numbers the scoring engine actually consumes. What it does *not* close: a true promoter/FII/DII/pledge% shareholding split (yfinance's insider/institutional fields are a rough proxy, not the NSE categories), which still requires NSE's own quarterly XBRL filings (free, but requires building a parser) or a paid data API. That remains a deliberate founder decision, not something to solve incidentally.

**Milestone 7 update:** the NSE-filings path from option 2 above has now been *built* (`ingest/nse_client.py` + `ingest/fetch_shareholding.py`), closing the "requires building a parser" gap in principle — but it's unverified against the live site (this project's build/verification environment has no route to `nseindia.com`; see `MODULE_7C_SHAREHOLDING_REPORT.md`), so it should be treated as "implemented, pending live confirmation," not "done," until someone runs it with real internet access and checks the output. Separately, Milestone 7 also added a real multi-period `financial_statements` table (Revenue/Net Profit/EPS/EBITDA/margins/Cash/Debt/FCF, both quarterly and annual) sourced from `yfinance`'s statement endpoints rather than the `Ticker.info` snapshot — this is what finally makes `SCORING_ENGINE.md` §4's earnings-quality trend factor buildable without new ingestion work; see `ARCHITECTURE.md` §4.

---

## 5. News pipeline — what "done" actually requires

Module 7 is architecturally sound (provider registry pattern, deduplication by normalized title, sector keyword classification with a documented fallback to company-name matching) but is not validated. Before it's treated as "built" anywhere in product communication:

1. Run it against at least one real live RSS pull, end to end, and manually verify the sector classification and summary output against what the source articles actually say.
2. ~~Add it to the scheduled GitHub Actions workflow~~ — **partially done, Milestone 9:** `ingest.yml` now has a `workflow_dispatch` input (`run_news_refresh`) that runs `weekly_news_refresh` as a manual, opt-in step — useful for step 1's real-feed test once network access allows it. It is **deliberately not on the automatic weekly schedule** — moving it there is still gated on step 1 above actually happening; see `TECHNICAL_DEBT.md` TD-008/TD-009.
3. Only then wire its `weekly_sector_intelligence.outlook` output into anything the scoring engine or homepage relies on (see `SCORING_ENGINE.md` §4.1, which explicitly says not to build a second sector-strength system independent of this one once it's proven).
