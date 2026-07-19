# Data Strategy

**Purpose:** what data comes from where, what's cached, what's never stored, and refresh cadence — both as currently implemented and as it should evolve.

**Audience:** engineers, especially anyone touching `ingest/`.

---

## 1. Sources, as actually implemented

| Data | Source | Ingest mechanism | Refresh reality |
|---|---|---|---|
| Daily OHLCV prices | Yahoo Finance via `yfinance` | `ingest/fetch_prices.py`, scheduled | Real, daily on weekdays. `db/schema.sql`'s own comment: *"the only thing yfinance is fully trustworthy for."* |
| Technical indicators (RSI, moving averages, 52w range, VWAP, golden cross) | Derived from `prices_daily` | `ingest/compute_technicals.py`, scheduled | Real, daily, recomputed not re-fetched — good pattern, keep it. |
| Fundamentals (ROE, ROCE, revenue/profit growth, margins, D/E, valuation ratios) | A one-time Kaggle dataset export ("Detailed Financials Data Of 4492 NSE & BSE Company") | `ingest/seed_fundamentals.py`, run manually, once | **Frozen.** No scheduled refresh exists. Every row is tagged `source = 'kaggle_seed'` for exactly this reason — it's documented as a known limitation in the seed script itself, not hidden. |
| Shareholding pattern (promoter/FII/DII/pledge%) | Same Kaggle export | Same script, same freeze problem | Same as above. |
| Corporate announcements, results, dividends, board meetings (NSE) | Not built | — | Correctly deferred per `PRODUCT_ROADMAP.md` — lower priority than fixing fundamentals freshness. |
| Macro/sector/market news | RSS: Google News, Yahoo Finance, Moneycontrol, Economic Times, Business Standard | `services/news_provider.py` (provider registry) → `services/sector_classifier.py` → `services/market_summary_generator.py` → `ingest/weekly_news_refresh.py` | Built, **never run against a live feed** (no outbound network access in the build environment — validated with synthetic data only, per `CHANGELOG.md`). Not present in the scheduled GitHub Actions workflow even if it did work. |
| Journal, thesis, watchlist, notes, ratings, tags | First-party, meant to be entirely user-authored | None — no write API exists at all | See `CURRENT_STATE.md` §1. This is the one category of data explicitly meant to be first-party and it's the one category with zero working ingestion path (because there's no write path). |

---

## 2. Caching and storage philosophy

**Stated principle (`PRODUCT_REQUIREMENTS.md` §9):** live market data comes from APIs on demand/cache; the database stores what's genuinely unique to the founder, plus derived/computed values. The database should not become a mirror of Yahoo Finance.

**What's actually stored and why it's still consistent with the principle:**
- `prices_daily` is cached, not fetched per-request — necessary because `yfinance` is rate-limited and technicals need historical series. This is *some* market data storage, but it's minimal (OHLCV only) and bounded to the tracked universe, which is consistent with "don't become a copy of Yahoo Finance" in spirit if not in absolute purity.
- `technical_snapshot` and `scores` are derived, recomputed on each refresh, never independently sourced — the correct pattern, and explicitly the reason the schema separates raw (`prices_daily`) from derived (`technical_snapshot`) tables.
- `financials_quarterly` and `shareholding_pattern` are the philosophy's actual weak point: a static snapshot masquerading as live-cached data, with no refresh mechanism. This isn't "caching," it's a stale mirror with no expiry policy. See §4.

**What should never be stored (and currently isn't):** full news article bodies (only title/summary/url are stored in `news_articles`), index-level or macro figures the schema has no source for (NIFTY 50, USD/INR, India VIX — correctly not faked; `discover_service.py`'s own comments document this as a deliberate gap, replaced with real market-breadth statistics computed over the tracked universe instead of invented index numbers).

---

## 3. Refresh cadence — current vs. target

| Data | Current cadence | Target cadence | Priority |
|---|---|---|---|
| Prices / technicals / scores | Daily, weekdays, automated | No change needed | — |
| Fundamentals / shareholding | None (one-time) | At minimum, a visible "as of" date on every score derived from it; ideally quarterly refresh tied to actual result dates | High — see `PRODUCT_ROADMAP.md` Phase 1 and `TECHNICAL_DEBT.md` TD-001 |
| News / weekly intelligence | None scheduled; untested | Weekly, but only after being proven against a real feed manually first | Deferred — see `PRODUCT_ROADMAP.md` Phase 5, not Phase 1 |
| Journal / pipeline | N/A (user-authored) | Real-time, on user action, once a write API exists | High — see `PRODUCT_ROADMAP.md` Phase 1 |

---

## 4. The fundamentals freshness gap — specific recommendation

This is the single most consequential data decision facing the project, because every fundamental-side score in the product is built on it. Two honest paths forward, not mutually exclusive:

1. **Cheap and immediate:** add a `fundamentals_as_of` (or reuse `financials_quarterly.updated_at`) display everywhere a score is shown, so the founder is never silently trusting data of unknown age. This should ship before any new scoring factor is added — see `SCORING_ENGINE.md` §4.
2. **Real fix, more effort:** replace or supplement the Kaggle seed with a genuinely refreshable source — NSE's own quarterly XBRL filings (free, but requires building a parser) or a paid fundamentals API (trades engineering time for a subscription cost). This is a data-sourcing decision the founder needs to make deliberately; it is not something to solve incidentally while building an unrelated feature.

---

## 5. News pipeline — what "done" actually requires

Module 7 is architecturally sound (provider registry pattern, deduplication by normalized title, sector keyword classification with a documented fallback to company-name matching) but is not validated. Before it's treated as "built" anywhere in product communication:

1. Run it against at least one real live RSS pull, end to end, and manually verify the sector classification and summary output against what the source articles actually say.
2. Add it to the scheduled GitHub Actions workflow (`ingest.yml` currently only runs price/technical/score jobs).
3. Only then wire its `weekly_sector_intelligence.outlook` output into anything the scoring engine or homepage relies on (see `SCORING_ENGINE.md` §4.1, which explicitly says not to build a second sector-strength system independent of this one once it's proven).
