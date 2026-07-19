# Stock Finder — Documentation Index

This `/docs` folder is the single source of truth for the Stock Finder project. It was written by auditing the actual codebase (`backend/`, `frontend/`, `db/schema.sql`), not by trusting prior planning documents — several of which, as documented in `CURRENT_STATE.md`, actively disagreed with each other and with the code, and have since been intentionally removed from the repository (`CLAUDE.MD`, `Product_Vision.md`, `API_CONTRACT.md`; see `CURRENT_STATE.md` §0 and `TECHNICAL_DEBT.md` TD-012/TD-013).

**If you (the founder) disappear for six months, a new developer joins, or a new AI assistant session starts with no memory of prior conversations: start with `HANDOFF.md`. It exists specifically for this.**

---

## Reading order for a new contributor or a new AI assistant session

1. **`HANDOFF.md`** — start here, always. Project overview, current status, engineering principles, development workflow, and exactly what to do at the start and end of every milestone. Written so this project can be picked up cold, with no conversation history.
2. **`CURRENT_MILESTONE.md`** — what was last completed, what's proposed next, and what's explicitly out of scope right now.
3. **`CURRENT_STATE.md`** — what's actually built, what's real, what's mock, what's stale. Read this before believing any other document's description of "what's built."
4. **`ARCHITECTURE.md`** — how the system is put together and why.
5. **`PRODUCT_REQUIREMENTS.md`** — what this is and isn't, for whom, and why.
6. **Remaining documentation**, in whatever order suits the task at hand:
   - `SCORING_ENGINE.md` — the core logic of the product, in depth.
   - `DATA_STRATEGY.md` — where data comes from, what's cached, what's stale.
   - `UI_UX.md` — navigation and design philosophy.
   - `TECHNICAL_DEBT.md` — what to fix and in what order.
   - `PRODUCT_ROADMAP.md` / `ENGINEERING_ROADMAP.md` — where this goes next.
   - `DECISIONS.md` — why past choices were made, so they aren't re-litigated.
   - `ENGINEERING_GUIDE.md` — how to add code without adding debt.
   - `IDEAS.md` — things that are interesting but not planned. Do not build from this list without promoting an idea into the roadmap first.
   - `CHANGELOG.md`, `MODULE_*_REPORT.md` — historical logs of completed work; read for context, never edit to reflect a later state.

---

## Document registry

| Document | Purpose | Primary audience | Update cadence | References |
|---|---|---|---|---|
| `HANDOFF.md` | The starting point for every new session: project overview, current status, engineering principles, workflow, and the start/end-of-milestone checklist. Written so the project can be picked up with no prior conversation history. | Everyone, especially a new AI assistant or developer joining cold | Whenever a milestone completes and the roadmap/debt/architecture summaries it contains go stale | Summarizes and links every other document; kept in sync with them, not a replacement for reading them |
| `CURRENT_MILESTONE.md` | What was last completed, what's currently in flight, what's explicitly out of scope, and candidate next milestones. | Everyone, at the start of every session | At the start (scope agreed) and end (marked complete) of every milestone | `TECHNICAL_DEBT.md`, `CHANGELOG.md` |
| `PRODUCT_REQUIREMENTS.md` | The definitive statement of vision, users, features, non-features, success metrics. The document all other product decisions are checked against. | Founder, any future collaborator, future-you | Whenever the vision genuinely changes — rare, deliberate, versioned | `PRODUCT_ROADMAP.md`, `DECISIONS.md` |
| `CURRENT_STATE.md` | Honest snapshot of what exists in the code today: built/partial/stub/mock, production-quality vs prototype-quality, and where implementation has drifted from `PRODUCT_REQUIREMENTS.md`. | Everyone, first read | Every time a module's status materially changes (roughly, every few weeks of active work) | `ARCHITECTURE.md`, `TECHNICAL_DEBT.md` |
| `ARCHITECTURE.md` | System design: backend, frontend, database, data flow, deployment, with diagrams. | Engineers | When architecture actually changes (new service, new data flow, new deployment target) | `DATA_STRATEGY.md`, `SCORING_ENGINE.md`, `DECISIONS.md` |
| `SCORING_ENGINE.md` | Full specification of the scoring logic: current implementation, factor definitions, weighting, known problems, target v2 design, calibration approach. | Founder, any engineer touching `scoring_service.py` / `analysis/` / `ingest/compute_scores.py` | Whenever a scoring factor, weight, or threshold changes | `ARCHITECTURE.md`, `DATA_STRATEGY.md` |
| `DATA_STRATEGY.md` | What data comes from where (Yahoo, NSE, RSS, Kaggle seed, first-party DB), what's cached, what's never stored, refresh cadence. | Engineers, especially anyone touching `ingest/` | When a data source is added, removed, or its refresh cadence changes | `ARCHITECTURE.md`, `SCORING_ENGINE.md` |
| `UI_UX.md` | Navigation model, design principles, the intended investor workflow, page-by-page philosophy. | Founder, frontend contributors, designers | When a page's purpose or the navigation model changes | `PRODUCT_REQUIREMENTS.md` |
| `TECHNICAL_DEBT.md` | Brutally honest register of every known debt item: severity, cause, impact, fix, effort. | Engineers, especially before starting new feature work | Add an entry the moment debt is knowingly introduced; close entries as fixed | `CURRENT_STATE.md`, `ENGINEERING_ROADMAP.md` |
| `PRODUCT_ROADMAP.md` | Feature-oriented phases: what gets built, in what order, and why that order. | Founder, future collaborators | At the start of each phase, or when priorities shift | `PRODUCT_REQUIREMENTS.md`, `ENGINEERING_ROADMAP.md` |
| `ENGINEERING_ROADMAP.md` | Engineering-oriented phases: refactors, tests, debt paydown, infra simplification — independent of feature work. | Engineers | Alongside `PRODUCT_ROADMAP.md`; the two should be read together, not separately | `TECHNICAL_DEBT.md`, `PRODUCT_ROADMAP.md` |
| `DECISIONS.md` | Architecture Decision Records — why PostgreSQL, why FastAPI, why explainable scoring over AI, why journal-first, why the universe stayed at 8, etc. Append-only. | Everyone, especially before proposing to "just redo" something | Append a new ADR whenever a decision worth remembering is made; never edit old ones except to mark them superseded | All other documents cite this when a "why" question comes up |
| `ENGINEERING_GUIDE.md` | Coding standards, folder structure rules, naming conventions, when to add a DB table, how to avoid the debt already catalogued in `TECHNICAL_DEBT.md`. | Anyone writing code in this repo | When a standard changes or a repeated mistake needs a documented rule | `TECHNICAL_DEBT.md`, `ARCHITECTURE.md` |
| `IDEAS.md` | Parking lot for ideas that are explicitly *not* planned. Kept separate from the roadmap on purpose. | Founder | Whenever an idea occurs and shouldn't be forgotten, but also shouldn't imply commitment | `PRODUCT_ROADMAP.md` (promote from here, don't build from here directly) |

---

## The one rule that matters more than any document here

**The code is the source of truth. These documents describe the code as of the audit date below; they are not aspirational descriptions of what the code should do.** Where a document describes a target state that doesn't exist yet, it says so explicitly (usually in `PRODUCT_ROADMAP.md` or `SCORING_ENGINE.md`'s "target" sections). Anywhere a document appears to disagree with the running code, the code wins, and the document should be corrected — the way `API_CONTRACT.md` and `CLAUDE.MD` (both since removed from the repository) were found to disagree with each other and with the schema during the original audit (see `CURRENT_STATE.md` §0 and `DECISIONS.md` ADR-009).

**Documentation currency:** this suite was originally written by a full audit of the codebase as uploaded, then kept current through Milestone 1's cleanup pass. It does not carry a single static "audit date" — instead, `CURRENT_MILESTONE.md` always states what was last completed and verified, and `CHANGELOG.md` has a dated entry for every milestone. If you need to know how current a specific claim is, check those two documents first.
