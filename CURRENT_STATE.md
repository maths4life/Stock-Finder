# Current State Assessment

**Purpose:** a complete, honest inventory of what exists in the codebase today, verified by reading the code directly — not the README, not prior planning documents (some of which, as documented in §0 below, once disagreed with each other and with the code, and have since been removed from the repository entirely).

**Audience:** everyone. Read this before believing any other document's description of "what's built."

**How this was produced:** direct inspection of `backend/backend/` (routes, services, schemas, ingest scripts, `db/schema.sql`) and `frontend/src/` (routes, features, API layers, mock data), cross-checked at the time against `md/API_CONTRACT.md` and `md/CLAUDE.MD` (both since intentionally removed from the repository — see §0), `md/CHANGELOG.md`, and the module reports.

---

## §0. The documentation itself was already out of sync — first finding (resolved as of Milestone 1)

Before auditing the product, the original audit had to resolve disagreements between the project's own documents:

- `md/Product_Vision.md` (personal tool, not Bloomberg) directly contradicted `md/CLAUDE.MD` ("institutional-grade... inspired by Bloomberg Terminal"). See `PRODUCT_REQUIREMENTS.md` for the resolution.
- `md/API_CONTRACT.md` listed Journal, Portfolio, News, and AI Insights as **"Not built"** — but `db/schema.sql` has full `journal_entries`/`journal_reviews`/`pipeline_items` tables, and `md/CHANGELOG.md` documents a completed Module 7 (news). `API_CONTRACT.md` was written before those modules landed and was never updated.
- The README was not assumed correct per the audit brief, and at the time its module-status claims lagged the actual code by at least two modules.

**Update, Milestone 1:** `CLAUDE.MD`, `Product_Vision.md`, and `API_CONTRACT.md` have been confirmed by the founder as intentionally removed from the repository — not missing from an upload. `PRODUCT_REQUIREMENTS.md` and this document are now the sole current-state sources; the three-way conflict above is closed, not merely superseded. `TECHNICAL_DEBT.md` TD-012 and TD-013 are marked resolved accordingly.

**Lesson embedded in the process itself:** documentation drifts fast in this project. See `ENGINEERING_GUIDE.md` for the rule this implies (update docs in the same PR as the code, or don't claim a module is "done").

---

## §1. Module-by-module status

Legend: ✅ Real and working · 🟡 Partially built · 🧪 Prototype-quality · 🪦 Schema/UI exists, not connected · ❌ Not built

| Module | Backend | Frontend | Status | Notes |
|---|---|---|---|---|
| **1. Companies** | `routes/companies.py`, `services/company_service.py` | `research.tsx`, `screener.tsx`, `CommandPalette` | ✅ | 3-query-bounded list/detail fetch, real. Confirmed no per-row N+1 pattern. |
| **2. Discover (Dashboard)** | `routes/discover.py`, `services/discover_service.py` | `index.tsx`, `ideas.tsx` | ✅ | Groupings are real SQL over real tables (not hardcoded symbols) — good. **Milestone 5:** the universe is now ~100 companies (Nifty 50 + Nifty Next 50, `data/universe_top100.csv`) instead of 8 hardcoded symbols — no code changes were needed in this service, since it already queried `companies` directly rather than importing `UNIVERSE`. The stale "Eight companies surfaced..." homepage copy (flagged below as of Milestone 4) has been fixed. |
| **3. Company deep detail** | `services/fundamental_service.py`, `services/technical_service.py` | `research.$symbol.tsx` | ✅ | Pros/cons, checklist, verdict, shareholding trend genuinely computed from stored data, not templated fluff. |
| **4. Screener** | `services/screener_service.py`, `GET /companies` extended | `screener.tsx` | ✅ | Filter/sort/pagination over the universe. **Milestone 5:** now ~100 companies instead of 8 — Python-side filter/sort (the module's own comment already flagged this as the right approach "at today's scale") remains fine at this size; its own code comment names "thousands" as the point to move filtering into SQL, not 100. |
| **5. Charts** | `technical_service.py`, `GET /company/{symbol}/prices` | `PriceChart.tsx` (rewritten onto `lightweight-charts` per `MODULE_5_REPORT.md`) | ✅ | Real OHLCV candlestick + volume, sourced from `prices_daily`. |
| **6. Analysis / "AI Insights"** | `analysis/engine.py`, `analysis/rules/*`, `routes/analysis.py` | pros/cons/summary sections on `research.$symbol.tsx` | ✅, but misleadingly named | Despite the "AI Insights" label inherited from the now-removed `CLAUDE.MD`/`API_CONTRACT.md`, this module explicitly calls **no LLM** — it's deterministic template-filled prose from real numbers (confirmed in the module's own docstring). This is good engineering and bad naming; see `DECISIONS.md` ADR-006 and `ENGINEERING_GUIDE.md` naming rules. |
| **7. Weekly Market Intelligence (News)** | `services/news_provider.py`, `services/sector_classifier.py`, `services/market_summary_generator.py`, `services/weekly_market_intelligence.py`, `ingest/weekly_news_refresh.py` | `WeeklyMarketIntelligence.tsx` | 🧪 | Substantial, well-structured code (multi-provider RSS registry, sector keyword classifier, dedup by normalized title) — but per its own `CHANGELOG.md` entry, **it has never been executed against a live feed**; it was validated only with synthetic data because the build environment had no outbound network access. This is untested-in-production code, not working code. |
| **8. Journal (entries + reviews)** | `routes/journal.py`, `services/journal_service.py`, `schemas/journal.py`; `routes/journal_reviews.py`, `services/journal_review_service.py`, `schemas/journal_review.py` (new, Milestone 4) | `journal.tsx`, `features/journal/api/journal.ts`, `features/journal/hooks/useJournalEntries.ts`, `features/journal/components/JournalEntryForm.tsx`; `features/journal/api/journalReviews.ts`, `features/journal/hooks/useJournalReviews.ts`, `features/journal/components/JournalReviewForm.tsx`, `features/journal/components/JournalReviewList.tsx` (new, Milestone 4) | ✅ | Milestone 2 built full CRUD for `journal_entries`. **Milestone 4 (TD-017) closes the module's last gap:** full CRUD for `journal_reviews`, the review/retrospective half — create/read/update/delete, real Postgres persistence, `entryId` FK-checked against `journal_entries`. `entryId`/`reviewedAt` are immutable after creation by design (`DECISIONS.md` ADR-014). The journal page now renders a review timeline (with add/edit/delete) under each entry. `ai_comparison_summary` is exposed as a plain writable text field — no AI-generation logic exists anywhere in the app for it (`DECISIONS.md` ADR-013). The Journal module is now fully built end-to-end; no remaining "schema exists, no write API" gap. |
| **9. Watchlist / Pipeline** | `routes/discover.py` → `GET /pipeline` (grouped, unchanged); `routes/pipeline.py` → `GET/POST /pipeline-items`, `GET/PUT/DELETE /pipeline-items/{id}`, `PATCH /pipeline-items/{id}/stage` (new, Milestone 3); `services/pipeline_service.py`, `schemas/pipeline.py` | `ideas.tsx`, `features/pipeline/api/pipeline.ts`, `features/pipeline/hooks/usePipelineItems.ts`, `features/pipeline/components/PipelineItemForm.tsx` | ✅ | Milestone 3. Full CRUD + stage-move for `pipeline_items`, all backed by real Postgres persistence, no mock data remaining. Validation (symbol must exist in `companies`, stage restricted to the three existing values), proper HTTP status codes (201/200/204/400/404). Stages are unchanged from the original three (`Watching`, `Researching`, `Conviction`) — a 6-stage Kanban was considered and explicitly rejected for this milestone; see `CURRENT_MILESTONE.md`. No drag-and-drop; moving a card uses a dropdown action menu instead, since no DnD existed prior to this milestone and none was added. |
| **Portfolio** | none | none | ❌ | Correctly not built — explicitly out of scope per `PRODUCT_REQUIREMENTS.md`. No action needed. |

### The API is no longer entirely read-only (updated Milestone 4)

Grepping every file in `backend/backend/routes/` now turns up thirteen non-`GET` routes: `POST /weekly-market-intelligence/refresh` (dev-only manual trigger for the news pipeline, pre-existing); `POST /journal-entries`, `PUT /journal-entries/{id}`, `DELETE /journal-entries/{id}` (Milestone 2); `POST /pipeline-items`, `PUT /pipeline-items/{id}`, `PATCH /pipeline-items/{id}/stage`, `DELETE /pipeline-items/{id}` (Milestone 3); and `POST /journal-reviews`, `PUT /journal-reviews/{id}`, `DELETE /journal-reviews/{id}` (new in Milestone 4). Journal entries, journal reviews, and pipeline items can now all be created, edited, and deleted through the running application, with real persistence. **TD-004 (pipeline write-surface gap) resolved in Milestone 3; TD-017 (journal reviews write-surface gap) resolved in Milestone 4** — see `TECHNICAL_DEBT.md`. Every first-party writable table now has a real write layer; the "schema exists, no API" pattern that TD-003/TD-004/TD-017 each described no longer has an open instance anywhere in the codebase. The pre-existing grouped `GET /pipeline` read endpoint remains unchanged by this milestone.

### Universe expanded from 8 to ~100 companies (Milestone 5)

The hardcoded 8-company `UNIVERSE` list in `ingest/universe.py` has been replaced with a CSV-backed loader (`load_universe()`) reading `data/universe_top100.csv` — Nifty 50 + Nifty Next 50, ~100 companies. `ingest/fetch_prices.py`, `ingest/compute_technicals.py`, and `ingest/compute_scores.py` are the only three files that ever referenced `UNIVERSE`; `compute_technicals.py` and `compute_scores.py` needed **no code changes at all** (same import, now resolving to 100 rows instead of 8). `fetch_prices.py` also gained incremental fetching (only pulls trading days after the latest stored date for a symbol, instead of always re-requesting the full 2-year history) and a `--full-refetch` override. `services/company_service.py`, `discover_service.py`, and `screener_service.py` needed no universe-handling changes — they already queried the `companies` table directly rather than importing `UNIVERSE`, confirming the pre-existing architecture was already universe-size-agnostic. See `CURRENT_MILESTONE.md` and `DECISIONS.md` for the full reasoning. **Not verified against a live database in this session** — see `TECHNICAL_DEBT.md` TD-022.

---

## §2. Data freshness reality

| Table | Refresh mechanism | Actual freshness |
|---|---|---|
| `prices_daily`, `technical_snapshot`, `scores` | GitHub Actions cron, weekdays 18:00 UTC (`.github/workflows/ingest.yml`) → `fetch_prices` → `compute_technicals` → `compute_scores` | Genuinely fresh, daily, for the ~100 tracked symbols (Milestone 5: expanded from 8; `fetch_prices` is now incremental — only fetches trading days after each symbol's latest stored date, not a full 2y re-pull every run). |
| `financials_quarterly`, `shareholding_pattern` | One-time `ingest/seed_fundamentals.py` run against a static Kaggle CSV export (`source = 'kaggle_seed'` in every row) | **Frozen at whatever date the CSV was downloaded.** No refresh job exists. Nothing in the UI currently discloses how stale this is. |
| `news_articles`, `weekly_sector_intelligence` | `ingest/weekly_news_refresh.py`, intended weekly, **not present in `.github/workflows/ingest.yml`** (only prices/technicals/scores are scheduled) | Not scheduled anywhere. Even if the pipeline worked, nothing currently triggers it automatically. |
| `journal_entries` | `POST`/`PUT`/`DELETE /journal-entries` (Milestone 2) | Live and real once the founder starts using it — genuinely persisted, no mock fallback. |
| `pipeline_items` | New `POST`/`PUT`/`DELETE /pipeline-items`, `PATCH /pipeline-items/{id}/stage` (Milestone 3) | Live and real once the founder starts using it — genuinely persisted, no mock fallback. |
| `journal_reviews` | New `POST`/`PUT`/`DELETE /journal-reviews` (Milestone 4) | Live and real once the founder starts using it — genuinely persisted, no mock fallback. Not yet exercised against a live database in this session; see `TECHNICAL_DEBT.md` TD-021. |

---

## §3. Frontend structural debt — resolved in Milestone 1

Two parallel directory trees previously existed for largely the same concepts, confirmed dead by direct inspection (zero live imports from `routes/`, `features/`, or `shared/`) before removal:

- `frontend/src/components/**` (including a full `ui/` shadcn primitive set) vs `frontend/src/shared/components/**` (also a full `ui/` set).
- `frontend/src/hooks/**` vs `frontend/src/features/*/hooks/**`.
- `frontend/src/lib/api/**` (with its own `mock/`) vs `frontend/src/features/*/api/**` (each with its own `mock/`).

All three dead trees, plus `frontend/src/lib/mock-data.ts` and `frontend/src/lib/utils.ts` (orphaned once the dead `components/` tree that was their only importer was removed), were deleted in Milestone 1 after re-verifying zero live imports. `frontend/src/components.json` already pointed its aliases at `shared/*`, confirming this was the intended structure all along. See `TECHNICAL_DEBT.md` item TD-002 (resolved) and `CHANGELOG.md` for the Milestone 1 entry.

**Milestone 2 correction:** these same trees were found still physically present in the repository at the start of Milestone 2, despite this document and `HANDOFF.md` saying they were deleted in Milestone 1 (most likely a stale delivered copy of the repo, not a real regression — zero live imports pointed to them at either check). Re-verified dead by the same method and deleted again during Milestone 2, at the founder's explicit request (outside that milestone's core journal scope, but approved). See `TECHNICAL_DEBT.md` TD-002's Milestone 2 note and `CHANGELOG.md`.

**Milestone 3 finding — third recurrence, left untouched:** the same trees (`components/`, `hooks/`, `lib/api/`, `lib/mock-data.ts`, `lib/utils.ts`) were present again at the start of Milestone 3, re-verified dead by the same method (zero live imports, `components.json` still aliased to `shared/*`). Per the founder's explicit instruction this time, they were **not** deleted — two prior deletions not holding is treated as a signal about how the project is packaged or handed off between sessions, not something to keep patching inside a feature milestone. See `TECHNICAL_DEBT.md` TD-002's Milestone 3 note. **This needs investigating separately from any feature milestone** — likely candidates are a stale base snapshot being re-zipped for each session, or a build/export step that doesn't reflect the working tree's deletions.

---

## §4. Deployment reality

The frontend is built on TanStack Start with SSR and deployed to Cloudflare Workers (`frontend/.output/server/wrangler.json` present in the build output; `@tanstack/react-start` in dependencies). This is edge/SSR infrastructure sized for a multi-user, latency-sensitive product. The actual and only user, per `PRODUCT_REQUIREMENTS.md`, is the founder. See `DECISIONS.md` ADR-010 and `TECHNICAL_DEBT.md` TD-007.

---

## §5. Test coverage

`backend/backend/tests/` contains a single `.gitkeep` file. There are no automated tests anywhere in the repository for either backend or frontend, across 9 completed modules including scoring logic, ingestion pipelines, news classification, the journal entries write path (Milestone 2), the pipeline write path (Milestone 3), and now the journal reviews write path (Milestone 4) — see `TECHNICAL_DEBT.md` TD-005/TD-018/TD-019.

---

## §6. Production-quality vs prototype-quality, summarized

**Production-quality (well-structured, documented, defensible as-is):**
- `services/company_service.py`, `services/fundamental_service.py`, `services/technical_service.py`, `analysis/engine.py` and `analysis/rules/*` — consistently query-bounded, well-commented, honest about data gaps in-line (e.g., `epsGrowthPct` proxy, null-handling for missing Kaggle fields).
- `db/schema.sql` — clean separation of raw vs derived data, sensible indices, first-party tables correctly isolated from market-data tables.
- The daily ingest cron for prices/technicals/scores.

**Prototype-quality (works, but shouldn't be trusted or extended yet):**
- `services/scoring_service.py` / `analysis/scoring_engine.py` (Milestone 6) — transparent, rule-based, now sector-relative on P/E specifically and fully explained in the UI ("Why this score?" breakdown); still not sector-relative on every factor and not yet trend/multi-quarter aware — see `SCORING_ENGINE.md` §0 and §4 for what's shipped vs. what's still v2-target.
- Module 7 (news/weekly intelligence) — well-architected but unvalidated against real data; do not treat "code exists" as "feature works."

**Not connected / effectively fictional in production:**
- Every "AI Insights" UI label — no AI is actually called anywhere in this codebase; all "insight" text is deterministic template output. Correct engineering choice, misleading name (see `ENGINEERING_GUIDE.md`).

**Resolved in Milestone 3:**
- Pipeline write path — was read-only in practice, now full CRUD + stage-move, see Module 9 above.

**Resolved in Milestone 4:**
- Journal reviews write path (TD-017) — was schema-only with no API, now full CRUD, see Module 8 above. This was the last remaining "schema exists, no write API" gap in the codebase.

**Drifted from `PRODUCT_REQUIREMENTS.md`:**
- ~~Universe size (8 vs. the "10–15 from a real universe" premise the whole homepage narrative depends on).~~ **Resolved in Milestone 5:** universe is now ~100 companies (Nifty 50 + Nifty Next 50), well past the "10–15" premise. Full NSE (~1500–2000) remains a future milestone.
- Data philosophy ("live market data from APIs whenever practical" vs. a frozen one-time CSV for all fundamentals).
- The now-removed `CLAUDE.MD`'s Bloomberg-Terminal framing vs. the personal-tool vision — resolved; see `PRODUCT_REQUIREMENTS.md` status note.
