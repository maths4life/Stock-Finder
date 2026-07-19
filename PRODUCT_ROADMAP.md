# Product Roadmap

**Purpose:** feature-oriented phases — what gets built, in what order, and why that order. Read alongside `ENGINEERING_ROADMAP.md`, which sequences the non-feature work in parallel.

**Audience:** founder, future collaborators.

**Sequencing principle:** nothing here is sequenced by "what's exciting to build." It's sequenced by "what does the core promise in `PRODUCT_REQUIREMENTS.md` actually depend on." The news pipeline (Module 7) was built before the journal write path and before universe expansion — that ordering is not repeated here.

---

## Phase 1 — Close the loop (make the existing vision actually usable)

**Goal:** every feature that currently looks built in a screenshot is actually usable end-to-end.

- ~~Build the journal write path: `POST/GET/PUT/DELETE /journal` (`TECHNICAL_DEBT.md` TD-003)~~ **Done, Milestone 2.** `journal-entries` CRUD is live; mock fallback removed.
- Build the pipeline write path: add/move/remove items in `pipeline_items` (TD-004). **Now the top remaining item in this phase.**
- Add a "Due for Review" surface, driven by `journal_entries.review_due_at`, so reviews are prompted rather than something the founder has to remember (`UI_UX.md` §5). Note: `review_due_at` is now populated automatically as of Milestone 2, but there's still no dedicated "due for review" surface, and no way to record a review at all yet — see `TECHNICAL_DEBT.md` TD-017 (`journal_reviews` unbuilt).
- Add a visible fundamentals "as of" date wherever a score is shown (TD-001, short-term fix).

**Why first:** these are the parts of the product that make it a personal investing *tool* rather than a dashboard. Without them, there is no feedback loop, and without a feedback loop, nothing else — including a better scoring engine — can be validated later.

---

## Phase 2 — Universe expansion

**Goal:** the homepage's core claim ("10–15 out of a real universe") becomes true instead of aspirational copy over 8 hardcoded companies.

- Expand `ingest/universe.py` (or replace it with a generated list) from 8 to at least 150–300 NSE large/mid-cap names, sourced from the company list already present in the Kaggle dataset rather than added by hand one at a time.
- Load-test the daily cron (`fetch_prices` → `compute_technicals` → `compute_scores`) against the larger universe — `yfinance` rate limits and GitHub Actions job time limits are real constraints at this scale and should be verified, not assumed.
- Re-verify the Discover page's grouping queries (`services/discover_service.py`) behave sensibly with a real universe instead of always returning all 8 companies reshuffled.

**Why second:** every other product decision (whether the score is trustworthy, whether "Discover" means anything, whether the homepage should ever show "nothing new today") is unfalsifiable at 8 companies. This has to happen before scoring v2 is worth building.

---

## Phase 3 — Scoring Engine v2

**Goal:** move from the v1 absolute-threshold model to the sector-relative, trend-aware model specified in `SCORING_ENGINE.md` §4.

- Sector-relative normalization for fundamental factors.
- Wire in institutional interest (`shareholding_pattern`) — cheapest available win, do this first within this phase.
- Split momentum from mean-reversion in the technical score.
- Multi-quarter earnings-quality factor, using `financials_quarterly` as an actual time series.
- Begin the calibration loop against real journal history accumulated since Phase 1.

**Why third, not first:** a more sophisticated model over 8 hand-picked companies and zero journal history (the state before Phases 1–2) produces false confidence, not a better score. This phase depends on both prior phases.

---

## Phase 4 — Research Workspace polish

**Goal:** the research page becomes the place decisions are actually made, not just information displayed.

- Surface journal entries and notes directly on the research page (blocked on Phase 1's write path).
- Score breakdown UI upgraded to match the full explainability contract in `SCORING_ENGINE.md` §5 (every factor traceable to its underlying numbers in the UI, not just in source comments).
- Watchlist status visible and actionable directly from the research page.

---

## Phase 5 — Sector-first news, validated

**Goal:** Module 7 goes from "built but unverified" to genuinely trustworthy.

- Run the RSS pipeline against real live feeds (blocked, until now, on network access) and manually verify sector classification and weekly summaries against real articles.
- Add the weekly refresh job to the scheduled GitHub Actions workflow.
- Only then, wire `weekly_sector_intelligence.outlook` into the scoring engine's sector-strength factor (`SCORING_ENGINE.md` §4.1) — do not build a second, parallel sector-strength system in the meantime.

**Why fifth, not second (where it currently sits in build order):** this is a real feature but not one the core loop depends on. It was over-prioritized relative to Phases 1–2 in the actual build history; this roadmap corrects that ordering going forward.

---

## Explicitly not on this roadmap

Per `PRODUCT_REQUIREMENTS.md` §7: portfolio/P&L tracking, self-serve multi-tenancy/billing, a general-purpose full-NSE screener as the primary interface, AI-generated opinions replacing the deterministic score. If any of these become genuinely necessary, that requires a `PRODUCT_REQUIREMENTS.md` revision first, not a roadmap addition.

Ideas that don't yet meet the bar for a phase live in `IDEAS.md` — promote from there deliberately, don't build from it directly.
