# Current Milestone

**Read `HANDOFF.md` first if this is a new session. This document is the second stop — it tells you exactly what's in flight right now.**

---

## Milestone 5: Universe Expansion (8 → ~100) & Fresh Database Initialization

**Status:** ✅ Complete.

### Objective

Replace the hardcoded 8-company development universe with a scalable, CSV-backed universe loader, populated with Nifty 50 + Nifty Next 50 (~100 companies), as an intermediate validation step before eventually scaling to the full NSE universe (~1500–2000). Preceded by a founder-requested design-review session (no code) confirming this as the correct next milestone and resolving the open questions (data source, universe choice, ingestion impact, schema impact, update strategy, performance, risk) before implementation began.

### Scope (all completed)

- New `data/universe_top100.csv` — 100 companies (50 Nifty 50 + 50 Nifty Next 50), columns `symbol`/`yahoo_ticker`/`exchange`/`name`/`sector`/`index_membership`/`is_active`.
- `ingest/universe.py` rewritten as a loader (`load_universe()`) over that CSV, replacing the hardcoded Python list. Backwards-compatible `UNIVERSE` constant preserved so existing call sites needed no import changes.
- `ingest/fetch_prices.py` updated to use the loader, and made incremental (fetches only new trading days per symbol instead of a full 2-year re-pull every run); `--full-refetch` flag added for the old behavior. Also writes `index_membership`/`is_active` through to `companies`.
- `ingest/compute_technicals.py`, `ingest/compute_scores.py` — confirmed to need **zero code changes**, since both already only imported `UNIVERSE`.
- `db/schema.sql` — additive `companies.index_membership` column.
- `services/company_service.py` — `get_all_companies` now filters `where c.is_active` (list/Discover/Screener path only; `get_company_by_symbol` unchanged, so existing journal/pipeline references to a since-delisted symbol still resolve). Documented as a deliberate, small addition beyond the literal checklist — see `DECISIONS.md` ADR-015.
- New `ingest/reset_market_data.py` — one-time fresh-database-init script: truncates market-generated tables (`scores`, `technical_snapshot`, `prices_daily`, `shareholding_pattern`, `financials_quarterly`) and removes stale pre-Milestone-5 `companies` rows, but only those not referenced by `journal_entries`/`pipeline_items` (FK-safety check). Never touches `journal_entries`, `journal_reviews`, `pipeline_items`, or news tables. `--dry-run`/`--skip-companies` flags.
- Confirmed `services/discover_service.py`, `services/screener_service.py`, and `.github/workflows/ingest.yml` needed no changes.
- Frontend: removed the stale hardcoded "Eight companies surfaced..." homepage copy (flagged in `CURRENT_STATE.md` since Milestone 4).

### Out of scope (deliberately deferred, not touched)

- Full NSE universe scale-out (~1500–2000 companies) — this milestone is explicitly the intermediate validation step, not the final one.
- TD-002 (dead frontend trees), test suite (TD-005), scoring engine redesign, admin tooling, a universe-management UI — all explicitly named as out of scope in the milestone brief.
- Extending `config/sectors.py`'s keyword table for the ~90 new companies' sector labels — Module 7 (news) is itself still unvalidated (TD-008), so this has no user-visible effect yet. Logged as `TECHNICAL_DEBT.md` TD-026.
- Adding `reset_market_data.py` to the scheduled cron — it's a deliberate one-off, not a daily operation.

### Definition of Done

- All modified/new Python files compile and were actually imported with real dependencies installed (`sqlalchemy`, `pandas`, `yfinance`, `fastapi`, `pydantic`, `psycopg2-binary`), confirming `compute_technicals.py`/`compute_scores.py` genuinely now see all 100 companies with zero code changes.
- `data/universe_top100.csv` validated programmatically (100 rows, 100 unique symbols/tickers, no blank fields, 50/50 index split).
- `services/company_service.py`'s new `is_active` filter confirmed to build the expected SQL.
- A local Postgres install was attempted specifically to test `reset_market_data.py` and the incremental-fetch logic end-to-end; it failed (server package unavailable from the sandbox's mirror) and the partial install was cleaned up. **Not performed:** an end-to-end run of either script, or all 100 tickers, against live `yfinance`/Postgres — see `TECHNICAL_DEBT.md` TD-023/TD-024.
- `TECHNICAL_DEBT.md` — TD-023 through TD-026 newly logged.
- `CURRENT_STATE.md`, `HANDOFF.md`, `CHANGELOG.md`, `ENGINEERING_ROADMAP.md`, `PRODUCT_ROADMAP.md` updated.
- `DECISIONS.md` — ADR-015 appended.
- This document updated to Complete.

### Remaining limitations

- **Universe CSV and reset/incremental-fetch scripts not verified against live `yfinance`/Postgres** — see `TECHNICAL_DEBT.md` TD-023/TD-024. Recommend the founder run `python -m ingest.reset_market_data --dry-run`, review the output, then run for real, followed by `python -m ingest.fetch_prices` and a check of its printed summary for any failed tickers, before relying on either script.
- **Index membership will drift over time** — Nifty 50/Next 50 are reconstituted semi-annually by NSE; the CSV reflects the most recent published rebalance as of this milestone. See `TECHNICAL_DEBT.md` TD-025.
- **`config/sectors.py` not extended** for the new companies' broader sector labels — no user-visible effect until Module 7 (TD-008) is itself resolved. See `TECHNICAL_DEBT.md` TD-026.
- The dead frontend trees (TD-002) remain present, untouched per prior milestones' standing instruction — not revisited this milestone since it's unrelated.

### Technical debt

- **New:** TD-023 (universe CSV tickers not live-verified), TD-024 (reset/incremental-fetch scripts not run against live DB), TD-025 (index membership needs semi-annual refresh), TD-026 (`config/sectors.py` keyword table not extended for new companies).
- **Untouched, per scope:** TD-002, TD-005, TD-008/TD-009, TD-021/TD-022.

### Found but not fixed (flagged per founder's development rules rather than auto-fixed)

- None beyond what's already logged as new debt above — this milestone's design-review phase surfaced most of these questions before implementation began, so there were few surprises during the build itself.

---

## Candidate milestones for Milestone 6 (no default selected — founder to choose)

1. **Close out Milestone 5's verification gaps (TD-023/TD-024)** — cheapest possible next step: run `reset_market_data.py` and `fetch_prices.py` for real against a live database, confirm all 100 tickers resolve, fix any that don't.
2. **Scoring Engine v2** — `PRODUCT_ROADMAP.md` Phase 3, now unblocked with a ~100-company universe instead of 8.
3. **Investigate the dead-tree recurrence (TD-002)** — now recurred across Milestones 3, 4, and 5 without being touched; still worth resolving the packaging/handoff hypothesis before a further recurrence.
4. **Pure-function + service-layer test suite** — `TECHNICAL_DEBT.md` TD-005 (now also covering TD-018, TD-019, and TD-017's `journal_review_service.py`).
5. **Full NSE universe scale-out** (~1500–2000 companies) — the natural following step once Milestone 5's own verification gaps are closed and the cron's real runtime at ~100 companies has been observed; per `DECISIONS.md` ADR-015 this should only require extending `data/universe_top100.csv`, but `screener_service.py`'s Python-side filtering would need revisiting at that scale.
6. **Finish the naming/formatting cleanup** — close out TD-015 and TD-016.
7. **Clean up TD-021/TD-022** — one live-DB smoke test for journal reviews, plus (pending a TD-002-style decision) deleting the two orphaned mock-data files.

---

## Milestone 4: Journal Reviews Backend (TD-017)

**Status:** ✅ Complete.

### Objective

Close the journal module's last remaining gap by building a complete, backend-backed CRUD system for `journal_reviews`, so a review can actually be recorded once a `reviewDueAt` date arrives — not just displayed.

### Scope (all completed)

- Backend: `routes/journal_reviews.py`, `services/journal_review_service.py`, `schemas/journal_review.py` — full CRUD (`GET`/`POST /journal-reviews`, `GET`/`PUT`/`DELETE /journal-reviews/{id}`). Validation (`entryId` must exist in `journal_entries`, `thesisPlayedOut` restricted to `yes`/`partially`/`no`), proper status codes (201/200/204/400/404). `entryId`/`reviewedAt` immutable after creation (`DECISIONS.md` ADR-014).
- Database: no schema changes — `journal_reviews` (already present in `db/schema.sql`) used as-is.
- Frontend: new `features/journal/api/journalReviews.ts`, `features/journal/hooks/useJournalReviews.ts`, `features/journal/components/JournalReviewForm.tsx`, `features/journal/components/JournalReviewList.tsx`; `routes/journal.tsx` updated to prefetch reviews and render a per-entry review timeline with add/edit/delete.

### Out of scope (deliberately deferred, not touched)

- Auto-generating `ai_comparison_summary` — implemented as a plain writable field only; see `DECISIONS.md` ADR-013 for why building actual generation logic was judged out of scope (new subsystem + tension with the product's "no AI-generated opinion stands in for real analysis" principle).
- The four other `CURRENT_MILESTONE.md` Milestone 4 candidates the founder didn't select this round: TD-002 investigation, test suite (TD-005), universe expansion, naming/formatting cleanup (TD-015/TD-016) — per the founder's explicit instruction not to start any of them until TD-017 was complete.
- The dead frontend trees (`src/components/`, `src/hooks/`, `src/lib/`) — left untouched per the founder's explicit instruction this session; still pending a separate investigation into why they've recurred three times (see `TECHNICAL_DEBT.md` TD-002).

### Definition of Done

- Backend: real `pip install` + full `app.py` import + `app.openapi()` generation confirmed `/journal-reviews` routes registered correctly and no pre-existing route regressed. Pydantic validators unit-verified directly.
- Frontend: real `npm install`, `npx tsc --noEmit` (clean on every new/modified file), `npm run build` (full SSR build succeeded), `npx eslint --fix` (all four new files now lint-clean) — all actually run this session, unlike Milestone 3 which had no network access. See `TECHNICAL_DEBT.md` TD-020's Milestone 4 note.
- `TECHNICAL_DEBT.md` — TD-017 resolved; TD-020 partially resolved (network/tooling-access half); TD-021 and TD-022 newly logged.
- `CURRENT_STATE.md` updated (Module 8 row, read-only-API summary, data freshness table, test coverage count, production-quality summary).
- `DECISIONS.md` — ADR-013 and ADR-014 appended.
- `CHANGELOG.md` has a new top entry for this milestone.
- This document updated to Complete.

### Remaining limitations

- **No automated tests** for the new write path (`journal_review_service.py`) — same root cause as pre-existing TD-005, now also tracked implicitly alongside TD-018/TD-019.
- **SQL not executed against a live database** — verified by static review against `db/schema.sql`'s column list and a real FastAPI/OpenAPI import, not an end-to-end write/read/delete cycle (no `DATABASE_URL`/database instance was available). See `TECHNICAL_DEBT.md` TD-021. Recommend the founder do one manual smoke test before relying on this.
- `npx tsc --noEmit` still surfaces 8 pre-existing errors, all inside orphaned/dead-tree files unrelated to this milestone's changes — 7 newly logged as `TECHNICAL_DEBT.md` TD-022, the 8th (`src/lib/api/companies.ts`) already covered by TD-002 (deliberately not fixed this session since it's TD-002-adjacent).
- The dead frontend trees remain present, per the founder's instruction — see `TECHNICAL_DEBT.md` TD-002.

### Technical debt

- **Resolved:** TD-017 (journal reviews write path).
- **Partially resolved:** TD-020 (network/tooling access confirmed available and used this session; live-DB verification still outstanding, see TD-021).
- **New:** TD-021 (journal reviews SQL not run against a live DB), TD-022 (orphaned mock-data files surfaced by this session's real `tsc` run).
- **Untouched, per founder's instruction:** TD-002, TD-005, universe expansion, TD-015/TD-016.

### Found but not fixed (flagged per founder's development rules rather than auto-fixed)

- TD-022 — two orphaned mock-data files (`features/journal/api/mock/journal.data.ts`, `features/market/api/mock/market.data.ts`) surfaced as real `tsc` errors this session. Confirmed zero live imports, same as any TD-002-style dead code, but deliberately left in place rather than deleted unilaterally, since the founder asked this session to avoid anything TD-002-adjacent without a separate decision.

---

## Milestone 3: Pipeline Backend

**Status:** ✅ Complete.

### Objective

Replace the mock/read-only Pipeline implementation with a complete, backend-backed CRUD system for `pipeline_items`, so the pipeline becomes a real, persistent Kanban-style workflow instead of a read-only display.

### Scope (all completed)

- Backend: `routes/pipeline.py`, `services/pipeline_service.py`, `schemas/pipeline.py` — full CRUD (`GET`/`POST /pipeline-items`, `GET`/`PUT`/`DELETE /pipeline-items/{id}`) plus a dedicated `PATCH /pipeline-items/{id}/stage` move endpoint. Validation (symbol must exist in `companies`, stage restricted to the three existing values), proper status codes (201/200/204/400/404). The pre-existing grouped `GET /pipeline` (`routes/discover.py`) is unchanged in behavior — it gained one additive field (`id` on each `PipelineItem`) so the frontend can address a specific row for edit/move/delete, and continues to work exactly as before for any other consumer.
- Database: no schema changes — `pipeline_items` (already present in `db/schema.sql`) used as-is, with its existing three stages (`Watching`, `Researching`, `Conviction`).
- Frontend: new `features/pipeline/api/pipeline.ts` (create/update/move/delete calls), `features/pipeline/hooks/usePipelineItems.ts` (mutations with toast feedback via `sonner`, optimistic update for stage-move), `features/pipeline/components/PipelineItemForm.tsx` (react-hook-form + zod, company picker, stage picker); `routes/ideas.tsx` rebuilt with working create/edit/move/delete UI via a dropdown action menu per card (previously "+ Add company" had no handler and there was no way to edit, move, or remove an item). The existing grouped read (`features/market/hooks/useDiscover.ts`'s `usePipeline()`, backed by `GET /pipeline`) is unchanged and still the page's read path.

### Out of scope (deliberately deferred, not touched)

- A 6-stage Kanban (`Watchlist`/`Researching`/`High Conviction`/`Ready to Buy`/`Invested`/`Archived`) was proposed in the original milestone brief but explicitly rejected by the founder once the discrepancy with the existing 3-stage schema (`Watching`/`Researching`/`Conviction`) was flagged. The existing three stages were kept as-is; expanding the workflow is deferred to its own future milestone with a proper schema migration, if the founder wants it.
- Drag-and-drop was considered and explicitly not added — none existed prior to this milestone, and the founder confirmed a dropdown/action-menu interaction should be used instead so backend integration stayed the focus.
- Scoring engine, universe expansion, UI redesign, news, deployment, AI, journal reviews, or any unrelated technical debt.
- The dead frontend trees (`src/components/`, `src/hooks/`, `src/lib/api/`, `src/lib/mock-data.ts`, `src/lib/utils.ts`), found present a third time at the start of this milestone — **left untouched this time at the founder's explicit instruction**, treated as a delivery/handoff process issue rather than something to re-delete inside a feature milestone. See `TECHNICAL_DEBT.md` TD-002 and `CURRENT_STATE.md` §3.

### Definition of Done

- **Not fully met — see "Remaining limitations."** This session's sandboxed environment had network access disabled: `npm install` failed (403 from the npm registry, no local `node_modules`), so `npx tsc --noEmit` and `npm run build` could not be run; `pip install fastapi sqlalchemy` also failed, so a full FastAPI app import + `openapi()` schema generation (the check Milestone 2 relied on) could not be run either.
- What **was** done instead, as the best available substitute:
  - Backend: Python syntax check (`ast.parse`) passes on all new/changed files; every new module was manually reviewed line-by-line against the already-working `journal_service.py`/`routes/journal.py`/`schemas/journal.py` (registered, presumably previously verified) for structural correctness — same layering, same error-handling pattern, same SQLAlchemy `text()` query style.
  - Frontend: bracket/brace balance confirmed on all new/edited files; an isolated `tsc` pass (found a global install at `/home/claude/.npm-global/bin/tsc`, run with `--noResolve` against copies of the new files outside the project, since `node_modules`/path aliases aren't available) surfaced only import-resolution and implicit-`any` noise expected from that isolation — **zero parse errors (no TS1xxx diagnostics)**, which is the actual signal being checked for.
- Manually re-verified: no other route or component references pipeline items without going through the new hooks; `AppShell`'s nav link to `/ideas` is unaffected; the grouped `GET /pipeline` response shape is unchanged except for the additive `id` field.
- `TECHNICAL_DEBT.md` — TD-004 resolved; TD-002 reopened with a Milestone 3 note (not re-resolved, per founder's instruction); TD-019 and TD-020 newly logged.
- `CURRENT_STATE.md`, `ARCHITECTURE.md` updated to reflect the pipeline's new status and the third dead-tree recurrence.
- `CHANGELOG.md` has a new top entry for this milestone.
- This document updated to Complete, with the verification gap disclosed rather than glossed over.

### Remaining limitations

- **No automated tests** for the new write path (`pipeline_service.py`) — same root cause as pre-existing TD-005, now also tracked as TD-019.
- **Build/typecheck/import verification could not be run in this environment** (no network access) — see TD-020. Before deploying, run `npm install && npm run build && tsc --noEmit` and `python -c "from app import app; app.openapi()"` in an environment with dependency access as the real gate.
- **SQL not executed against a live database** — same as Milestone 2's limitation; verified by static review against `db/schema.sql`'s column list and by the same query pattern the already-registered `get_pipeline()` function already uses successfully in production (same table, same connection style), not by an end-to-end write/read/delete cycle. Recommend the founder do one manual smoke test (create → edit → move → refresh → delete) against a real database before relying on this.
- No pagination on `GET /pipeline-items` — returns the full list. Reasonable for a single-user tool today.
- The dead frontend trees remain present in the repository, per the founder's instruction — see "Out of scope" above and `TECHNICAL_DEBT.md` TD-002.

### Technical debt

- **Resolved:** TD-004 (pipeline write path).
- **Reopened (not re-resolved):** TD-002 (dead trees, third recurrence, left in place this time — see row for detail).
- **New:** TD-019 (pipeline write path untested), TD-020 (this milestone's build/typecheck/import verification gap due to no network access).

### Found but not fixed (flagged per founder's development rules rather than auto-fixed)

- Dead frontend trees present a third time — flagged per the founder's own standing instruction that a third recurrence should be surfaced as a process issue, not silently re-deleted. Left in place this milestone at the founder's explicit confirmation.

---

## Milestone 2: Journal Backend

**Status:** ✅ Complete.

### Objective

Replace the mock journal implementation with a complete, backend-backed CRUD system for `journal_entries`, so the journal becomes a real, persistent record of investment theses instead of a read-only display of hardcoded data.

### Scope (all completed)

- Backend: `routes/journal.py`, `services/journal_service.py`, `schemas/journal.py` — full CRUD (`GET`/`POST /journal-entries`, `GET`/`PUT`/`DELETE /journal-entries/{id}`), validation (non-empty thesis, symbol must exist in `companies`, confidence 1-5, positive horizon), proper status codes (201/200/204/400/404), `reviewDueAt` auto-computed from `createdAt` + `horizonMonths`.
- Database: no schema changes — `journal_entries` (already present in `db/schema.sql`) used as-is.
- Frontend: `features/journal/api/journal.ts` rewritten to call the real API; mock data (`features/journal/api/mock/`) deleted; `features/journal/hooks/useJournalEntries.ts` extended with create/update/delete mutations (toast feedback via `sonner`); new `features/journal/components/JournalEntryForm.tsx` (react-hook-form + zod, company picker); `routes/journal.tsx` rebuilt with working create/edit/delete UI (previously the "+ Start a new thesis" button had no handler at all).
- Also completed at the founder's explicit request during this milestone (outside the original journal-only scope): deleted the legacy dead frontend trees (`src/components/`, `src/hooks/`, `src/lib/api/`, `src/lib/mock-data.ts`, `src/lib/utils.ts`) that `HANDOFF.md`/`CURRENT_STATE.md` claimed were deleted in Milestone 1 but were found still present at the start of this milestone (re-verified zero live imports before deleting).

### Out of scope (deliberately deferred, not touched)

- `journal_reviews` (the review/retrospective table) — no route, service, or UI. Logged as new debt, `TECHNICAL_DEBT.md` TD-017.
- Pipeline write path (TD-004).
- Scoring engine, universe expansion, UI redesign, news, deployment, AI, or any unrelated technical debt (TD-001, TD-006–TD-011, TD-014–TD-016).

### Definition of Done — all met

- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; all routes present in the SSR bundle, including the rebuilt `/journal`.
- `npm run lint` — no new lint-error *categories* introduced; the CRLF/prettier count (TD-015) grew from ~7,720 to ~8,249 because new files were authored CRLF to match the existing convention — logged, not fixed, same as Milestone 1's precedent.
- A Python syntax check (`ast.parse`) and a full FastAPI app import + `openapi()` schema generation both pass for the new/changed backend files, confirming `/journal-entries` (GET/POST) and `/journal-entries/{id}` (GET/PUT/DELETE) are registered with the correct HTTP methods. No live Postgres instance was available in this environment, so the SQL itself was verified by direct read-through against `db/schema.sql`'s column list, not by executing it against a real database — flagged under "Remaining limitations" below, not silently assumed correct.
- Manually re-verified: no other route or component references the old `JournalEntry` mock shape (`catalysts`/`risks`/`conviction`/`reviewDue`) or the deleted dead trees; `AppShell`'s nav link to `/journal` is unaffected; the other 5 frontend routes build and typecheck unchanged.
- `TECHNICAL_DEBT.md` — TD-003 resolved; TD-002 re-resolved with a note; TD-015/TD-016 counts/scope updated; TD-017 and TD-018 newly logged.
- `CURRENT_STATE.md`, `ARCHITECTURE.md` updated to reflect the journal's new status and the corrected dead-tree history.
- `CHANGELOG.md` has a new top entry for this milestone.
- This document updated to Complete.

### Remaining limitations

- **No automated tests** for the new write path (`journal_service.py`) — same root cause as pre-existing TD-005, now also tracked as TD-018.
- **SQL not executed against a live database** in this environment (no `DATABASE_URL` / Postgres instance available) — verified by static review against `db/schema.sql` and by successful FastAPI route registration, not by an end-to-end write/read/delete cycle. Recommend the founder do one manual smoke test (create → refresh → edit → delete) against a real database before relying on this.
- `journal_reviews` untouched, as scoped (see TD-017).
- No pagination on `GET /journal-entries` — returns the full list. Reasonable for a single-user tool today; would need revisiting if entry volume grows large.

### Technical debt

- **Resolved:** TD-003 (journal write path), TD-002 (dead trees, re-resolved).
- **New:** TD-017 (journal_reviews unbuilt), TD-018 (journal write path untested).
- **Updated:** TD-015 (CRLF count), TD-016 (added `db/schema.sql` header comment as another "Quant" naming-drift location).

### Found but not fixed (flagged per founder's development rules rather than auto-fixed)

- `db/schema.sql`'s header comment still reads "Quant Terminal — core schema" — same naming drift as TD-016, just a location not previously listed. Left untouched; scope for this milestone was journal only, and the founder's separate go-ahead was specifically for the dead frontend trees, not this.

---

## Candidate milestones for Milestone 3 (no default selected — founder to choose)

1. **Pipeline write layer** — `PRODUCT_ROADMAP.md` Phase 1 remainder, `TECHNICAL_DEBT.md` TD-004. Same shape of gap the journal just had; the app's other "personal, differentiating" feature is still read-only.
2. **Journal reviews** — `TECHNICAL_DEBT.md` TD-017. Natural follow-on to this milestone: lets the founder actually close the loop when a `reviewDueAt` date arrives, not just see it.
3. **Finish the naming/formatting cleanup** — close out TD-015 and TD-016 (now including the `db/schema.sql` comment) as a small, dedicated, low-risk milestone before more code lands on top of them.
4. **Pure-function test suite** — `TECHNICAL_DEBT.md` TD-005 (now also covering TD-018's journal-specific gap). Cheapest, highest-trust-value test coverage, no DB/network mocking required for the pure-function parts; `journal_service.py`'s DB-touching functions would need a mocking or test-DB strategy not required by the rest of the suite.
5. **Universe expansion** — `PRODUCT_ROADMAP.md` Phase 2. Makes "Discover" mean something beyond reshuffling 8 fixed companies; a prerequisite for Scoring Engine v2.

---

## Milestone 1: Product Realignment

**Status:** ✅ Complete.

### Objective

Bring the repository into a clean, consistent, documented state before any new feature work begins. Remove confirmed-dead code, fix small but real documentation/reality mismatches, and leave the project genuinely ready for Milestone 2 — not just "audited," but actually cleaned up.

### Scope (all completed)

- Deleted confirmed-dead frontend directory trees (`src/components/**`, `src/hooks/**`, `src/lib/api/**`, plus the orphaned `src/lib/mock-data.ts`/`src/lib/utils.ts`) — TD-002, resolved.
- Deleted stray empty artifact directory `backend/backend/{db,ingest,.github/workflows}`.
- Fixed product-name drift in `frontend/src/routes/__root.tsx` ("Quant Terminal" → "Stock Finder").
- Resolved dangling references to `CLAUDE.MD` / `Product_Vision.md` / `API_CONTRACT.md` across the docs suite — founder confirmed these were intentionally removed from the repo, not missing from an upload.
- Updated `TECHNICAL_DEBT.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`, `ENGINEERING_GUIDE.md`, `ENGINEERING_ROADMAP.md`, `UI_UX.md`, `README.md`, `PRODUCT_REQUIREMENTS.md`, `DECISIONS.md` (append-only ADR-012) to reflect the above.

### Out of scope (deliberately deferred, not touched)

- Scoring engine changes (`services/scoring_service.py`, `analysis/*`) — tied to `PRODUCT_ROADMAP.md` Phase 3.
- Universe expansion beyond 8 companies — `PRODUCT_ROADMAP.md` Phase 2.
- Journal and pipeline write paths (TD-003, TD-004) — `PRODUCT_ROADMAP.md` Phase 1, a feature milestone, not cleanup.
- SSR → static SPA deployment migration (TD-007, ADR-010).
- News pipeline live validation (TD-008, TD-009).
- Wiring `shareholding_pattern` into scoring (TD-011).
- Any new database tables, routes, or UI.

### Progress

Complete. See the full completion report delivered alongside this update for the change-by-change summary, verification steps, and issues found but not fixed.

### Tasks (all done)

1. Re-verified and deleted dead frontend trees; build/typecheck confirmed clean.
2. Deleted stray artifact directory.
3. Fixed title/meta copy in `__root.tsx`.
4. Confirmed the `CLAUDE.MD`/`Product_Vision.md`/`API_CONTRACT.md` question with the founder (intentionally removed); updated docs accordingly.
5. Updated `CURRENT_STATE.md`, `TECHNICAL_DEBT.md`, `ARCHITECTURE.md`, `CHANGELOG.md`.

### Risks

None materialized. Every change was either a deletion of already-confirmed-dead code or a text-only doc/copy fix; nothing behavior-changing was touched.

### Dependencies

Resolved — founder confirmed the three legacy files were intentionally removed from the repository.

### Definition of Done — all met

- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; all six routes present in the SSR bundle.
- `npm run lint` — pre-existing CRLF/formatting debt found (~7,720 findings across the codebase, confirmed pre-existing and unrelated to this milestone's changes) and logged as `TECHNICAL_DEBT.md` TD-015, not fixed (out of scope — a repo-wide reformat isn't an incremental change).
- No remaining references anywhere in the current-state docs to `CLAUDE.MD`/`Product_Vision.md`/`API_CONTRACT.md` as if they still exist; historical records (`CHANGELOG.md`, `MODULE_*_REPORT.md`) deliberately left as-is.
- `TECHNICAL_DEBT.md` TD-002, TD-012, TD-013 marked resolved with this milestone; TD-015 and TD-016 added for issues found but not fixed.
- `CHANGELOG.md` has a new top entry for this milestone.
- This document updated to Complete.

### Expected deliverables — all delivered

- Updated frontend tree (dead code removed): `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/lib/api/`, `frontend/src/lib/mock-data.ts`, `frontend/src/lib/utils.ts` deleted.
- Updated `frontend/src/routes/__root.tsx`.
- Removed stray backend directory artifact.
- Updated `TECHNICAL_DEBT.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`, `CHANGELOG.md`, `README.md`, `PRODUCT_REQUIREMENTS.md`, `ENGINEERING_GUIDE.md`, `ENGINEERING_ROADMAP.md`, `UI_UX.md`, `DECISIONS.md`.
- This file, updated to Complete.

### Found but not fixed (flagged per founder's development rules rather than auto-fixed)

- **TD-015** — repo-wide CRLF/formatting lint debt (pre-existing, cosmetic, ~7,720 findings). Fixing it touches nearly every file — not an incremental change, needs its own isolated milestone or PR.
- **TD-016** — the same "Quant" scaffold-name drift fixed in `__root.tsx` also appears in `shared/components/layout/AppShell.tsx`'s nav logo and six per-route `<title>` tags. Left untouched because the approved scope named only `__root.tsx`.

---

## Candidate milestones for Milestone 2 (no default selected — founder to choose)

1. **Backend write layer (journal + pipeline)** — `PRODUCT_ROADMAP.md` Phase 1, `TECHNICAL_DEBT.md` TD-003/TD-004. Highest product impact: makes the journal (the product's stated emotional core) actually usable, and is the prerequisite for any future scoring calibration.
2. **Finish the naming/formatting cleanup** — close out TD-015 and TD-016 as a small, dedicated, low-risk milestone before adding new code on top of them.
3. **Pure-function test suite** — `TECHNICAL_DEBT.md` TD-005, `ENGINEERING_ROADMAP.md` Phase E1's unfinished item. Cheapest, highest-trust-value test coverage (`scoring_service.py`, `compute_scores.py`, `analysis/rules/*`), no DB/network mocking required.
4. **Universe expansion** — `PRODUCT_ROADMAP.md` Phase 2. Makes "Discover" mean something beyond reshuffling 8 fixed companies; a prerequisite for Scoring Engine v2.
