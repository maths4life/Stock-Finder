# Engineering Roadmap

**Purpose:** engineering-oriented phases — refactors, tests, debt paydown, simplification — sequenced independently of feature work in `PRODUCT_ROADMAP.md`. Read both together; in practice these interleave (e.g., Phase E1 below should land alongside or just before `PRODUCT_ROADMAP.md` Phase 1).

**Audience:** engineers.

---

## Phase E1 — Stop the bleeding (do this before or alongside Product Phase 1)

- ~~**Delete the dead frontend trees**~~ **Done, Milestone 1** (`TECHNICAL_DEBT.md` TD-002): `src/components/`, `src/hooks/`, `src/lib/api/` (plus the orphaned `src/lib/mock-data.ts`/`src/lib/utils.ts`) re-verified unimported and deleted.
- ~~**Reconcile the documentation**~~ **Done, Milestone 1** (TD-012, TD-013): founder confirmed `CLAUDE.MD` and `API_CONTRACT.md` were intentionally removed from the repository; stale references across the docs suite were updated accordingly (see `DECISIONS.md` ADR-012).
- **Add a minimal test suite for pure-function logic** (TD-005): `scoring_service.py`, `compute_scores.py`'s scoring functions, and `analysis/rules/*` are all pure functions over plain dicts — no database or network mocking required. This is the cheapest test coverage available and covers the highest-trust-required code in the system. **Not started — remains a candidate for a future milestone.**
- **Normalize line endings and formatting** (TD-015, found during Milestone 1): add `.gitattributes`/`.editorconfig` enforcing LF, then run a one-time repo-wide `prettier --write .` as its own isolated change. **Not started.**
- **Finish the product-name cleanup** (TD-016, found during Milestone 1, scope grew during Milestone 2): the "Quant" scaffold name still appears in `AppShell.tsx`'s nav logo, six per-route `<title>` tags, and `db/schema.sql`'s header comment. **Not started.**

## Phase E2 — Backend write layer

- ~~Build `routes/journal.py` + `services/journal_service.py` write endpoints~~ **Done, Milestone 2.** Full CRUD for `journal_entries`, following the thin-route/fat-service pattern (`ARCHITECTURE.md` §2, `ADR-002`). No integration tests were added (see the note below and `TECHNICAL_DEBT.md` TD-018) — the project's test suite doesn't exist yet at all (TD-005), so this was flagged as a limitation rather than silently skipped.
- Build `routes/pipeline.py` (or extend `routes/discover.py`) write endpoints — same pattern, now the only remaining item in this phase.
- Add integration tests for both new write paths once TD-005 is picked up — this is the first backend code in the project that mutates state, and it should not stay untested indefinitely given how central it is.

## Phase E3 — Deployment simplification

- Move the frontend from SSR/Cloudflare Workers to a static SPA build (ADR-010, TD-007), unless a specific, stated reason emerges to keep SSR.
- Document the backend's actual deployment target (TD-006) — add a Dockerfile or a one-paragraph "how to run this in production" note, whichever matches how it's actually hosted today.

## Phase E4 — Data layer hardening

- Add a lightweight, numbered SQL migration convention once schema changes are happening more than a couple of times a quarter (TD-014) — not urgent today, tracked so it isn't forgotten.
- Wire `shareholding_pattern` into scoring (TD-011) — small, isolated, high-value, doesn't require Product Phase 2 or 3 to land first.

## Phase E5 — Scale validation (aligned with Product Phase 2)

- ~~Load-test the ingest cron against a 150–300 symbol universe before it's relied on.~~ **Partially done, Milestone 5** — the universe was expanded to ~100 (an intermediate step short of 150–300, by deliberate founder choice) and ingestion time/storage/API performance were *estimated* from the actual code paths (sleep intervals, row counts, query shape), but not measured against a real run — no live Postgres or `yfinance` access was available in that session. **Still open:** an actual timed run of `fetch_prices` → `compute_technicals` → `compute_scores` against the live ~100-company universe. See `TECHNICAL_DEBT.md` TD-023/TD-024.
- Add basic monitoring/alerting on the GitHub Actions cron (currently silent-fail if `fetch_prices`/`compute_technicals`/`compute_scores` errors — verify what actually happens today and whether failures are visible anywhere). **Not started** — `fetch_prices.py` gained a per-run summary of successes/failures as part of Milestone 5, printed to the job log, but nothing surfaces that summary anywhere outside the raw Action log (no alert, no notification) if a run partially or fully fails.

## Phase E6 — News pipeline validation (aligned with Product Phase 5)

- Run Module 7 against real RSS feeds; fix whatever breaks (feed formats, provider URL changes, encoding issues) — assume something will need adjustment, since none of this has touched real data yet (TD-008).
- Add the weekly refresh job to `.github/workflows/ingest.yml` (TD-009), only once E6's manual validation passes.

---

## Standing rules that apply across every phase

1. **No module is "done" until its status in `CURRENT_STATE.md` is updated in the same change.** The drift documented in `CURRENT_STATE.md` §0 (stale `API_CONTRACT.md`, contradictory `CLAUDE.MD` — both since resolved by removing the files, per `DECISIONS.md` ADR-012) happened because documentation updates were treated as optional. Don't repeat that.
2. **No new database table without checking `ENGINEERING_GUIDE.md`'s "when to add a table" rule first** — `pipeline_items` and `journal_reviews` were added well ahead of the API that uses them (`journal_entries` closed this gap in Milestone 2, `pipeline_items` closed it in Milestone 3, `journal_reviews` closed it in Milestone 4); every first-party table now has its API — avoid reopening this gap with a new table.
3. **Any code claiming to be "AI" must actually call a model, or be renamed.** Per ADR-006, the current "AI Insights" naming is already inaccurate; don't add a second instance of the same mismatch.
