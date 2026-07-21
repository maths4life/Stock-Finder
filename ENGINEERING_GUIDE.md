# Engineering Guide

**Purpose:** coding standards, folder structure rules, naming conventions, and process — written to prevent the specific kinds of debt already catalogued in `TECHNICAL_DEBT.md` from recurring.

**Audience:** anyone writing code in this repo, including an AI coding assistant.

---

## 1. Folder structure — the rule, going forward

**Backend:**
```
routes/<module>.py      -- parse request, call ONE service function, return. No SQL, no business logic here.
services/<module>.py    -- business logic + SQL for that module.
schemas/<module>.py     -- Pydantic response models.
ingest/<script>.py      -- standalone, run by cron, never imported by the live API process.
```
This is already the pattern in every built module (`company_service.py`'s own docstring states it explicitly) — keep following it exactly for new modules, including the journal/pipeline write paths.

**Frontend:** the only correct structure is `src/features/<domain>/{api,hooks,components}` plus `src/shared/{api,components,hooks}` for cross-cutting concerns. `src/lib/` is reserved for root-level app infrastructure only (error reporting, SSR entry helpers) — not for API clients, hooks, or components; those belong under `features/` or `shared/`. The old parallel trees (`src/components/`, `src/hooks/`, `src/lib/api/`) were confirmed dead and deleted in Milestone 1 (`TECHNICAL_DEBT.md` TD-002, resolved) — do not recreate them. If you're not sure where a new file goes, it belongs under `features/<domain>/` unless at least two domains need it, in which case it belongs under `shared/`.

## 2. When to add a database table

Add a table only when:
1. The data is genuinely first-party (user-authored) or genuinely derived from other stored data, **and**
2. There is a concrete plan — ideally in the same pull request — to build the API that reads/writes it.

`pipeline_items` and `journal_reviews` were the cautionary examples: both added to the schema well ahead of any API, sitting unusable for a while as a result (`TECHNICAL_DEBT.md` TD-004, TD-017 — both resolved as of Milestone 3 and Milestone 4 respectively). `journal_entries` was in the same position until Milestone 2 closed the gap. Every first-party writable table now has a real API — proof the pattern is fixable, not a reason to let it recur. Don't repeat it. If you're adding a table "for later," write the plan into `PRODUCT_ROADMAP.md` or `IDEAS.md` instead of committing schema for a feature with no near-term implementation plan.

## 3. When *not* to add a database table

- If the value can be computed from existing tables on read (see `technical_snapshot`/`scores` pattern, ADR-004) — derive it, don't store it, unless the computation is genuinely expensive to redo per-request.
- If it's market data that isn't yet needed by a shipped feature — per `PRODUCT_REQUIREMENTS.md` §9, the database should not become a mirror of a market data provider "just in case."

## 4. Naming conventions

- Anything labeled "AI" in the UI or docs must actually invoke a model. If it's a deterministic rule/template (which is the correct choice per ADR-005 for scoring-adjacent features), name it for what it does — "Analysis," "Research Summary," "Score Breakdown" — not "AI Insights." This is not pedantry: mislabeling erodes the trust the transparency principle is supposed to build, and it already happened once (`ADR-006`).
- Database columns and API fields: `snake_case` in Postgres, `camelCase` in API responses/frontend types — already consistently followed across every built module (see `schemas/company.py`'s `Company` response model for the canonical example). Keep it.
- Service functions should be named for the question they answer, not the table they touch (`risk_level()`, `expected_return_and_horizon()`, not `get_debt_to_equity_and_roe()`) — matches the existing style in `scoring_service.py`.

## 5. Feature development process

1. Check `PRODUCT_REQUIREMENTS.md` — does this feature serve a stated goal, or is it scope creep? If it's not clearly justified, it goes in `IDEAS.md`, not into a branch.
2. Check `CURRENT_STATE.md` — is this already partially built, mocked, or stubbed somewhere? Don't rebuild what exists; don't assume something is done because a UI component exists (journal is the standing lesson here).
3. Design the backend route/service pair and the data model change (if any) together — don't ship a frontend against mock data with the backend "to follow later" (this is exactly how the journal gap happened).
4. Write the test for the new logic alongside it, especially for anything in `services/` or `analysis/` that's a pure function — these are the cheapest and highest-value tests in this codebase.
5. Update `CURRENT_STATE.md`'s status table in the same change. A module is not "done" until its documented status says so.
6. If the change affects a documented decision, add an ADR to `DECISIONS.md` rather than silently diverging from a prior one.

## 6. How to avoid the technical debt already catalogued

- Don't build a second version of something that already exists in a different folder — check `shared/` and `features/*` before adding a new hook/component/API function (this is exactly what produced TD-002).
- Don't mark a module "✅ Built" in any document without verifying, by reading the actual route/service files, that a full request/response path exists — not just that a service function with the right name is present (this is exactly what produced the now-resolved documentation drift recorded in `CURRENT_STATE.md` §0).
- Don't add infrastructure complexity (new deployment target, new external service, new pipeline) ahead of validating the simpler version works — Module 7's unvalidated-live-feed status (TD-008) is the standing example of what this looks like when it happens.

## 7. Golden rule for the frontend

*"React never screens, ranks, filters, or calculates. FastAPI does."* New frontend code should fetch, display, and handle loading/error/pagination-of-already-filtered-data states. If a new frontend feature needs to filter, rank, or score something, that logic belongs in a backend service function, not a `.tsx` file.
