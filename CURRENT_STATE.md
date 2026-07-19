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
| **2. Discover (Dashboard)** | `routes/discover.py`, `services/discover_service.py` | `index.tsx`, `ideas.tsx` | 🟡 | Groupings are real SQL over real tables (not hardcoded symbols) — good. But the entire universe is 8 companies (`ingest/universe.py`), so "discovery" is a re-sort of a fixed list, not a search across a market. The homepage copy literally says *"Eight companies surfaced across four narratives."* |
| **3. Company deep detail** | `services/fundamental_service.py`, `services/technical_service.py` | `research.$symbol.tsx` | ✅ | Pros/cons, checklist, verdict, shareholding trend genuinely computed from stored data, not templated fluff. |
| **4. Screener** | `services/screener_service.py`, `GET /companies` extended | `screener.tsx` | ✅ | Filter/sort/pagination over the same 8-company universe. Functionally correct; practically underwhelming for the same reason as Module 2. |
| **5. Charts** | `technical_service.py`, `GET /company/{symbol}/prices` | `PriceChart.tsx` (rewritten onto `lightweight-charts` per `MODULE_5_REPORT.md`) | ✅ | Real OHLCV candlestick + volume, sourced from `prices_daily`. |
| **6. Analysis / "AI Insights"** | `analysis/engine.py`, `analysis/rules/*`, `routes/analysis.py` | pros/cons/summary sections on `research.$symbol.tsx` | ✅, but misleadingly named | Despite the "AI Insights" label inherited from the now-removed `CLAUDE.MD`/`API_CONTRACT.md`, this module explicitly calls **no LLM** — it's deterministic template-filled prose from real numbers (confirmed in the module's own docstring). This is good engineering and bad naming; see `DECISIONS.md` ADR-006 and `ENGINEERING_GUIDE.md` naming rules. |
| **7. Weekly Market Intelligence (News)** | `services/news_provider.py`, `services/sector_classifier.py`, `services/market_summary_generator.py`, `services/weekly_market_intelligence.py`, `ingest/weekly_news_refresh.py` | `WeeklyMarketIntelligence.tsx` | 🧪 | Substantial, well-structured code (multi-provider RSS registry, sector keyword classifier, dedup by normalized title) — but per its own `CHANGELOG.md` entry, **it has never been executed against a live feed**; it was validated only with synthetic data because the build environment had no outbound network access. This is untested-in-production code, not working code. |
| **8. Journal** | `routes/journal.py`, `services/journal_service.py`, `schemas/journal.py` | `journal.tsx`, `features/journal/api/journal.ts`, `features/journal/hooks/useJournalEntries.ts`, `features/journal/components/JournalEntryForm.tsx` | ✅ | Milestone 2. Full CRUD for `journal_entries` — create/read/update/delete, all backed by real Postgres persistence, no mock data remaining. Validation (non-empty thesis, 1-5 confidence, positive horizon, symbol must exist in `companies`), proper HTTP status codes (201/200/204/400/404), and `reviewDueAt` auto-computed from `createdAt` + `horizonMonths`. The frontend form covers every writable column. **`journal_reviews` (the review/retrospective table) is explicitly out of scope** — no route, service, or UI for it yet; see `TECHNICAL_DEBT.md` TD-017. |
| **9. Watchlist / Pipeline** | `routes/discover.py` → `GET /pipeline`, reading real `pipeline_items` table | `ideas.tsx` (presumed) | 🟡 | Read path is real (queries the actual table). No `POST`/`PUT`/`DELETE` route exists anywhere in `backend/backend/routes/` for `pipeline_items` — confirmed by grepping every route file. A user cannot add or move an item through the pipeline via the app today. |
| **Portfolio** | none | none | ❌ | Correctly not built — explicitly out of scope per `PRODUCT_REQUIREMENTS.md`. No action needed. |

### The API is no longer entirely read-only (updated Milestone 2)

Grepping every file in `backend/backend/routes/` now turns up five non-`GET` routes: `POST /weekly-market-intelligence/refresh` (dev-only manual trigger for the news pipeline, pre-existing), plus `POST /journal-entries`, `PUT /journal-entries/{id}`, and `DELETE /journal-entries/{id}` (new in Milestone 2). Journal entries can now be created, edited, and deleted through the running application, with real persistence in `journal_entries`. Pipeline (`pipeline_items`) remains read-only — **this is the one write-surface gap left over from the original finding.** A user still cannot add or move an item through the pipeline via the app; see `TECHNICAL_DEBT.md` TD-004.

---

## §2. Data freshness reality

| Table | Refresh mechanism | Actual freshness |
|---|---|---|
| `prices_daily`, `technical_snapshot`, `scores` | GitHub Actions cron, weekdays 18:00 UTC (`.github/workflows/ingest.yml`) → `fetch_prices` → `compute_technicals` → `compute_scores` | Genuinely fresh, daily, for the 8 tracked symbols. |
| `financials_quarterly`, `shareholding_pattern` | One-time `ingest/seed_fundamentals.py` run against a static Kaggle CSV export (`source = 'kaggle_seed'` in every row) | **Frozen at whatever date the CSV was downloaded.** No refresh job exists. Nothing in the UI currently discloses how stale this is. |
| `news_articles`, `weekly_sector_intelligence` | `ingest/weekly_news_refresh.py`, intended weekly, **not present in `.github/workflows/ingest.yml`** (only prices/technicals/scores are scheduled) | Not scheduled anywhere. Even if the pipeline worked, nothing currently triggers it automatically. |
| `journal_entries` | New `POST`/`PUT`/`DELETE /journal-entries` (Milestone 2) | Live and real once the founder starts using it — genuinely persisted, no mock fallback. |
| `journal_reviews`, `pipeline_items` | None — no write API | Static / mock on the frontend (pipeline read path is real, see Module 9 above); the real tables exist but are empty in any real deployment unless written directly via SQL. |

---

## §3. Frontend structural debt — resolved in Milestone 1

Two parallel directory trees previously existed for largely the same concepts, confirmed dead by direct inspection (zero live imports from `routes/`, `features/`, or `shared/`) before removal:

- `frontend/src/components/**` (including a full `ui/` shadcn primitive set) vs `frontend/src/shared/components/**` (also a full `ui/` set).
- `frontend/src/hooks/**` vs `frontend/src/features/*/hooks/**`.
- `frontend/src/lib/api/**` (with its own `mock/`) vs `frontend/src/features/*/api/**` (each with its own `mock/`).

All three dead trees, plus `frontend/src/lib/mock-data.ts` and `frontend/src/lib/utils.ts` (orphaned once the dead `components/` tree that was their only importer was removed), were deleted in Milestone 1 after re-verifying zero live imports. `frontend/src/components.json` already pointed its aliases at `shared/*`, confirming this was the intended structure all along. See `TECHNICAL_DEBT.md` item TD-002 (resolved) and `CHANGELOG.md` for the Milestone 1 entry.

**Milestone 2 correction:** these same trees were found still physically present in the repository at the start of Milestone 2, despite this document and `HANDOFF.md` saying they were deleted in Milestone 1 (most likely a stale delivered copy of the repo, not a real regression — zero live imports pointed to them at either check). Re-verified dead by the same method and deleted again during Milestone 2, at the founder's explicit request (outside that milestone's core journal scope, but approved). See `TECHNICAL_DEBT.md` TD-002's Milestone 2 note and `CHANGELOG.md`.

---

## §4. Deployment reality

The frontend is built on TanStack Start with SSR and deployed to Cloudflare Workers (`frontend/.output/server/wrangler.json` present in the build output; `@tanstack/react-start` in dependencies). This is edge/SSR infrastructure sized for a multi-user, latency-sensitive product. The actual and only user, per `PRODUCT_REQUIREMENTS.md`, is the founder. See `DECISIONS.md` ADR-010 and `TECHNICAL_DEBT.md` TD-007.

---

## §5. Test coverage

`backend/backend/tests/` contains a single `.gitkeep` file. There are no automated tests anywhere in the repository for either backend or frontend, across 8 completed modules including scoring logic, ingestion pipelines, news classification, and (new in Milestone 2) the journal write path — see `TECHNICAL_DEBT.md` TD-018.

---

## §6. Production-quality vs prototype-quality, summarized

**Production-quality (well-structured, documented, defensible as-is):**
- `services/company_service.py`, `services/fundamental_service.py`, `services/technical_service.py`, `analysis/engine.py` and `analysis/rules/*` — consistently query-bounded, well-commented, honest about data gaps in-line (e.g., `epsGrowthPct` proxy, null-handling for missing Kaggle fields).
- `db/schema.sql` — clean separation of raw vs derived data, sensible indices, first-party tables correctly isolated from market-data tables.
- The daily ingest cron for prices/technicals/scores.

**Prototype-quality (works, but shouldn't be trusted or extended yet):**
- `services/scoring_service.py` / `ingest/compute_scores.py` — genuinely transparent, but a 4-input linear heuristic with absolute (not sector-relative) thresholds; see `SCORING_ENGINE.md`.
- Module 7 (news/weekly intelligence) — well-architected but unvalidated against real data; do not treat "code exists" as "feature works."

**Not connected / effectively fictional in production:**
- `journal_reviews` (review/retrospective sub-feature of the journal — schema only, no API; `journal_entries` itself is now real as of Milestone 2).
- Pipeline write path (read-only in practice).
- Every "AI Insights" UI label — no AI is actually called anywhere in this codebase; all "insight" text is deterministic template output. Correct engineering choice, misleading name (see `ENGINEERING_GUIDE.md`).

**Drifted from `PRODUCT_REQUIREMENTS.md`:**
- Universe size (8 vs. the "10–15 from a real universe" premise the whole homepage narrative depends on).
- Data philosophy ("live market data from APIs whenever practical" vs. a frozen one-time CSV for all fundamentals).
- The now-removed `CLAUDE.MD`'s Bloomberg-Terminal framing vs. the personal-tool vision — resolved; see `PRODUCT_REQUIREMENTS.md` status note.
