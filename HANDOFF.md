# Handoff

**Read this document first, before anything else — including `CURRENT_MILESTONE.md`.** It exists so that any future session (a new AI assistant, a new developer, or you after months away) can pick this project up cold, with no memory of past conversations, and know exactly what to do.

---

## 1. Project overview

Stock Finder is a personal investment research tool, not a commercial product. It answers one question every day: **"What are the best companies I should research today?"** It combines fundamentals and technicals into a small, explainable shortlist, and gives its one real user — the founder — a place to write down and later review their own investment reasoning.

It is deliberately not a screener, not a portfolio tracker, and not a Bloomberg/TradingView/Screener.in competitor. Its differentiator is transparency: every score decomposes into named factors with real numbers behind them, and no AI-generated opinion is ever allowed to stand in for that deterministic reasoning. The full statement of vision, users, and explicit non-features lives in `PRODUCT_REQUIREMENTS.md` — treat that document, not this one, as the authority on *what the product is for*. This document is the authority on *how to work on it*.

The codebase is a FastAPI backend (Postgres, thin routes / fat services) and a React + TanStack Start frontend (SSR, deployed to Cloudflare Workers), covering 9 built modules (companies, discover, research detail, screener, charts, analysis, weekly news, journal, pipeline) — every first-party module with a writable table now has a working write API, as of Milestone 4. The project is developed through discrete, documented milestones, each of which is expected to leave the repository in a clean, fully-documented, buildable state — see §9 for exactly what that means in practice.

---

## 2. Current repository status

- **6 frontend routes**, all building and typechecking cleanly as of Milestone 4's real, network-backed verification (`npm run build`, `npx tsc --noEmit`) — see `TECHNICAL_DEBT.md` TD-020's Milestone 4 note: `/`, `/research`, `/research/$symbol`, `/screener`, `/journal`, `/ideas`.
- **9 backend GET routes + 11 write routes**: `POST /weekly-market-intelligence/refresh` (pre-existing); `POST /journal-entries`, `PUT /journal-entries/{id}`, `DELETE /journal-entries/{id}` (Milestone 2); `POST /pipeline-items`, `PUT /pipeline-items/{id}`, `PATCH /pipeline-items/{id}/stage`, `DELETE /pipeline-items/{id}` (Milestone 3); `POST /journal-reviews`, `PUT /journal-reviews/{id}`, `DELETE /journal-reviews/{id}` (Milestone 4). Journal entries, journal reviews, and pipeline items now all fully persist. Every first-party writable table now has a real write API — the "schema exists, no API" pattern (TD-003/TD-004/TD-017) has no open instance left.
- **One frontend directory structure** (`src/features/*` + `src/shared/*`) — the previous duplicate legacy trees (`src/components/`, `src/hooks/`, `src/lib/api/`) were deleted in Milestone 1, found present again at the start of Milestone 2 and deleted again, found present a third time at the start of Milestone 3 and left in place, and remained in place through Milestones 4 and 5 at the founder's explicit instruction (not touched either milestone, pending a separate investigation). A new data point surfaced in Milestone 4: if each session's project zip is generated from a stale snapshot rather than the live post-milestone repo, that alone would explain the recurrence with no code-level bug at all — worth checking before investigating the code further. If you find them present again in a future session, don't delete a fourth+ time without first checking whether TD-002's root cause has been investigated — see `TECHNICAL_DEBT.md` TD-002.
- **Zero automated tests**, backend or frontend.
- **Universe = ~100 companies (Nifty 50 + Nifty Next 50)**, as of Milestone 5 — `data/universe_top100.csv`, loaded by `backend/backend/ingest/universe.py`'s `load_universe()`. Previously 8 hardcoded companies. Full NSE (~1500–2000) remains a future milestone; scaling to it should only require replacing/extending this one CSV, per `DECISIONS.md` ADR-015.
- Three legacy planning documents (`CLAUDE.MD`, `Product_Vision.md`, `API_CONTRACT.md`) that once existed and once contradicted each other and the code have been intentionally removed from the repository (confirmed by the founder in Milestone 1). They no longer exist and should not be looked for.

For the full, verified, module-by-module inventory — what's real, what's mock, what's stale — read `CURRENT_STATE.md`. It is the single most important document in this repository after this one.

---

## 3. Last completed milestone

**Milestone 5 — Universe Expansion (8 → ~100) & Fresh Database Initialization.** Feature milestone: replaced the hardcoded 8-company `UNIVERSE` list with a CSV-backed loader (`ingest/universe.py`'s `load_universe()`) populated with Nifty 50 + Nifty Next 50 (`data/universe_top100.csv`, 100 companies). Preceded, at the founder's explicit request, by a design-review-only session (no code) covering universe choice, data-source trade-offs, ingestion-pipeline impact, schema impact, update strategy, performance, and risk — see that session's discussion and this milestone's implementation for how each question was resolved in practice. `fetch_prices.py` is now incremental (fetches only new trading days per symbol instead of always re-pulling 2 years); `compute_technicals.py`/`compute_scores.py` needed no code changes at all, since they already only imported `UNIVERSE`; `discover_service.py`/`screener_service.py` needed no changes either, since they already queried `companies` directly rather than importing `UNIVERSE` — confirming the read-side architecture was already universe-size-agnostic. New `ingest/reset_market_data.py` safely clears market-generated tables and stale pre-Milestone-5 `companies` rows (FK-checked against `journal_entries`/`pipeline_items` first) ahead of the fresh universe load, without touching any user-generated data. `companies.is_active` (present in the schema but unused before this milestone) is now genuinely populated and filtered on. Full detail in `CURRENT_MILESTONE.md` and the Milestone 5 entry in `CHANGELOG.md`.

**Important verification note from this milestone:** the sandboxed environment had network access to PyPI/GitHub (so all Python files were actually imported with real dependencies, not just syntax-checked) but not to Yahoo Finance or a live Postgres instance. A local Postgres install was attempted specifically to test `reset_market_data.py` and the incremental-fetch logic end-to-end, but failed (server package unavailable from the sandbox's mirror) and was cleaned up rather than left broken. The universe CSV's 100 `yahoo_ticker` values and the two new scripts' SQL are therefore verified by static review and real imports, not a live run — see `TECHNICAL_DEBT.md` TD-023/TD-024, both flagged for the founder to close with one real run each before relying on them.

**Milestone 4 was: Journal Reviews Backend (TD-017).** Feature milestone: closed the journal module's last remaining gap by building a real, persistent, full-CRUD backend (`routes/journal_reviews.py` + `services/journal_review_service.py` + `schemas/journal_review.py`) and a working frontend review timeline (add/edit/delete) on `/journal`, mirroring the `journal_entries`/`pipeline_items` write-layer pattern exactly. `entryId`/`reviewedAt` are immutable after creation by design (`DECISIONS.md` ADR-014); `ai_comparison_summary` is a plain writable field with no auto-generation logic, deliberately (`DECISIONS.md` ADR-013). Full detail in the Milestone 4 entry in `CHANGELOG.md`.

**Important note from that milestone:** the session opened with a broad, generic "Milestone 4" task brief (Bloomberg-style product vision, Vercel/Render deployment, a fixed task list) that conflicted with this project's actual `HANDOFF.md`/`CURRENT_MILESTONE.md` in multiple material ways. Per this document's own process (§9, §12), the conflict was surfaced to the founder before any code was written, rather than either silently following the brief or silently following the docs. The founder confirmed the project documentation is authoritative and TD-017 was selected from the real candidate list. **This is the process working as intended — flag brief-vs-docs conflicts explicitly, don't guess.**

**Also from that milestone:** that session's sandboxed environment *did* have outbound network access (unlike Milestone 3's) — `pip install` and `npm install` both succeeded, so the real `app.openapi()` generation, `npx tsc --noEmit`, and `npm run build` verification steps could all be run directly, closing the tooling-access half of TD-020. A live Postgres instance still wasn't available, so that milestone's new SQL wasn't exercised end-to-end either — see `TECHNICAL_DEBT.md` TD-021.

**Milestone 3 was: Pipeline Backend.** Feature milestone: replaced the read-only pipeline with a real, persistent, full-CRUD backend and a working frontend create/edit/move/delete UI on `/ideas`. Stages kept at the existing three (`Watching`/`Researching`/`Conviction`). No drag-and-drop added; a dropdown action menu handles moves instead. At the start of that milestone, the dead frontend trees were found present a third time and, per the founder's explicit instruction, left in place rather than re-deleted — see `TECHNICAL_DEBT.md` TD-002. That milestone's sandboxed environment had no network access, so verification relied on syntax checks and structural review rather than a real build — see `TECHNICAL_DEBT.md` TD-020's original note.

**Milestone 2 was:** **Journal Backend** — replaced the mock-only journal with a real, persistent, full-CRUD backend and a working frontend create/edit/delete UI. `journal_reviews` deliberately left unbuilt at the time (`TECHNICAL_DEBT.md` TD-017, since resolved in Milestone 4). At the start of that milestone, the dead frontend trees (deleted in Milestone 1) were found present again, re-verified dead, and deleted a second time at the founder's approval.

Milestone 1 was: **Product Realignment** — cleanup-only, deleted confirmed-dead frontend code, removed a stray empty artifact directory, fixed a product-naming inconsistency in one file, and reconciled every reference to the three removed legacy documents across the docs suite. Two items were found during that cleanup but deliberately left unfixed as out of scope: `TECHNICAL_DEBT.md` TD-015 (repo-wide CRLF/formatting debt) and TD-016 (leftover "Quant" scaffold naming, now also found in `db/schema.sql`'s header comment as of Milestone 2). Both remain open candidates for a near-term milestone.

---

## 4. Current architecture summary

```
Backend (backend/backend/):
  routes/*.py      → thin: parse request, call one service function, return
  services/*.py    → business logic + SQL, one file per module
  schemas/*.py     → Pydantic response models
  analysis/        → deterministic rule engine (misleadingly labeled "AI Insights" in the UI — no model is called anywhere; ADR-006)
  ingest/          → standalone scripts run by GitHub Actions cron, not by the API process
  db/schema.sql    → hand-maintained DDL, no migration tool yet

Frontend (frontend/src/):
  routes/                     → file-based routing
  features/<domain>/{api,hooks,components}
  shared/{api,components/ui,components/common,components/layout,hooks}
```

Full diagrams, the database ER model, and the deployment picture are in `ARCHITECTURE.md`. Two things worth knowing before writing any new code: (1) the "React never screens, ranks, filters, or calculates — FastAPI does" rule is load-bearing, not a suggestion (`ENGINEERING_GUIDE.md` §7); (2) `journal_entries` (Milestone 2), `pipeline_items` (Milestone 3), and `journal_reviews` (Milestone 4) now all have a real write layer, built on the same routes/service/schema pattern — every first-party writable table now has one, so a future new table should get its write API in the same milestone that adds it, per Engineering Principle #6 in §8 below.

---

## 5. Current technical debt summary

Full register with severity, cause, impact, and effort estimates is in `TECHNICAL_DEBT.md`. Highest-priority open items, in order:

1. **TD-001** (🔴) — Fundamentals data is a frozen one-time CSV snapshot with no staleness indicator anywhere in the UI.
2. **TD-002** (🟠) — Dead frontend trees, deleted twice, present a third time as of Milestone 3, and still left in place through Milestones 4 and 5. Needs a process-level investigation, not another deletion.
3. **TD-005** (🟠) — Zero automated tests anywhere, across 9 built modules (now also covers the untested journal, pipeline, and journal-review write paths — TD-018/TD-019, and TD-017's `journal_review_service.py`).
4. **TD-008/TD-009** (🟠/🟡) — News pipeline has never run against a live feed and isn't in the scheduled cron.
5. **TD-023/TD-024** (🟡) — Milestone 5's universe CSV (all 100 `yahoo_ticker`s) and its new `reset_market_data.py`/incremental-fetch logic haven't been exercised against real `yfinance`/Postgres yet — verified by static review and real Python imports only.
6. **TD-021** (🟡) — `journal_reviews`' CRUD (Milestone 4) hasn't been exercised against a live database yet either — same root cause as TD-023/TD-024, different milestone.
7. **TD-022** (🟢) — Two orphaned mock-data files (`features/journal/api/mock/`, `features/market/api/mock/`) surfaced by Milestone 4's real `tsc` run; unreachable from any live route, but not yet deleted (TD-002-adjacent, deliberately deferred).

Resolved as of Milestone 5: none newly resolved (this was a new-capability milestone, not a debt-closing one) — but `companies.is_active` went from an unused column to a genuinely read/written one, incidentally addressing part of what TD-002-style "unused schema" concerns look like elsewhere.

Resolved as of Milestone 4: TD-017 (journal reviews write path — the last "schema exists, no API" gap). TD-020 partially resolved (network/tooling-access half).

Resolved in Milestone 1: TD-002 (duplicate frontend trees, since reopened), TD-012, TD-013 (legacy-document reconciliation). Resolved in Milestone 2: TD-003 (journal write path); TD-002 re-resolved (see §3 above). Resolved in Milestone 3: TD-004 (pipeline write path). Reopened in Milestone 3, still open through Milestone 5: TD-002 (dead trees, third recurrence — see §3 above). Resolved in Milestone 4: TD-017 (journal reviews write path). Partially resolved in Milestone 4: TD-020 (network/tooling-access half; live-DB half tracked separately as TD-021). Newly logged: TD-015, TD-016 (Milestone 1, still open, TD-016 scope grew in Milestone 2); TD-017 (Milestone 2, resolved Milestone 4), TD-018 (Milestone 2); TD-019, TD-020 (Milestone 3); TD-021, TD-022 (Milestone 4); TD-023, TD-024, TD-025, TD-026 (Milestone 5).

---

## 6. Current roadmap status

Two independent, parallel roadmaps — read both, they interleave:

- **`PRODUCT_ROADMAP.md`** (feature-oriented): Phase 1 (journal + pipeline write paths — **both done**, journal in Milestone 2, pipeline in Milestone 3; journal *reviews* closed the loop in Milestone 4) → Phase 2 (universe expansion — **done in Milestone 5**, 8 → ~100 companies; full NSE scale-out remains a future step within this phase or its own follow-on) → Phase 3 (Scoring Engine v2 — not started) → Phase 4 (Research Workspace polish) → Phase 5 (news pipeline validation).
- **`ENGINEERING_ROADMAP.md`** (engineering-oriented): Phase E1 (dead-code + doc cleanup — **done in Milestone 1**, except its test-suite item and the naming/formatting items, which remain open; note the dead-tree cleanup has since needed re-doing twice, see TD-002) → E2 (backend write layer — **done**: journal entries in Milestone 2, pipeline in Milestone 3, journal reviews in Milestone 4 — every writable table now has an API) → E3 (deployment simplification) → E4 (data layer hardening) → E5 (scale validation — **partially addressed by Milestone 5**'s universe expansion, though the cron load-test and alerting gaps E5 called out are still open) → E6 (news pipeline validation).

No phase beyond Milestone 1 / Phase E1, Phase 1 / Phase E2 (fully complete), and Phase 2 (now done as of Milestone 5) has been started.

---

## 7. Recommended next milestones (no default chosen — this is the founder's call)

1. **Investigate TD-002's root cause** — not a feature milestone, but the dead frontend trees have now survived two clean deletions and a third-and-fourth left-in-place decision (Milestones 3, 4, and 5). Worth resolving how each session's project is packaged/delivered before it recurs again. Milestone 4 surfaced a concrete hypothesis worth checking first: whether the zip each session receives is a fresh export of the post-milestone repo, or a stale snapshot.
2. **Service-layer + pure-function test suite** — `TECHNICAL_DEBT.md` TD-005 (now also covering TD-018, TD-019, and journal reviews' `journal_review_service.py`). Cheapest, highest-trust-value coverage available for the pure-function parts (`scoring_service.py`, `compute_scores.py`, `analysis/rules/*`); the three service layers with DB side effects (`journal_service.py`, `pipeline_service.py`, `journal_review_service.py`) would need a separate mocking/test-DB strategy.
3. **Finish the naming/formatting cleanup** — close TD-015 and TD-016 as a small, dedicated, low-risk milestone before more code lands on top of them.
4. **Close out the Milestone 5 verification gaps** — TD-023 (spot-check all 100 `yahoo_ticker`s against a real `fetch_prices` run) and TD-024 (run `reset_market_data.py --dry-run`, then for real, against the live database). Cheap, and should happen before the daily cron is relied on at the new scale.
5. **Scoring Engine v2** — `PRODUCT_ROADMAP.md` Phase 3, now unblocked now that the universe is ~100 companies rather than 8 (Milestone 5).
6. **Close out TD-021/TD-022** — one live-DB smoke test for journal reviews, plus (pending a TD-002-style decision) deleting the two orphaned mock-data files found by Milestone 4's real `tsc` run. Small enough to fold into whichever of the above is picked next.
7. **Full NSE universe scale-out** (~1500–2000 companies) — the natural next step after Milestone 5, once its own verification gaps (TD-023/TD-024) are closed and the cron's runtime at ~100 companies has been observed for real. Per `DECISIONS.md` ADR-015, this should only require replacing/extending `data/universe_top100.csv` (or the file it loads), not further code changes to the ingest scripts — but `services/screener_service.py`'s Python-side filtering (fine at 100) would need revisiting at this scale, per that module's own code comment.

---

## 8. Important engineering principles

These are load-bearing, not stylistic preferences. Full detail and rationale in `ENGINEERING_GUIDE.md` and `DECISIONS.md`.

1. **The code is the source of truth.** Documentation describes the code as it exists; where they disagree, the code wins and the documentation gets corrected — not the other way around.
2. **"React never screens, ranks, filters, or calculates. FastAPI does."** Any filtering/ranking/scoring logic in a new frontend feature belongs in a backend service function.
3. **Routes stay thin; services hold all business logic and SQL.** Every built backend module follows this; don't break the pattern for a new one.
4. **Never mark a module "✅ Built" without verifying an actual request/response path exists** — not just that a plausibly-named function exists. This exact mistake produced the (now-resolved) documentation drift described in `CURRENT_STATE.md` §0.
5. **Anything labeled "AI" must actually call a model, or be renamed.** This has already gone wrong once (`ADR-006`) — don't repeat it.
6. **Don't add a database table without a concrete, near-term plan to build the API that uses it.** `pipeline_items` and `journal_reviews` were the standing cautionary examples — `journal_entries` closed this gap in Milestone 2, `pipeline_items` closed it in Milestone 3, and `journal_reviews` closed it in Milestone 4. Every first-party writable table now has a real API. Don't let a new table reopen this pattern.
7. **Transparency over sophistication, quality over quantity.** Applies to scoring, to UI, and to any future AI feature — per `PRODUCT_REQUIREMENTS.md` §9.

---

## 9. Development workflow

This project is developed through **milestone-based development**. Each chat/session should implement exactly one milestone — never multiple, never a partial slice of a future one alongside the current one.

**Standard cycle for every milestone:**

```
Read HANDOFF.md
        ↓
Read CURRENT_MILESTONE.md
        ↓
Verify documentation matches code (don't assume either is correct — check)
        ↓
Implement exactly one milestone, incrementally, preferring refactoring over rewriting
        ↓
Update all affected documentation
        ↓
Update CURRENT_MILESTONE.md, CHANGELOG.md
        ↓
Stop and report — wait for approval before starting the next milestone
```

If a significant issue is discovered outside the current milestone's approved scope, stop and report it — don't fix it opportunistically. If documentation and implementation disagree, identify the discrepancy explicitly rather than assuming one side is correct.

---

## 10. Documentation update policy

- **Every milestone must update, at minimum:** `CURRENT_MILESTONE.md` (mark complete, list what changed), `CHANGELOG.md` (new entry), and `TECHNICAL_DEBT.md` (close resolved items, log any newly discovered ones).
- **Update `CURRENT_STATE.md`** whenever a module's built/mock/stub status materially changes.
- **Update `ARCHITECTURE.md`** whenever the actual system design changes (new service, new data flow, new deployment target) — not for every code change, only structural ones.
- **`DECISIONS.md` is append-only.** Never edit a past ADR's content. If a decision is reversed or a past conflict is resolved, add a new ADR that references and supersedes the old one (see ADR-012 for the pattern).
- **`CHANGELOG.md` and `MODULE_*_REPORT.md` files are historical logs, not current-state descriptions.** Never rewrite past entries to reflect a later state — add a new entry instead.
- **A module is not "done" until its documented status says so, in the same change that built it.** This is the single rule most responsible for past documentation drift in this project (`CURRENT_STATE.md` §0) — don't let code and docs diverge again.

---

## 11. Definition of Done for every future milestone

A milestone is not complete until **all** of the following are true:

1. The approved scope is fully implemented — nothing more, nothing less.
2. Every claim in `CURRENT_STATE.md` affected by the change has been re-verified against the actual code, not assumed.
3. The project builds and typechecks cleanly (`npm run build`, `npx tsc --noEmit` for frontend; a Python syntax/import check at minimum for backend, plus its own tests once TD-005 lands).
4. All existing functionality still works — verified, not assumed. State explicitly what was checked and how.
5. `CURRENT_MILESTONE.md` is updated to reflect completion, including a "found but not fixed" section for anything discovered outside scope.
6. `CHANGELOG.md` has a new entry listing every file added, modified, or deleted.
7. `TECHNICAL_DEBT.md` reflects reality — resolved items marked resolved with a date, new debt logged.
8. Any document whose claims were invalidated by this milestone's changes has been updated — checked explicitly against the cross-reference list in §2 of this document's context (`CURRENT_STATE.md`, `ARCHITECTURE.md`, `PRODUCT_ROADMAP.md`, `ENGINEERING_ROADMAP.md`, `README.md`).
9. A completion report is provided: summary of changes, every file touched, issues encountered, verification performed, remaining related debt, and candidate next milestones (without unilaterally picking one).
10. Work stops and waits for explicit approval before any further milestone begins.

---

## 12. Instructions for a new AI assistant joining this project

If you are an AI assistant starting a new session on this project with no memory of prior conversations:

1. **Read this document fully before doing anything else.**
2. **Read `CURRENT_MILESTONE.md` next** to see what's currently in flight or was last completed.
3. **Read `CURRENT_STATE.md`** to get the verified, current picture of what's actually built — don't trust any other document's claim about what exists without checking `CURRENT_STATE.md` first, and don't trust even that without spot-checking the actual code if a decision depends on it.
4. **Do not assume any prior conversation's context is available to you.** This document, and the rest of `/md`, are the only memory this project has. If something important isn't written down here, treat that as a documentation gap to flag, not as something you can infer from "how these things usually go."
5. **Do not start implementing a feature milestone unprompted.** Confirm scope with the founder first, the same way Milestone 1 was scoped and approved before any code was touched.
6. **Verify, don't assume.** Before claiming something is dead code, unused, broken, or working, check it directly — grep, run the build, read the actual file. This project was built specifically to correct a prior state where documentation asserted things about the code that weren't true.
7. **When you finish a milestone, follow the Definition of Done in §11 exactly** — this is what keeps the next session (whether it's you again, or a different assistant, or a human) able to pick this project up cold.

---

## 13. Start-of-milestone / end-of-milestone checklist

**At the start of every milestone:**

☐ Read `HANDOFF.md` (this document)
☐ Read `CURRENT_MILESTONE.md` for what was last completed and what's proposed next
☐ Read `CURRENT_STATE.md` for the verified current picture
☐ Confirm the proposed milestone's scope explicitly with the founder before writing any code
☐ Re-verify, directly against the code, any claim the plan depends on — don't inherit an old audit's conclusion without spot-checking it still holds
☐ Identify and list what is explicitly out of scope, and why
☐ Get explicit approval before implementation begins

**At the end of every milestone:**

☐ Confirm the approved scope was fully implemented — nothing more, nothing less
☐ Run build/typecheck (and tests, once they exist) and record the results
☐ Manually re-verify that existing functionality still works
☐ Update `CURRENT_STATE.md` if any module's status changed
☐ Update `ARCHITECTURE.md` if the system design changed
☐ Update `TECHNICAL_DEBT.md` — resolve closed items with a date, log any newly discovered debt
☐ Add a new `CHANGELOG.md` entry — never edit past entries
☐ Update `CURRENT_MILESTONE.md` to Complete, including a "found but not fixed" section
☐ Cross-check `PRODUCT_ROADMAP.md`, `ENGINEERING_ROADMAP.md`, and `README.md` for anything the milestone made stale
☐ Provide a full completion report (changes, files touched, issues found, verification performed, remaining debt, candidate next milestones)
☐ Stop and wait for approval before starting anything further
