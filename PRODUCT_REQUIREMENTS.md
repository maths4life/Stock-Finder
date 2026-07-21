# Product Requirements Document (PRD)

**Purpose:** the single authoritative statement of what Stock Finder is, who it's for, and what it must and must not do. Every feature decision should trace back to something in this document.

**Audience:** founder (primary user), any future collaborator, future-you after a long absence.

**Status note:** this document resolved a real conflict found in the repo during the original audit. `md/Product_Vision.md` said *"Stock Finder is not a stock screener... not intended to become another Bloomberg Terminal."* `md/CLAUDE.MD` said *"Stock Finder is an institutional-grade stock research platform inspired by Bloomberg Terminal, TradingView, TIKR, and Screener.in... a professional investment research platform rather than a simple stock dashboard."* These were two different products. This PRD adopted the `Product_Vision.md` framing — a personal research tool, not a Bloomberg competitor — because that is what the founder stated directly and repeatedly. Both `Product_Vision.md` and `CLAUDE.MD` have since been intentionally removed from the repository (confirmed as of Milestone 1); this PRD is now the sole statement of vision and scope, and the conflict they represented is closed, not pending (see `TECHNICAL_DEBT.md` TD-012 and `DECISIONS.md` ADR-009).

---

## 1. Vision

Stock Finder is a personal investment research tool that answers one question every day: **"What are the best companies I should research today?"**

It is not a screener (doesn't show everything matching a filter), not a portfolio manager (doesn't track positions/P&L), not a news aggregator (doesn't show every article), and not a Bloomberg Terminal competitor (doesn't try to cover every asset class, every workflow, every user type).

It combines fundamentals and technicals into a small, explainable shortlist, and gives the founder a place to write down and later review their own investment reasoning.

## 2. Mission

Reduce the time between *"I don't know what to research"* and *"I understand this company well enough to make an informed decision,"* through transparent, explainable scoring — never a black box, never AI-generated opinions standing in for real analysis.

## 3. Users

**Primary and, for the foreseeable future, only user:** the founder. Every design decision should be checked against "does this make the founder's actual daily investing workflow better," not "does this make the product more complete/general/impressive."

**Secondary, future, not yet active:** a small number of friends, added manually, with no expectation of self-serve onboarding, billing, or support infrastructure.

**Explicitly not a target user:** intraday traders, options traders, high-frequency traders, or anyone wanting a general-purpose screener across the whole NSE/BSE universe with no point of view.

## 4. Investing philosophy this product encodes

- 6–12 month holding horizon, not intraday or swing trading.
- Both fundamentals and technicals must line up. A good business bought at the wrong time is a bad investment; a good chart on a weak business is not enough.
- Ideal investment profile: strong business, strong financials, healthy earnings, good management, positive sector outlook, attractive valuation, technical confirmation, positive momentum.

## 5. Problem statement

The founder currently spends time daily manually reviewing charts, financial statements, news, sector developments, results, corporate announcements, and screeners to find investment ideas. This is repetitive and should be reducible by software that surfaces a short, high-conviction, explained list instead of requiring manual search across everything.

## 6. Core features (what the product must do)

| Feature | One-line description | Status — see `CURRENT_STATE.md` for detail |
|---|---|---|
| Opportunity shortlist (Discover / homepage) | 10–15 high-conviction companies, ranked, each with a reason, drawn from a real universe — not a fixed hand-picked list. | Built, but structurally incomplete — see `CURRENT_STATE.md` §1 |
| Explainable scoring engine | Every score decomposes into named factors with real numbers behind them, never an opaque number. | Built (v1, 2-factor), spec for v2 in `SCORING_ENGINE.md` |
| Company research page | Overview, chart, technicals, fundamentals, score breakdown, thesis, personal notes, watchlist status, in one place. | Built |
| Investment journal | Record a thesis (including a pre-committed sell trigger), and later review whether it played out. | Schema built, **not connected to any API or persistence** — see `CURRENT_STATE.md` §1 |
| Watchlist / pipeline | Track companies through Watching → Researching → Conviction. | Partially built — read path exists, no write path |
| Sector/event-driven news | News exists to answer "what should I research because of this event," not to list every article. | Built (Module 7), never validated against a live feed — see `CURRENT_STATE.md` §1 |

## 7. Explicit non-features

These are not bugs of omission — they are deliberate exclusions, and should stay excluded unless this PRD is revised:

- Not a SaaS product. No billing, no self-serve signup, no multi-tenant account model beyond a nullable `user_id` for future convenience.
- Not a portfolio manager. No live position tracking, no P&L, no order execution.
- Not a general-purpose screener across the full NSE/BSE universe with arbitrary filters as the primary interface (a filtered table view can exist as a secondary page, but it is not the product's front door).
- Not a news reader. Volume of news coverage is explicitly a non-goal.
- Not an AI-opinion generator. Any AI feature must produce genuine incremental investing value over the deterministic rule-based approach, or it doesn't ship. Currently: no AI feature is justified, and none should be built until the rule-based scoring engine is calibrated (see `SCORING_ENGINE.md` §5).
- Not a data warehouse. The database stores what's unique to the founder (journal, thesis, watchlist, notes, ratings) and derived scores; it is not meant to become a full copy of Yahoo Finance or NSE data.

## 8. Success metrics

Because this is a single-user personal tool, success is behavioral, not commercial:

1. **Habitual use.** The founder opens this before looking anywhere else, at least most weekdays. If usage lapses for an extended period, that is a product failure signal, not a marketing problem.
2. **Shortlist trust.** A majority of the daily/weekly shortlist should be names the founder didn't already have in mind — i.e., the tool is actually surfacing, not just redisplaying a pre-curated list. (Currently unmeasurable — see `CURRENT_STATE.md` §1, universe = 8 companies.)
3. **Journal follow-through.** A meaningful fraction of journal theses get a completed review (`journal_reviews.thesis_played_out` populated) within the stated horizon. (A write path now exists as of Milestone 4 — `POST`/`PUT`/`DELETE /journal-reviews` — but no actual reviews have been recorded yet in any real deployment, so this metric remains unmeasured until the founder starts using it.)
4. **Calibration.** Over time, higher-scored companies should, on average, outperform lower-scored ones over the stated 6–12 month horizon, measured against the founder's own journal history. (Not yet measured — see `SCORING_ENGINE.md` §5.)

Explicitly *not* a success metric at this stage: user count, revenue, retention curves, or any other SaaS-shaped metric. If those become relevant, this PRD needs a new version, not a footnote.

## 9. Product philosophy (design constraints that apply to every feature)

1. **No fake data.** If a value is unavailable, show "—", never a fabricated or defaulted-to-zero number that could be mistaken for a real zero.
2. **Explain everything.** No score, ranking, or recommendation ships without a real, computed reason attached.
3. **Transparency over sophistication.** A simple rule you can fully trust beats a complex model you have to take on faith. This applies to scoring and to any future AI feature.
4. **Quality over quantity.** 10–15 explained ideas beat 500 unexplained ones, always.
5. **APIs over data hoarding.** Live market data comes from external sources on demand/cache; the database is for what's genuinely first-party (journal, notes, watchlist, ratings, tags) and for derived/computed values, not a mirror of a market data provider.

## 10. Relationship to other documents

- Feature prioritization against this PRD lives in `PRODUCT_ROADMAP.md`.
- Whether the current code satisfies this PRD lives in `CURRENT_STATE.md`.
- Why specific technical choices were made in service of this PRD lives in `DECISIONS.md`.
