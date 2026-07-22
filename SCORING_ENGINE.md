# Scoring Engine Specification

**Purpose:** describe the scoring engine — the core of the product — in enough detail that someone could rebuild it from this document alone. Covers current implementation, its problems, and the target v2 design.

**Audience:** founder, any engineer touching `services/scoring_service.py`, `ingest/compute_scores.py`, or `analysis/`.

---

## 0. Current implementation (v1.5, shipped) — supersedes §2 below

**Location:** `backend/backend/analysis/scoring_engine.py` — the single source of truth, called by both `services/company_service.py` (live, per-request) and `ingest/compute_scores.py` (batch job, refreshes the `scores` table used for SQL-level sorting in Discover/Screener). See that module's own docstring for the full contract; this section is the narrative quant-review version of the same document.

This was a full review-and-improve pass on v1 (§2), driven by the problems logged in §3 below. It is **not** the v2 redesign in §4 — no sector-relative percentile scoring, no multi-quarter trend/earnings-quality factor, no calibration loop. It's the highest-value subset of v2 gettable without a larger universe or backtest history: real new data sources already in the schema wired in, an honest fix to how missing data is handled, and full UI transparency. §4's target architecture is still the direction to build toward.

### 0.1 What changed vs. v1

| Problem (§3) | v1 | v1.5 fix |
|---|---|---|
| §3.5 Valuation not sector-relative | Absolute P/E cutoff only | **Sector-relative P/E**: company P/E compared against the live average P/E of same-sector peers (`companies.sector` + `financials_quarterly.pe`, min. 2 peers), falling back to absolute bands only when no peer data exists. Real data, not invented — see `_score_pe`/`_fetch_sector_avg_pe`. |
| §3.3 Institutional interest schema-complete, score-absent | `shareholding_pattern` unused in scoring | **Promoter Holding** now a scored fundamental metric (8 pts). FII/DII *trend* (direction, not just level) was evaluated but not scored — see §0.3, "deliberately not done." |
| §3.4 Momentum/mean-reversion conflated | RSI and DMA-trend combined into one undifferentiated technical score, RSI only ever penalized | RSI (mean-reversion oscillator, 20 pts), Above-50DMA/Above-200DMA (trend, 15+20 pts), and the new 52-Week Range Position (positioning, 20 pts) are separate, individually-explained metrics. RSI now has a full 6-band curve (rewards the 55-70 "healthy uptrend" zone instead of only ever subtracting for overbought). |
| Golden cross had no bearish counterpart | Only `golden_cross` existed in the schema | Added `death_cross` detection (`ingest/indicators.py::detect_death_cross`, mirrors the existing golden-cross logic), stored in `technical_snapshot.death_cross` (migration in `db/schema.sql`), scored as the bearish half of one "Golden / Death Cross" metric. |
| §3.7 threshold provenance undocumented | Magic numbers with no comment | Every threshold in `scoring_engine.py` has an inline rationale comment (e.g. why 15% ROE, why 0.3/0.5/1.0/1.5 D/E bands) — no bare magic numbers. |
| Missing data silently defaulted | v1's 50-baseline additive model effectively treated "no data" the same as "data confirming average" | A metric with no underlying value is **excluded** from both the numerator and denominator (`score=0, maxScore=0`) rather than scored at all. The percentage shown is "% of available points earned," not "% of all possible points, some fabricated." Only if *every* metric in a group is unavailable does the group fall back to a flat neutral 50. |
| Overall weighting was an unstated 50/50 (see §2.3) | Not documented anywhere as a ratio | Explicit **60% Fundamental / 40% Technical**, returned in the API as `weighting`, with the rationale (quality/growth dominate over a multi-month research horizon) stated in `scoring_engine.py`'s module docstring. |
| Zero UI transparency | Only a bare `overallScore` number rendered anywhere | Full breakdown returned via `scoreBreakdown` (see §0.2) and rendered as an expandable "Why this score?" panel on the Research detail page (`frontend/src/features/company/components/ScoreBreakdown.tsx`) — every point traced to a real value, a pass/fail read, and a plain-English reason. |

### 0.2 Points table (v1.5)

Fundamental (11 metrics, 100 pts): ROE 12 · ROCE 10 · Revenue Growth YoY 10 · Profit Growth YoY 12 · Debt/Equity 12 · Current Ratio 8 · P/E vs Sector 10 · PEG 8 · P/B 6 · Dividend Yield 4 · Promoter Holding 8.

Technical (6 metrics, 100 pts): RSI(14) 20 · Above 50-DMA 15 · Above 200-DMA 20 · Golden/Death Cross 15 · Volume Breakout 10 · 52-Week Range Position 20.

`overallScore = 0.6 × fundamentalScore + 0.4 × technicalScore` (falls back to whichever side has data if the other is fully unavailable; 50.0 neutral if neither has any data at all — a brand-new/untracked company).

### 0.3 Deliberately not done in this pass

- **FII/DII holding *trend*** (direction of change quarter over quarter) was considered but not added as a scored metric: `get_shareholding_trend()` (used for the Research page's shareholding chart) issues an extra per-symbol query and isn't available cheaply on the list endpoint, and scoring it only on the detail page would make the list-card score and detail-page score legitimately different numbers for the same company — a worse transparency trade than leaving it unscored. Promoter Holding *level* (available on both endpoints with zero extra queries) was scored instead. Revisit once FII/DII history is denormalized onto the main query path.
- **Earnings-quality / multi-quarter consistency** (§3.2, §4.1) — genuinely needs the v2 trend-aware architecture (§4), not a bolt-on; still on the roadmap there.
- **PEG's `salesGrowthPct`/`profitGrowthPct` cross-check** for margin direction was added as a *narrative note inside the Profit Growth reason string* (see `_score_profit_growth`), not a separate scored metric — avoids double-counting the same two numbers as two separate point sources.

---

## 1. Philosophy (unchanged from v1 through v1.5 — do not compromise on this)

A transparent, weighted, rule-based score that can be fully explained beats an opaque model that has to be trusted blindly. Every score must decompose into named factors backed by real, stored numbers. No factor, weight, or output may be fabricated, defaulted silently, or generated by an LLM. This is stated in `PRODUCT_REQUIREMENTS.md` §9 and is a hard constraint, not a preference.

---

## 2. Original v1 implementation — superseded by §0, kept for history



Location: `backend/backend/ingest/compute_scores.py` (batch computation, writes to `scores` table) and `backend/backend/services/scoring_service.py` (derived heuristics used at request time: risk level, expected return, checklist, pros/cons, verdict text).

### 2.1 `fundamental_score` (`ingest/compute_scores.py`)

Starts at a neutral baseline of 50, then applies capped additive deltas:

| Factor | Rule | Cap |
|---|---|---|
| ROE | `+ (roe_pct - 15)`, clamped | −15 to +20 |
| ROCE | `+ (roce_pct - 15)`, clamped | −10 to +15 |
| Profit growth YoY | `+ (profit_growth_pct / 2)`, clamped | −15 to +15 |
| P/E | `+ ((35 - pe) / 5)`, clamped, only if `pe > 0` | −10 to +10 |

Final score clamped to `[0, 100]`.

### 2.2 `technical_score` (`ingest/compute_scores.py`)

Also a 50-baseline additive model:

| Factor | Rule |
|---|---|
| Above 200-DMA | `+15` |
| Above 50-DMA | `+10` |
| Golden cross (MA50 crossed above MA200 recently) | `+10` |
| RSI > 70 (overbought) | `−10` |
| RSI < 30 (oversold) | `−5` |

### 2.3 `overall_score`

A combination of `fundamental_score` and `technical_score` (see `compute_scores.py` for the exact combination — same file, downstream of the two functions above), stored per symbol in `scores.overall_score` along with `verdict` and a generated `rationale` string.

### 2.4 Derived heuristics (`services/scoring_service.py`)

Not part of the score itself, but built from it and from the same input fields:

- `risk_level()` — High/Moderate/Low from `debt_to_equity` and `roe` thresholds.
- `expected_return_and_horizon()` — a placeholder formula keyed off risk level and overall score. Explicitly documented in the source as a placeholder, not a real return model.
- `research_checklist()`, `pros_and_cons()`, `verdict_summary()` — threshold reads of the same fields (ROE, promoter holding, 200-DMA position, profit growth, P/E, RSI), phrased as prose. This is the best-executed part of the current engine: genuinely transparent, genuinely tied to real numbers, no LLM involved.

### 2.5 Module 6 (`analysis/engine.py`) rating layer

A second, separate scale — Strong Buy / Buy / Hold / Avoid — derived from the same `overall_score` via different thresholds (80/65/45) than the `scores.verdict` labels (Strong Conviction/Watch/Under Review/Pass). Two different vocabularies for the same underlying number, deliberately, per the module's own comments (Module 6's spec called for this specific scale). Also computes a deterministic `confidence` score from how far `overall_score` sits from neutral (50), scaled down when key inputs are missing — no randomness, no model call.

---

## 3. Problems with v1 (in priority order) — status: items 1, 3, 4, 5, 7 partially addressed in v1.5 (§0); 2, 6 still open

1. **Absolute thresholds, not sector-relative.** "ROE above 15%" is applied identically to a private bank and a consumer-internet company. An ROE of 14% may be excellent for a capital-intensive utility and mediocre for an asset-light IT services firm. This is the single biggest correctness issue in the current design — it isn't a bug in the code, it's a bug in the model.
2. **Point-in-time, not trend-aware.** `profit_growth_pct` is one YoY number from the latest snapshot. Earnings *quality* — which `PRODUCT_REQUIREMENTS.md` lists as a target factor — is about consistency across quarters, not one number. `financials_quarterly` already stores a real time series (`primary key (symbol, quarter)`); nothing currently reads it as one (see `ARCHITECTURE.md` §4).
3. **Institutional interest is schema-complete, score-absent.** `shareholding_pattern` has `fii_pct`, `dii_pct`, `pledge_pct` — none of it is referenced in `compute_scores.py` or `scoring_service.py`. Rising institutional holding and falling pledge% are real, cheap, high-signal additions.
4. **Momentum and mean-reversion are conflated.** RSI (mean-reversion) and moving-average trend (momentum) are combined into one `technical_score` with no separation. A stock in a strong, healthy uptrend can get penalized by the same number that's supposed to reward it, because RSI naturally runs high in strong uptrends.
5. **Valuation isn't relative.** "P/E under 40" is one more absolute-threshold problem. `peg` exists in the schema and is unused. Compare P/E/PEG against the company's own historical average and sector average, not a flat number.
6. **No calibration.** Nothing in the codebase checks whether higher-scored companies actually perform better over the stated 6–12 month horizon. `journal_reviews.thesis_played_out` and `ai_comparison_summary` exist for exactly this purpose; a write path now exists as of Milestone 4 (see `CURRENT_STATE.md`), but no calibration analysis reads from `journal_reviews` yet — that's a separate, future piece of work once real review data accumulates.
7. **Weight/threshold provenance is undocumented.** The specific numbers (15% ROE bar, 1.5x D/E, RSI 30–70, P/E 40) are not derived from any backtest or documented rationale visible in the code or docs — they read as reasonable analyst rules of thumb, not calibrated weights.

---

## 4. Target architecture (v2)

**Do not build this until:** the universe has grown meaningfully past 8 companies (see `PRODUCT_ROADMAP.md` Phase 2) and there is at least a small amount of real journal history to calibrate against. Building a more sophisticated scoring model against 8 hand-picked companies and zero calibration data produces false confidence, not a better score.

### 4.1 Factor groups (aligned with `PRODUCT_REQUIREMENTS.md` §6)

| Group | v1 status | v2 target |
|---|---|---|
| Fundamentals | Built (ROE, ROCE, profit growth, P/E) | Add sector-relative scoring (z-score or percentile within sector), multi-quarter trend for growth/margins |
| Technicals | Built (DMA position, golden cross, RSI) | Split into trend/momentum vs. mean-reversion, scored and shown separately |
| Momentum | Conflated into technicals | Separate factor: rate-of-change, relative strength vs. a benchmark |
| Valuation | Built (absolute P/E only) | P/E and PEG vs. own 5-year average and sector average |
| Sector strength | Not built | Derive from `weekly_sector_intelligence.outlook` once Module 7 is validated (see `DATA_STRATEGY.md`) — do not build a second sector-strength system independent of that table |
| Earnings quality | Not built | Multi-quarter consistency score from `financials_quarterly` history |
| Institutional interest | Schema exists, unused | Wire in `shareholding_pattern` trend (FII/DII direction, pledge% direction) — cheapest available v2 win |
| Growth | Partially built (single YoY number) | Trend-based, same mechanism as earnings quality |
| Financial health | Partially built (D/E, current ratio) | No major change needed beyond sector-relative comparison |

### 4.2 Scoring shape

Keep the additive, capped, explainable structure — it works and it's the right philosophy. The v2 change is *what feeds each factor* (sector-relative, trend-aware, more complete inputs), not the shape of the math. Resist the temptation to replace this with a black-box model; that directly violates `PRODUCT_REQUIREMENTS.md` §9.

### 4.3 Calibration loop

1. Every journal entry, now that the write path exists (`journal_entries`, Milestone 2), captures the `overall_score` and factor breakdown at time of entry.
2. `journal_reviews.thesis_played_out` gets populated on review — the write path for this now exists too (Milestone 4), so this step is unblocked; still manual for now, automation is a later idea, see `IDEAS.md`.
3. Periodically (quarterly is reasonable at this scale), compare scores-at-entry against outcomes-at-review. If higher scores aren't correlating with better outcomes even loosely, the weights are decorative regardless of how principled they look in source comments — revisit the factor weights, not the UI.

---

## 5. Explainability contract (applies to v1, v1.5, and v2 equally) — status: met as of v1.5

Every score shown anywhere in the product must be traceable, in the UI, to:
- the named factor group scores that sum to it (e.g., "Fundamentals +38, Technicals +27" style breakdown from `PRODUCT_REQUIREMENTS.md`'s original example), and
- within each factor group, the specific underlying numbers (ROE value, RSI value, etc.), not just the delta.

If a future contributor cannot answer "why did this company get this score" by reading the UI alone, without opening the source code, that is a regression against this document and against `PRODUCT_REQUIREMENTS.md` §9.

As of v1.5, this is implemented: `GET /company/{symbol}` returns `weighting` and `scoreBreakdown` (per-metric `value`/`score`/`maxScore`/`passed`/`reason`, see `schemas/company.py`'s `ScoreMetric`), rendered by the Research detail page's "Why this score?" panel (`frontend/src/features/company/components/ScoreBreakdown.tsx`) — every metric shows its real value, points earned vs. available, a pass/fail indicator, and a plain-English reason, with no calculation happening client-side. `GET /companies` (the list endpoint) deliberately omits the breakdown — no list UI needs it, and it would triple the list payload size for no reader benefit — so the contract applies to the detail page, not every card.
