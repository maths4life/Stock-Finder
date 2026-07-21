# Changelog

## Milestone 5 — Universe Expansion (8 → ~100 companies) & Fresh Database Initialization

Feature milestone: replaced the hardcoded 8-company development universe with a scalable, CSV-backed universe loader populated with Nifty 50 + Nifty Next 50 (~100 companies). Preceded by a founder-requested architecture review (design discussion, no code) confirming this as the correct next milestone before any implementation began.

### Backend — files created
- `backend/backend/data/universe_top100.csv` — the new structured source of truth: 100 rows (50 Nifty 50 + 50 Nifty Next 50), columns `symbol`, `yahoo_ticker`, `exchange`, `name`, `sector`, `index_membership`, `is_active`. Compiled from public index-constituent references; the Tata Motors → `TMPV.NS` rename (post the Oct 2025 demerger) and `ENRIN.NS` (Siemens Energy India) were individually spot-checked. **Not round-tripped against a live `yfinance` call for all 100 tickers in this session** — see `TECHNICAL_DEBT.md` TD-023.
- `backend/backend/ingest/reset_market_data.py` — one-time fresh-DB-init script. Truncates the market-generated tables (`scores`, `technical_snapshot`, `prices_daily`, `shareholding_pattern`, `financials_quarterly`) and removes stale pre-Milestone-5 `companies` rows — but only ones not referenced by `journal_entries`/`pipeline_items` (an FK-safety check that deliberately keeps, rather than force-deletes, any old row a journal entry or pipeline item still points at). Never touches `journal_entries`, `journal_reviews`, `pipeline_items`, or any news/intelligence table. `--dry-run` and `--skip-companies` flags. Not part of the scheduled cron — a deliberate one-off, run manually.

### Backend — files modified
- `backend/backend/ingest/universe.py` — rewritten from a hardcoded Python list of 8 dicts into `load_universe()`, a loader over `data/universe_top100.csv`. Fails loudly (not silently) on a missing file, a missing required column, a duplicate symbol, or a row missing `yahoo_ticker`/`name`. A backwards-compatible module-level `UNIVERSE` constant is still exported, so no call site needed to change its import.
- `backend/backend/ingest/fetch_prices.py` — now incremental: for a symbol that already has rows in `prices_daily`, only fetches trading days after the latest stored date, instead of always re-requesting the full 2-year `HISTORY_PERIOD`. New `--full-refetch` CLI flag forces the old always-full-backfill behavior. `ensure_company_rows()` now also writes `index_membership`/`is_active` through to `companies`. Added an end-of-run summary (full backfills / incremental updates / already-current / no-data / failed counts).
- `backend/backend/ingest/compute_technicals.py`, `backend/backend/ingest/compute_scores.py` — **no logic changes.** Both already imported `UNIVERSE` from `ingest.universe`; that import now transparently resolves to 100 companies instead of 8. A one-line comment was added to each noting this.
- `backend/backend/db/schema.sql` — added `companies.index_membership text` (additive, via the file's existing `alter table add column if not exists` migration-guard convention — no destructive change, no data loss on an existing database).
- `backend/backend/services/company_service.py` — `get_all_companies` (the list path used by Discover/Search/Screener) now filters `where c.is_active`. `get_company_by_symbol` deliberately does **not** gain this filter, so a journal entry or pipeline item pointing at a company that later leaves the tracked universe still resolves on its own detail page. See `DECISIONS.md` ADR-015 for the full reasoning — this is a small addition beyond the milestone's literal checklist, done because `companies.is_active` only becomes meaningful once something both writes and reads it.
- `frontend/src/routes/index.tsx` — removed the hardcoded "Eight companies surfaced across four narratives" homepage copy (flagged as stale in `CURRENT_STATE.md` since Milestone 4) — replaced with wording that doesn't hardcode a company count at all, since the true count now varies with the universe CSV rather than being a fixed number worth stating in the UI.

### Confirmed unchanged (by design, not by omission)
- `services/discover_service.py`, `services/screener_service.py` — verified these never imported `UNIVERSE` in the first place; both already query the `companies` table directly. No changes were needed for Discover/Screener to work against ~100 companies instead of 8 — confirming the pre-existing architecture was already universe-size-agnostic on the read side.
- `.github/workflows/ingest.yml` — unchanged; still calls `fetch_prices` → `compute_technicals` → `compute_scores` in order. `reset_market_data.py` was deliberately **not** added to this workflow — it's a one-time/rare operation, not a daily one.
- Scoring formulas (`compute_scores.py`), indicator math (`compute_technicals.py`/`indicators.py`) — untouched, per the explicit instruction to change only what removing the hardcoded universe required.

### Verification performed
- All modified/new Python files (`ingest/universe.py`, `ingest/fetch_prices.py`, `ingest/compute_technicals.py`, `ingest/compute_scores.py`, `ingest/reset_market_data.py`, `services/company_service.py`) compile cleanly and were actually imported with real dependencies installed (`sqlalchemy`, `pandas`, `yfinance`, `fastapi`, `pydantic`, `psycopg2-binary`), confirming `compute_technicals.py`/`compute_scores.py` genuinely now see all 100 companies with zero code changes, and confirming `company_service.py`'s new `is_active` filter builds the expected SQL.
- `data/universe_top100.csv` validated programmatically: exactly 100 rows, 100 unique symbols, 100 unique `yahoo_ticker`s, no blank fields, 50/50 NIFTY50/NIFTYNEXT50 split.
- A local Postgres install was attempted specifically to run `reset_market_data.py` and the incremental-fetch logic end-to-end against a real database; it failed (the `postgresql-16` server package 404'd from the sandbox's available mirror) and the partial install was cleaned up rather than left broken. **Not performed:** an end-to-end run of `reset_market_data.py`, the incremental price-fetch logic, or all 100 `yahoo_ticker`s against live `yfinance` — see `TECHNICAL_DEBT.md` TD-023/TD-024, both flagged for the founder to close with one real run before relying on either script.
- Frontend: grepped for other hardcoded universe-size assumptions beyond the homepage copy; none found (a broader "eight"/"8" sweep turned up only false-positive matches on the substring "height" inside shadcn UI primitives).

### Not touched this session (per explicit scope instruction)
- TD-002 (dead frontend trees), test suite (TD-005), scoring engine redesign, admin tooling, a universe-management UI — all explicitly named as out of scope in the milestone brief and left alone.
- `config/sectors.py`'s keyword table was not extended for the ~90 new companies' sector labels — Module 7 (news) is itself still unvalidated against live data (TD-008), so this has no user-visible effect yet. Logged as `TECHNICAL_DEBT.md` TD-026.

---

## Milestone 4 — Journal Reviews Backend (TD-017)

Feature milestone: closed the journal module's last remaining gap by building full CRUD for `journal_reviews` (the review/retrospective half of the journal), mirroring the `journal_entries` (Milestone 2) and `pipeline_items` (Milestone 3) write-layer pattern exactly. Scope was explicitly confirmed with the founder before starting: `HANDOFF.md`/`CURRENT_MILESTONE.md` were followed over the broader product-vision brief that opened this session, and TD-017 was picked from `CURRENT_MILESTONE.md`'s candidate list over four other options (dead-tree investigation, test suite, universe expansion, naming cleanup).

### Backend — files created
- `backend/backend/schemas/journal_review.py` — `JournalReviewBase`/`Create`/`Update`/full `JournalReview` Pydantic models, camelCase, mirroring the `journal_reviews` table in `db/schema.sql` exactly. `thesisPlayedOut` restricted to `yes`/`partially`/`no`. Unlike `JournalEntryUpdate`/`PipelineItemUpdate`, `JournalReviewUpdate` deliberately excludes `entryId` (and `reviewedAt`) — a review's parent entry and review date are immutable after creation; see `DECISIONS.md` ADR-014.
- `backend/backend/services/journal_review_service.py` — business logic + SQL for all five operations (list, get-one, create, update, delete). Validates the referenced `entryId` exists in `journal_entries` before writing (raises `EntryNotFoundError`, translated to a 400 by the route layer, same pattern as `SymbolNotFoundError` in the other two write layers). `reviewedAt` auto-set to now on create.
- `backend/backend/routes/journal_reviews.py` — thin route layer: `GET /journal-reviews`, `GET /journal-reviews/{id}`, `POST /journal-reviews` (201), `PUT /journal-reviews/{id}` (200), `DELETE /journal-reviews/{id}` (204). Malformed (non-UUID) ids rejected with a clean 404 rather than a raw DB error.

### Backend — files modified
- `backend/backend/app.py` — registered `journal_reviews_router`.

### Frontend — files created
- `frontend/src/features/journal/api/journalReviews.ts` — `fetchJournalReviews`, `createJournalReview`, `updateJournalReview`, `deleteJournalReview`, following the same `fetch`-based pattern as `features/journal/api/journal.ts`.
- `frontend/src/features/journal/hooks/useJournalReviews.ts` — `useJournalReviews` query plus `useCreateJournalReview`/`useUpdateJournalReview`/`useDeleteJournalReview` mutations, each invalidating `queryKeys.journalReviews` and showing a `sonner` toast on success/error.
- `frontend/src/features/journal/components/JournalReviewForm.tsx` — create/edit dialog, `react-hook-form` + `zod`. `thesisPlayedOut` and `wouldBuyAgain` use radio-group pickers (tri-state and yes/no respectively, both allowing "unset"). The `aiComparisonSummary` field is labeled "Notes comparing thesis vs. outcome" in the UI — deliberately not implying automation, since none exists (see the AI-generation scope decision below).
- `frontend/src/features/journal/components/JournalReviewList.tsx` — per-entry review timeline (rendered under each journal entry), with add/edit/delete controls; delete goes through an `AlertDialog` confirmation, matching the existing journal-entry delete pattern. Highlights the "+ Add review" button when the entry's `reviewDueAt` has passed.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — added `JournalReview`, `JournalReviewInput`, `JournalReviewUpdateInput`, `ThesisOutcome` types, matching the new backend contract exactly.
- `frontend/src/shared/hooks/queryKeys.ts` — added `journalReviews` query key alongside the existing `journalEntries` key.
- `frontend/src/routes/journal.tsx` — loader now prefetches both `journalEntries` and `journalReviews` in parallel; reviews are fetched once and grouped by `entryId` client-side (same "single fetch, client-side Map" pattern already used to join entries to companies), then `JournalReviewList` is rendered under each entry article.

### Found: `ai_comparison_summary` column's inline schema comment implies AI generation — deliberately not implemented
`journal_reviews.ai_comparison_summary`'s column comment in `db/schema.sql` describes it as "generated by comparing thesis vs current financials/price." Building that generation logic (an LLM call or a deterministic comparison job) was judged out of scope for TD-017: it would be a new subsystem, which the founder's session instructions said to stop and explain before building, and `PRODUCT_REQUIREMENTS.md` explicitly states the product should never let "AI-generated opinions stand in for real analysis" — auto-generating this field would cut against a stated product principle, not just add scope. Implemented instead as a plain, optional, freely-writable text field, with UI copy that doesn't imply automation. Recorded as `DECISIONS.md` ADR-013.

### Verification performed (this session's sandboxed environment had network access, unlike Milestone 3's)
- Backend: `pip install`'d the real dependencies (`fastapi`, `sqlalchemy`, `psycopg2-binary`, `python-dotenv`, `feedparser`), imported the full `app.py`, and generated `app.openapi()` — confirmed `/journal-reviews` and `/journal-reviews/{id}` registered under the correct GET/POST/PUT/DELETE methods, and every pre-existing route (`journal-entries`, `pipeline-items`, etc.) unaffected. Directly unit-verified the new Pydantic validators in isolation (rejects invalid `thesisPlayedOut`, rejects blank `entryId`, confirms `entryId` is correctly excluded from `JournalReviewUpdate`).
- Frontend: `npm install` succeeded; `npx tsc --noEmit` passed for every new/modified file (8 pre-existing errors remain, all inside dead/orphaned files untouched this session — 7 newly logged as `TECHNICAL_DEBT.md` TD-022, the 8th inside `src/lib/api/companies.ts` already covered by TD-002); a full `npm run build` (SSR, `cloudflare-module` preset, confirming the actual Cloudflare Workers deployment target) succeeded. `npx eslint --fix` applied to the four new files, all now lint-clean.
- **Not performed:** an end-to-end write/read/delete cycle against a live Postgres database — no `DATABASE_URL`/database instance was available. Logged as `TECHNICAL_DEBT.md` TD-021.
- This closes the network/tooling-access half of `TECHNICAL_DEBT.md` TD-020 for good — see that item's Milestone 4 note.

### Not touched this session (per explicit founder instruction)
- TD-002 (dead frontend trees `src/components/`, `src/hooks/`, `src/lib/`) — left untouched pending a separate investigation into the delivery/packaging process, per the founder's explicit instruction this session.
- TD-005 (test suite), universe expansion, TD-015/TD-016 (naming/formatting cleanup) — the other four `CURRENT_MILESTONE.md` candidates, per the founder's explicit instruction not to start any of them until TD-017 was complete.

---

## Milestone 3 — Pipeline Backend

Feature milestone: replaced the read-only pipeline with a real, persistent, full-CRUD backend-backed feature. Dead frontend trees were found present a third time at the start of this milestone and, per the founder's explicit instruction, left in place this time (see note below) rather than deleted again.

### Backend — files created
- `backend/backend/schemas/pipeline.py` — `PipelineItemBase`/`Create`/`Update`/`StageUpdate`/full `PipelineItemDetail` Pydantic models, camelCase, mirroring the `pipeline_items` table in `db/schema.sql` exactly. Field validation: non-empty `symbol` (normalized to uppercase), `stage` restricted to the three existing values (`Watching`/`Researching`/`Conviction`).
- `backend/backend/services/pipeline_service.py` — business logic + SQL for all six operations (list, get-one, create, update, move-stage, delete). Validates the referenced `symbol` exists in `companies` before writing (raises `SymbolNotFoundError`, translated to a 400 by the route layer). `updated_at` bumped to now on every write, including stage moves.
- `backend/backend/routes/pipeline.py` — thin route layer: `GET /pipeline-items`, `GET /pipeline-items/{id}`, `POST /pipeline-items` (201), `PUT /pipeline-items/{id}` (200), `PATCH /pipeline-items/{id}/stage` (200), `DELETE /pipeline-items/{id}` (204). Malformed (non-UUID) ids rejected with a clean 404 rather than a raw DB error.

### Backend — files modified
- `backend/backend/app.py` — registered `pipeline_router`.
- `backend/backend/schemas/discover.py` — added `id: str` to the existing grouped `PipelineItem` model (additive, non-breaking) so the frontend can address a specific row for edit/move/delete without changing what the endpoint returns for any other field.
- `backend/backend/services/discover_service.py` — `_PIPELINE_QUERY` now selects `id`; `get_pipeline()` includes it in each returned `PipelineItem`. No other change to the existing grouped read path.

### Frontend — files created
- `frontend/src/features/pipeline/api/pipeline.ts` — `createPipelineItem`, `updatePipelineItem`, `movePipelineItemStage`, `deletePipelineItem`, following the same `fetch`-based pattern as `features/journal/api/journal.ts`.
- `frontend/src/features/pipeline/hooks/usePipelineItems.ts` — `useCreatePipelineItem`, `useUpdatePipelineItem`, `useMovePipelineItemStage` (optimistic — moves the card between the grouped `GET /pipeline` cache's columns immediately, rolls back on error), `useDeletePipelineItem`; each shows a `sonner` toast on success/error and invalidates both `queryKeys.pipeline` and `queryKeys.pipelineItems`.
- `frontend/src/features/pipeline/components/PipelineItemForm.tsx` — create/edit dialog, `react-hook-form` + `zod`, company picker sourced from `useAllCompanies()`, stage picker restricted to the three existing stages.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — added `id: string` to the existing `PipelineItem` type (matches the additive backend change); added new `PipelineItemDetail` and `PipelineItemInput` types for the per-item CRUD endpoints, kept separate from the pre-existing grouped `PipelineColumn`/`PipelineItem` shapes.
- `frontend/src/shared/hooks/queryKeys.ts` — added `pipelineItems` query key alongside the existing `pipeline` key.
- `frontend/src/routes/ideas.tsx` — rebuilt: "+ Add company" now opens the create form (previously had no handler at all); each card has a dropdown menu (Edit note / Move to.../ Remove); Remove goes through an `AlertDialog` confirmation, matching the journal's delete pattern. No drag-and-drop added — none existed before this milestone, and the founder confirmed a dropdown/action-menu approach should be used instead.

### Found: dead trees present a third time — left in place, not re-deleted
At the start of this milestone, per the required documentation-vs-code verification step, the dead frontend trees (`src/components/`, `src/hooks/`, `src/lib/api/`, `src/lib/mock-data.ts`, `src/lib/utils.ts`) were found present again — a third time, after being deleted in both Milestone 1 and Milestone 2. Re-verified dead by the same method (zero live imports, `components.json` aliases unchanged). Flagged to the founder before proceeding; per the founder's explicit instruction, they were **left untouched** this time, since a third recurrence after two clean deletions is treated as a signal about the delivery/handoff/packaging process rather than something a milestone-scoped deletion can actually fix. See `TECHNICAL_DEBT.md` TD-002.

### Found: milestone brief's stage list didn't match the existing schema
The milestone brief specified six stages (`Watchlist`/`Researching`/`High Conviction`/`Ready to Buy`/`Invested`/`Archived`). The actual `pipeline_items.stage` column and every existing consumer (`discover_service.py`, `schemas/discover.py`, `shared/api/types.ts`, `routes/ideas.tsx`) use three (`Watching`/`Researching`/`Conviction`). Flagged to the founder before proceeding; founder confirmed to keep the existing three stages, per the brief's own instruction to preserve the existing schema rather than redesign it.

### Verification performed
- Backend: `ast.parse` over every new/modified `.py` file — clean. **Not performed:** a full `app.py` import + FastAPI `openapi()` schema generation, or an end-to-end write/read/delete cycle against a live database — `fastapi`/`sqlalchemy` are not installed and this session's environment has no outbound network access to install them, and no `DATABASE_URL`/database instance was available either way. Verified instead by direct structural comparison against the already-registered `journal` module (same layering, same error-handling pattern, same `text()` query style) and against `db/schema.sql`'s column list. Logged as `TECHNICAL_DEBT.md` TD-020.
- Frontend: bracket/brace balance check on all new/edited files — balanced. An isolated `tsc` pass (global install, `--noResolve`, outside the project so path aliases and `node_modules` aren't available) surfaced only import-resolution and implicit-`any` diagnostics expected from that isolation, and zero parse errors (no TS1xxx diagnostics). **Not performed:** `npx tsc --noEmit` or `npm run build` against the real project — `npm install` failed (HTTP 403 from the npm registry, no network access), so `node_modules` doesn't exist in this environment. Logged as `TECHNICAL_DEBT.md` TD-020.
- Manually grepped the frontend tree to confirm no other route or component reads pipeline items outside the new hooks, and that the grouped `GET /pipeline` response shape change (additive `id` field only) doesn't break any existing consumer.
- **Recommended before relying on this:** run `npm install && npm run build && npx tsc --noEmit` and `python -c "from app import app; app.openapi()"` in an environment with dependency/network access, and do one manual smoke test (create → edit → move → refresh → delete) against a real database.

---

## Milestone 2 — Journal Backend

Feature milestone: replaced the mock-only journal with a real, persistent, full-CRUD backend-backed feature. Also re-deleted the legacy dead frontend trees at the founder's explicit request (see note below) after finding them still present despite Milestone 1's changelog entry claiming their removal.

### Backend — files created
- `backend/backend/schemas/journal.py` — `JournalEntryBase`/`Create`/`Update`/full `JournalEntry` Pydantic models, camelCase, mirroring the `journal_entries` table in `db/schema.sql` exactly. Field validation: non-empty `symbol`/`thesis`, `confidenceLevel` constrained 1–5, `horizonMonths` must be positive.
- `backend/backend/services/journal_service.py` — business logic + SQL for all five operations (list, get-one, create, update, delete). Validates the referenced `symbol` exists in `companies` before writing (raises `SymbolNotFoundError`, translated to a 400 by the route layer). Auto-computes `reviewDueAt` from `createdAt` + `horizonMonths` on both create and update, per the column comment in `schema.sql`. Dependency-free month-addition helper (no `python-dateutil` in `requirements.txt`), handles month-end edge cases (e.g. Jan 31 + 1 month → Feb 28/29).
- `backend/backend/routes/journal.py` — thin route layer: `GET /journal-entries`, `GET /journal-entries/{id}`, `POST /journal-entries` (201), `PUT /journal-entries/{id}` (200), `DELETE /journal-entries/{id}` (204). Malformed (non-UUID) ids rejected with a clean 404 rather than a raw DB error.

### Backend — files modified
- `backend/backend/app.py` — registered `journal_router`.

### Frontend — files created
- `frontend/src/features/journal/components/JournalEntryForm.tsx` — create/edit dialog, `react-hook-form` + `zod`, company picker sourced from `useAllCompanies()`, covers every writable `journal_entries` column.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — `JournalEntry` type replaced to match the real backend contract (was previously an invented shape — `catalysts`/`risks` arrays, `conviction`, `date`, `reviewDue` — that never matched `db/schema.sql`); added `JournalEntryInput` for create/update payloads.
- `frontend/src/features/journal/api/journal.ts` — rewritten from `resolveMock(...)` over static data to real `fetch` calls against all five endpoints, following the same pattern as `features/company/api/companies.ts` and `features/market/api/market.ts`.
- `frontend/src/features/journal/hooks/useJournalEntries.ts` — added `useCreateJournalEntry`, `useUpdateJournalEntry`, `useDeleteJournalEntry` mutations, each invalidating `queryKeys.journalEntries` on success and showing a `sonner` toast on success/error.
- `frontend/src/routes/journal.tsx` — rebuilt: entries now render every real field (previously rendered `catalysts`/`risks` arrays that don't exist in the schema); "+ Start a new thesis" button now opens the create form (previously had no `onClick` at all); added per-entry Edit and Delete controls, the latter behind an `AlertDialog` confirmation.
- `frontend/src/routes/__root.tsx` — mounted `<Toaster />` (from `shared/components/ui/sonner.tsx`, already present but never mounted) so mutation feedback is visible.

### Frontend — files deleted
- `frontend/src/features/journal/api/mock/` (and its contents) — the journal's last remaining mock-data fallback.

### Frontend — dead trees re-deleted (see "Found: stale delivery" below)
- `frontend/src/components/**`, `frontend/src/hooks/**`, `frontend/src/lib/api/**`, `frontend/src/lib/mock-data.ts`, `frontend/src/lib/utils.ts` — re-verified zero live imports (all references were internal to the dead `components/` tree itself), then deleted. This is the same set Milestone 1's changelog entry already claims was deleted; see the finding below.

### Found: stale delivery, not a regression
At the start of this milestone, per the required documentation-vs-code verification step, the dead frontend trees listed above were found still physically present, despite `HANDOFF.md`, `CURRENT_STATE.md`, and this changelog's own Milestone 1 entry (above) all stating they were deleted. Zero live imports pointed to them at this check either, same as Milestone 1's finding — this points to a stale/pre-cleanup copy of the repository being delivered for this milestone, not a real regression of Milestone 1's work. Flagged to the founder before proceeding; founder approved re-deleting them as part of this milestone, outside the original journal-only scope.

### Verification performed
- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeded; SSR bundles generated for all six routes (`/`, `/research`, `/research/$symbol`, `/screener`, `/journal`, `/ideas`), including the rebuilt journal page and its new form/dialog components.
- `npm run lint` — CRLF/formatting findings (TD-015) grew from ~7,720 to ~8,249; confirmed this is only new files following the existing (CRLF) convention, not a new category of error — the only non-CRLF findings are pre-existing `react-refresh/only-export-components` warnings in shadcn UI files, unrelated to this milestone.
- Backend: `ast.parse` over every new/modified `.py` file; a full `app.py` import plus FastAPI `openapi()` schema generation, confirming all five journal routes register with the correct HTTP methods and paths (`GET`/`POST /journal-entries`, `GET`/`PUT`/`DELETE /journal-entries/{id}`) alongside the four pre-existing routers, unaffected.
- Backend: unit-level sanity check of `journal_service._add_months` (including the Jan 31 → Feb 28 month-end edge case) and the Pydantic validators (blank thesis rejected, out-of-range confidence rejected) run directly in Python.
- Manually grepped the full frontend tree for any other reference to the old mock `JournalEntry` shape (`catalysts`, `.risks`, `.conviction`, `reviewDue`) or to the deleted dead trees — none found outside the files listed above.
- **Not verified:** an actual end-to-end write/read/delete cycle against a live Postgres database — no `DATABASE_URL`/database instance was available in this environment. SQL was verified by direct comparison against `db/schema.sql`'s column list and by successful route registration, not by execution. Flagged in `CURRENT_MILESTONE.md`'s "Remaining limitations."

---

## Milestone 1 — Product Realignment

Cleanup-only milestone: no features added, no scoring/UI/API behavior changed. Full audit, plan, and completion report are in the Milestone 1 planning conversation; `CURRENT_MILESTONE.md` holds the durable summary.

### Frontend — deleted (confirmed zero live imports before removal)
- `frontend/src/components/**` — dead duplicate of `shared/components/**` (shadcn `ui/` set, `common/`, `company/`, `layout/`, plus top-level `AppShell.tsx`, `CommandPalette.tsx`, `Sparkline.tsx`).
- `frontend/src/hooks/**` — dead duplicate of `shared/hooks/**` and `features/*/hooks/**`.
- `frontend/src/lib/api/**` — dead duplicate of `features/*/api/**`, including its own `mock/`.
- `frontend/src/lib/mock-data.ts`, `frontend/src/lib/utils.ts` — orphaned once `components/` (their only importer) was deleted; removed as a direct, mechanical consequence rather than left as new dead code.

### Frontend — modified
- `frontend/src/routes/__root.tsx` — page `<title>`, `og:title`, and `author` meta corrected from the leftover scaffold name "Quant Terminal" to "Stock Finder", matching every product document. (Same "Quant" naming was found in `shared/components/layout/AppShell.tsx`'s nav logo and in per-route `<title>` tags in `screener.tsx`, `journal.tsx`, `ideas.tsx`, `research.tsx`, `research.$symbol.tsx`, and `index.tsx` — left untouched, out of the milestone's approved scope; see the completion report's "found but not fixed" list.)

### Backend — deleted
- `backend/backend/{db,ingest,.github/workflows}` — an empty stray directory, an artifact of a `mkdir -p {a,b,c}` command run without brace expansion. No files were inside it; deletion has no functional effect.

### Documentation — updated to remove stale references
`CLAUDE.MD`, `Product_Vision.md`, and `API_CONTRACT.md` were confirmed by the founder as intentionally removed from the repository (not missing from an upload). Every document that referenced them as live files needing future reconciliation was updated to reflect that the reconciliation already happened, by removal:
- `README.md`, `PRODUCT_REQUIREMENTS.md`, `CURRENT_STATE.md` (§0, module table, §3, §6), `ARCHITECTURE.md` (§3), `TECHNICAL_DEBT.md` (TD-002, TD-012, TD-013 marked resolved), `ENGINEERING_GUIDE.md`, `ENGINEERING_ROADMAP.md`, `UI_UX.md` — updated in place.
- `DECISIONS.md` — left ADR-006 and ADR-009 unedited per the log's append-only rule; added ADR-012 to record the resolution.
- `MODULE_4_REPORT.md`, `MODULE_5_REPORT.md`, `MODULE_7_REPORT.md`, and this changelog's own historical entries below — intentionally left untouched; they're timestamped records of past work, not current-state descriptions.

### Verification performed
- `npx tsc --noEmit` — clean, zero errors.
- `npm run build` — succeeded; SSR bundles generated for all six routes (`/`, `/research`, `/research/$symbol`, `/screener`, `/journal`, `/ideas`).
- `npm run lint` — pre-existing CRLF/formatting issues found across most of the frontend (~7,720 `prettier/prettier` findings); confirmed pre-existing by checking an untouched file (`screener.tsx`, CRLF) against an edited one (`__root.tsx`, LF, only 3 pre-existing unrelated formatting nits). Not caused by this milestone; not fixed, since a repo-wide reformat is out of scope. See `TECHNICAL_DEBT.md` for a new entry.
- `ast.parse` over every backend `.py` file — no syntax errors after removing the stray directory.
- Re-verified, immediately before deletion, that zero files under `routes/`, `features/`, `shared/`, or `router.tsx` imported from any of the three deleted trees.

---

## Module 7 — Weekly Market Intelligence

### Backend — files created
- `backend/config/sectors.py` — sector keyword lexicon + polarity word
  lists used by the classifier/summary generator (data, not logic).
- `backend/services/news_provider.py` — RSS-based multi-provider news
  fetcher (Google News, Yahoo Finance, Moneycontrol, Economic Times,
  Business Standard) with a registry pattern for adding providers.
- `backend/services/sector_classifier.py` — classifies articles into the
  DB's real sector set (never invents new sector names) and scores
  importance/polarity.
- `backend/services/market_summary_generator.py` — rule-based sector
  outlook, weekly summary prose, and major-event grouping. No LLM calls,
  same documented-heuristic philosophy as `services/scoring_service.py`.
- `backend/services/weekly_market_intelligence.py` — the Weekly
  Intelligence Engine: owns the weekly refresh pipeline and the
  read path for `GET /company/{symbol}/weekly-market-intelligence`.
  Reuses `company_service.get_company_by_symbol` and
  `screener_service.screen_companies` for company/ranking data — no
  Opportunity Score or AI Insight logic duplicated.
- `backend/schemas/weekly_intelligence.py` — `WeeklyMarketIntelligence`,
  `MajorEvent`, `WeeklyRefreshResult`. Reuses `CompanyListItem` from
  `schemas/company.py` for `sectorResearchCandidates`.
- `backend/routes/weekly_intelligence.py` —
  `GET /company/{symbol}/weekly-market-intelligence` and
  `POST /weekly-market-intelligence/refresh` (manual dev refresh).
- `backend/ingest/weekly_news_refresh.py` — CLI entry point
  (`python -m ingest.weekly_news_refresh`) for the weekly cron job,
  mirroring the existing `ingest/compute_scores.py`-style scripts.

### Backend — files modified
- `backend/db/schema.sql` — added `news_articles`,
  `news_article_sectors`, `weekly_sector_intelligence` tables.
- `backend/app.py` — registered the new router.
- `backend/requirements.txt` — added `feedparser`.

### Frontend — files created
- `frontend/src/features/company/components/WeeklyMarketIntelligence.tsx`
  — the Research page section. Reuses `CompanyRow` for "Companies Worth
  Research" and the new `OutlookBadge`.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — added `SectorOutlook`,
  `WeeklyMarketEvent`, `WeeklyMarketIntelligence` types.
- `frontend/src/shared/hooks/queryKeys.ts` — added
  `companies.weeklyMarketIntelligence(symbol)`.
- `frontend/src/features/company/api/companies.ts` — added
  `fetchWeeklyMarketIntelligence`.
- `frontend/src/features/company/hooks/useCompanies.ts` — added
  `useWeeklyMarketIntelligence`.
- `frontend/src/shared/components/common/Badge.tsx` — added
  `OutlookBadge` (Positive/Neutral/Negative), alongside the existing
  `RatingBadge`/`RiskBadge`/`SentimentBadge` family.
- `frontend/src/routes/research.$symbol.tsx` — added SSR prefetch +
  a new `<Section label="Weekly Market Intelligence">` below the
  existing sections. No existing section was reordered or altered.

**Architectural note:** Module 7 does not call an LLM anywhere — sector
outlook, weekly summaries, and "why it matters"/"expected impact" text
are all template-filled from real counts/keyword scores, the same
transparent-heuristic approach `analysis/engine.py` (Module 6) already
established for this codebase. News fetching (`services/news_provider.py`)
could not be executed against live feeds in the environment this module
was built in (no outbound network access) — logic was validated with
synthetic `RawArticle` data instead. See MODULE_7_REPORT.md's Validation
section before relying on this in production.

Full findings, decisions, and validation: see `MODULE_7_REPORT.md`.

---



### Backend — files modified
- None. `GET /company/{symbol}/prices`, `services/technical_service.py`,
  and `schemas/technical.py` already existed and were already correct
  (built as fallout of Module 3 — see that section below) — audited, no
  changes required.

### Frontend — files modified
- `frontend/src/features/company/components/PriceChart.tsx` — rewritten.
  Was a recharts `AreaChart` of `close` only; now a candlestick + volume
  chart built on `lightweight-charts`, rendering the `open`/`high`/`low`/`close`/`volume` fields the backend already returned but the old chart
  never used. Same external prop contract (`data`, `range`,
  `onRangeChange`, `isLoading`) as before, so no other file needed to
  change to consume it.
- `frontend/package.json` — added `lightweight-charts` (`^4.2.0`) to
  `dependencies`.

### Files audited, no changes needed
- `frontend/src/routes/research.$symbol.tsx` — already calls `PriceChart` with the exact props it still expects; no changes.
- `frontend/src/shared/api/types.ts` — `PriceBar`/`PriceRange` already
  matched the backend exactly (added in Module 3); no changes.
- `frontend/src/features/company/api/companies.ts`,
  `frontend/src/features/company/hooks/useCompanies.ts`, `frontend/src/shared/hooks/queryKeys.ts` — `fetchCompanyPrices`, `useCompanyPrices`, and
  the `companies.prices(symbol, range)` query key were all already
  correct; no changes.

**Architectural note:** colors for the candlestick/volume series are read
from the theme's resolved CSS custom properties (`--positive`, `--negative`, `--hairline`, etc.) via `getComputedStyle` at chart-build/data-update
time, not hardcoded — `<canvas>` can't resolve `var()` references the way
SVG/DOM elements can, so this is the closest equivalent to the old
chart's `var(--color-accent)` usage while staying on the same theme
tokens `shared/components/ui/chart.tsx`'s `THEMES` map already defines.

Full findings, decisions, and validation: see `MODULE_5_REPORT.md`.

---

## Module 4 — Screener

### Backend — files modified
- `backend/services/screener_service.py` — **new file**. Owns Module 4's
  filtering/sorting/pagination business logic. Reuses
  `company_service.get_all_companies()` for the candidate universe (no
  duplicate SQL/derivation logic); see the file's docstring for the
  scalability tradeoff of filtering in Python vs. SQL at today's scale.
- `backend/schemas/company.py` — added `PaginatedCompanies` response
  model (mirrors `Paginated<Company>` in `frontend/src/shared/api/types.ts`).
- `backend/routes/companies.py` — `GET /companies` now accepts the full
  `CompanyQueryParams` contract (sector, riskLevel, horizon, min/max
  fundamental+technical thresholds, sort, sortDirection, page, pageSize)
  and returns `PaginatedCompanies` instead of a flat array. Replaces the
  `limit` param with `page`/`pageSize`.

**Architectural decision:** superseded the originally-specced standalone
`POST /screener` — see `API_CONTRACT.md`'s Module 4 section and
`MODULE_4_REPORT.md` for the reasoning (both `screener.tsx` and
`research.tsx` were already built against `GET /companies`, so extending
it in place avoids two implementations of the same filtering logic).

### Frontend — files modified
- `frontend/src/features/company/api/companies.ts` — `fetchCompanies()`
  now sends the full filter/sort/pagination query string and returns the
  backend's `Paginated<Company>` response directly (no more client-side
  slicing/filtering). `fetchAllCompanies()` and `searchCompanies()`
  rewritten to call `fetchCompanies()` internally and unwrap `.items` —
  one implementation instead of a second flat-array code path.
- `frontend/src/routes/research.tsx` — fixed a latent bug: the "Sort:
  Name (A–Z)" option always sent `sortDirection: "desc"`, which sorts
  Z→A. Invisible while sorting was fake; real backend sorting exposed it.
  Now sends `"asc"` when `sort === "name"`.

Full findings, decisions, and validation: see `MODULE_4_REPORT.md`.

---

## Module 2 — Discover Page (audited, no changes required)

The Discover page backend integration was already complete in the uploaded
repository — `GET /discover/groups`, `GET /pipeline`, `GET /sectors/pulse`,
and `GET /market/indicators` were all implemented in
`backend/routes/discover.py` / `backend/services/discover_service.py`,
registered in `backend/app.py`, and consumed by the frontend
(`features/market/api/market.ts`, `features/market/hooks/useDiscover.ts`)
with SSR loaders using matching query keys. No files were modified.

## Module 3 — Research Dashboard

### Backend
Audited and found already complete (present before this session, not
written now): `GET /company/{symbol}/prices` (`routes/companies.py`,
`services/technical_service.py`, `schemas/technical.py`), and the deep
research fields on `GET /company/{symbol}` — pros/cons, checklist, verdict
summary, shareholding trend, quarterly financials, business summary
(`services/fundamental_service.py`, `services/scoring_service.py`,
`services/company_service.py`). No backend files modified.

### Frontend — files modified
- `frontend/src/shared/api/types.ts` — added `eps`, `goldenCross`, `trend`
  (`Trend` union type added) to `Company`; the backend's `CompanyBase`
  already sent these fields but the frontend type didn't declare them, so
  they were unusable in the UI. Added `PriceBar` and `PriceRange` types
  mirroring `backend/schemas/technical.py`.
- `frontend/src/shared/hooks/queryKeys.ts` — added
  `companies.prices(symbol, range)` key factory entry.
- `frontend/src/features/company/api/companies.ts` — added
  `fetchCompanyPrices(symbol, range)` calling
  `GET /company/{symbol}/prices`.
- `frontend/src/features/company/hooks/useCompanies.ts` — added
  `useCompanyPrices(symbol, range)`.
- `frontend/src/features/company/components/PriceChart.tsx` — **new file**.
  Renders the Price History section using the existing shadcn
  `ChartContainer` (recharts) wrapper already in the repo; range selector
  (1M/3M/6M/1Y/5Y/ALL) re-fetches from the backend per range, no client
  side data invention.
- `frontend/src/routes/research.$symbol.tsx` — added SSR prefetch for the
  default price range (identical query key/fn pair to `useCompanyPrices`,
  per the SSR requirement), rendered the Price History chart, and added
  three previously-missing display sections: Fundamentals (P/B, ROCE,
  Debt/Equity, EPS, Revenue Growth, Profit Growth, Promoter Holding),
  Technicals (RSI, Above 50/200 DMA, Golden Cross, Volume Breakout,
  Trend), and Scorecard extras (Risk Level, Expected Return, Investment
  Horizon). All of these were already returned by the backend but not
  rendered anywhere on the page.
- `frontend/src/features/company/api/mock/companies.data.ts` — added the
  three new required `Company` fields (`eps`, `goldenCross`, `trend`) to
  all 8 fixture records so the (unused, dead-code) file still type-checks.
  This file is not imported by any live route.

### Mock APIs removed
None — the Research page was already backend-driven for every field it
rendered. The gap was that several backend fields (fundamentals,
technicals, price history) were never wired into the UI at all, not that
they were backed by mocks. That gap is closed above.

### Known limitations
- **Industry**: the task asked for an "Industry" field in Company
  Overview. `companies` has no `industry` column (only `sector` — see
  `backend/db/schema.sql`). Per the "reuse existing schema, don't invent
  columns" rule, this wasn't added; the page continues to show `sector`
  only.
- **businessSummary**: still returns `""` — `companies` has no
  description/about column, and Module 3's brief explicitly forbids
  fabricating one or calling an LLM for it.
- **Pre-existing, out-of-scope TypeScript error**: `src/lib/api/companies.ts`
  has an unrelated type error (`'data' does not exist in type
  'Paginated<Company>'`). It lives in the legacy `src/lib` / `src/hooks`
  tree flagged as dead code in Module 1 (parallel, unused duplicate of
  `src/features/company`) and isn't imported by any live route. Left
  untouched per "don't modify Modules 1/2 unless fixing a bug" — this bug
  predates this session and isn't on the Research page's path.
