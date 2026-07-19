# Handoff

**Read this document first, before anything else — including `CURRENT_MILESTONE.md`.** It exists so that any future session (a new AI assistant, a new developer, or you after months away) can pick this project up cold, with no memory of past conversations, and know exactly what to do.

---

## 1. Project overview

Stock Finder is a personal investment research tool, not a commercial product. It answers one question every day: **"What are the best companies I should research today?"** It combines fundamentals and technicals into a small, explainable shortlist, and gives its one real user — the founder — a place to write down and later review their own investment reasoning.

It is deliberately not a screener, not a portfolio tracker, and not a Bloomberg/TradingView/Screener.in competitor. Its differentiator is transparency: every score decomposes into named factors with real numbers behind them, and no AI-generated opinion is ever allowed to stand in for that deterministic reasoning. The full statement of vision, users, and explicit non-features lives in `PRODUCT_REQUIREMENTS.md` — treat that document, not this one, as the authority on *what the product is for*. This document is the authority on *how to work on it*.

The codebase is a FastAPI backend (Postgres, thin routes / fat services) and a React + TanStack Start frontend (SSR, deployed to Cloudflare Workers), covering 8 built modules (companies, discover, research detail, screener, charts, analysis, weekly news, journal) plus 1 schema-only module (pipeline) that exists in the database but has no backend write API yet. The project is developed through discrete, documented milestones, each of which is expected to leave the repository in a clean, fully-documented, buildable state — see §9 for exactly what that means in practice.

---

## 2. Current repository status

- **6 frontend routes**, all building and typechecking cleanly: `/`, `/research`, `/research/$symbol`, `/screener`, `/journal`, `/ideas`.
- **9 backend GET routes + 4 write routes**: `POST /weekly-market-intelligence/refresh` (pre-existing), plus `POST /journal-entries`, `PUT /journal-entries/{id}`, `DELETE /journal-entries/{id}` (new in Milestone 2). Journal entries now fully persist. Pipeline (`pipeline_items`) is still read-only — there is no way to move a pipeline item through the running application today; see `TECHNICAL_DEBT.md` TD-004.
- **One frontend directory structure** (`src/features/*` + `src/shared/*`) — the previous duplicate legacy trees (`src/components/`, `src/hooks/`, `src/lib/api/`) were deleted in Milestone 1, found still present at the start of Milestone 2 (see §3 below), and deleted again then. If you find them present *again* in a future session, that's a real signal something about the delivery/handoff process needs fixing — flag it loudly rather than assuming it's fine to just delete once more.
- **Zero automated tests**, backend or frontend.
- **Universe = 8 hardcoded companies** (`backend/backend/ingest/universe.py`) — every "discovery" feature is currently a re-sort of the same 8 names, not a search across a real market.
- Three legacy planning documents (`CLAUDE.MD`, `Product_Vision.md`, `API_CONTRACT.md`) that once existed and once contradicted each other and the code have been intentionally removed from the repository (confirmed by the founder in Milestone 1). They no longer exist and should not be looked for.

For the full, verified, module-by-module inventory — what's real, what's mock, what's stale — read `CURRENT_STATE.md`. It is the single most important document in this repository after this one.

---

## 3. Last completed milestone

**Milestone 2 — Journal Backend.** Feature milestone: replaced the mock-only journal with a real, persistent, full-CRUD backend (`routes/journal.py` + `services/journal_service.py` + `schemas/journal.py`) and a working frontend create/edit/delete UI. `journal_reviews` deliberately left unbuilt (new: `TECHNICAL_DEBT.md` TD-017). Full detail in `CURRENT_MILESTONE.md` and the Milestone 2 entry in `CHANGELOG.md`.

**Important finding from this milestone:** at the start of Milestone 2, the dead frontend trees that Milestone 1 claimed to have deleted (`src/components/`, `src/hooks/`, `src/lib/api/`, plus two orphaned `src/lib/` files) were found still physically present in the delivered repository. They were re-verified dead (zero live imports, same method as Milestone 1) and deleted again, at the founder's explicit approval, as an addition to Milestone 2's scope. This was most likely a stale/pre-cleanup copy of the repo being delivered rather than a real regression of Milestone 1's work — but if you find these trees present *again* in a future session, treat that as a process problem worth surfacing, not something to silently fix a third time.

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

Full diagrams, the database ER model, and the deployment picture are in `ARCHITECTURE.md`. Two things worth knowing before writing any new code: (1) the "React never screens, ranks, filters, or calculates — FastAPI does" rule is load-bearing, not a suggestion (`ENGINEERING_GUIDE.md` §7); (2) `journal_entries` now has a real write layer (Milestone 2), built as the template for the next one — `pipeline_items` still doesn't, and closing that gap the same way is the single highest-leverage architectural gap remaining.

---

## 5. Current technical debt summary

Full register with severity, cause, impact, and effort estimates is in `TECHNICAL_DEBT.md`. Highest-priority open items, in order:

1. **TD-001** (🔴) — Fundamentals data is a frozen one-time CSV snapshot with no staleness indicator anywhere in the UI.
2. **TD-004** (🟠) — Pipeline is read-only; no way to add/move/remove an item via the app. Same shape of gap the journal (TD-003) just had — now the top priority of this kind.
3. **TD-005** (🟠) — Zero automated tests anywhere, across 8 built modules (now also covers the untested journal write path, TD-018).
4. **TD-008/TD-009** (🟠/🟡) — News pipeline has never run against a live feed and isn't in the scheduled cron.
5. **TD-017** (🟡) — `journal_reviews` has a schema but no API or UI; the journal's review/retrospective half is unbuilt.

Resolved in Milestone 1: TD-002 (duplicate frontend trees), TD-012, TD-013 (legacy-document reconciliation). Resolved in Milestone 2: TD-003 (journal write path); TD-002 re-resolved (see §3 above). Newly logged: TD-015, TD-016 (Milestone 1, still open, TD-016 scope grew in Milestone 2); TD-017, TD-018 (Milestone 2).

---

## 6. Current roadmap status

Two independent, parallel roadmaps — read both, they interleave:

- **`PRODUCT_ROADMAP.md`** (feature-oriented): Phase 1 (journal + pipeline write paths — **journal done in Milestone 2**; pipeline not started) → Phase 2 (universe expansion — not started) → Phase 3 (Scoring Engine v2 — not started) → Phase 4 (Research Workspace polish) → Phase 5 (news pipeline validation).
- **`ENGINEERING_ROADMAP.md`** (engineering-oriented): Phase E1 (dead-code + doc cleanup — **done in Milestone 1**, except its test-suite item and the naming/formatting items, which remain open) → E2 (backend write layer — **journal half done in Milestone 2**; pipeline half remains) → E3 (deployment simplification) → E4 (data layer hardening) → E5 (scale validation) → E6 (news pipeline validation).

No phase beyond Milestone 1 / Phase E1 and Milestone 2's partial progress on Phase 1 / Phase E2 has been started.

---

## 7. Recommended next milestones (no default chosen — this is the founder's call)

1. **Pipeline write layer** — `PRODUCT_ROADMAP.md` Phase 1 remainder / `ENGINEERING_ROADMAP.md` Phase E2 remainder, `TECHNICAL_DEBT.md` TD-004. Highest product impact now that journal is done — makes the app's other personal, differentiating feature actually usable, using the same routes/service/schema pattern Milestone 2 established.
2. **Journal reviews** — `TECHNICAL_DEBT.md` TD-017. Natural follow-on: lets the founder close the loop when a `reviewDueAt` date arrives.
3. **Finish the naming/formatting cleanup** — close TD-015 and TD-016 as a small, dedicated, low-risk milestone before more code lands on top of them.
4. **Pure-function test suite** — `TECHNICAL_DEBT.md` TD-005 (now also covering TD-018). Cheapest, highest-trust-value coverage available (`scoring_service.py`, `compute_scores.py`, `analysis/rules/*` — all pure functions, no DB/network mocking needed; `journal_service.py`'s DB-touching functions would need a separate strategy).
5. **Universe expansion** — `PRODUCT_ROADMAP.md` Phase 2. Makes "Discover" mean something beyond reshuffling 8 fixed companies; a prerequisite for Scoring Engine v2.

---

## 8. Important engineering principles

These are load-bearing, not stylistic preferences. Full detail and rationale in `ENGINEERING_GUIDE.md` and `DECISIONS.md`.

1. **The code is the source of truth.** Documentation describes the code as it exists; where they disagree, the code wins and the documentation gets corrected — not the other way around.
2. **"React never screens, ranks, filters, or calculates. FastAPI does."** Any filtering/ranking/scoring logic in a new frontend feature belongs in a backend service function.
3. **Routes stay thin; services hold all business logic and SQL.** Every built backend module follows this; don't break the pattern for a new one.
4. **Never mark a module "✅ Built" without verifying an actual request/response path exists** — not just that a plausibly-named function exists. This exact mistake produced the (now-resolved) documentation drift described in `CURRENT_STATE.md` §0.
5. **Anything labeled "AI" must actually call a model, or be renamed.** This has already gone wrong once (`ADR-006`) — don't repeat it.
6. **Don't add a database table without a concrete, near-term plan to build the API that uses it.** `pipeline_items` and `journal_reviews` are the standing cautionary examples (`journal_entries` closed this gap in Milestone 2 — don't let it reopen for a new table).
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
