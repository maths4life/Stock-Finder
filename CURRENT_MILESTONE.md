# Current Milestone

**Read `HANDOFF.md` first if this is a new session. This document is the second stop — it tells you exactly what's in flight right now.**

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
