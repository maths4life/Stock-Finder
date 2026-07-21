# Decision Log (Architecture Decision Records)

**Purpose:** record why significant decisions were made, so they don't get re-litigated from scratch every time someone (including future-you) questions them. Append-only — never edit a past ADR's content; if a decision is reversed, add a new ADR that supersedes it and link back.

**Audience:** everyone, especially before proposing to "just redo" something that was already deliberately decided.

**Format:** each entry has Status, Context, Decision, Consequences.

---

### ADR-001: PostgreSQL as the only datastore

**Status:** Accepted

**Context:** need a place to store companies, prices, fundamentals, technicals, scores, and first-party data (journal, pipeline), at a scale of tens to low hundreds of symbols and a single user.

**Decision:** plain Postgres (Supabase/Neon free tier compatible per `db/schema.sql`'s own header comment), no paid extensions, no separate time-series or document store.

**Consequences:** simple to run and reason about; no polyglot persistence overhead. Revisit only if the universe grows into the thousands of symbols with high-frequency data needs — not expected under this product's scope (`PRODUCT_REQUIREMENTS.md` explicitly excludes intraday/high-frequency use cases).

---

### ADR-002: FastAPI backend, thin routes / fat services

**Status:** Accepted

**Context:** need a Python backend that can share code with the Python-based ingest scripts (`yfinance`, `pandas`, `numpy`), and a clear layering discipline given the project would be built incrementally, module by module, over time.

**Decision:** FastAPI, with routes doing only request parsing and a single service-function call, and all business logic/SQL in `services/*.py`. Confirmed consistently followed across all built modules.

**Consequences:** genuinely easy to extend module-by-module without route files becoming tangled. Preserve this discipline for the journal/pipeline write paths when they're built (`TECHNICAL_DEBT.md` TD-003/TD-004).

---

### ADR-003: React + TanStack Router/Query frontend

**Status:** Accepted

**Context:** need a component-rich, type-safe frontend that can support a dense, information-heavy UI (per `UI_UX.md`'s design principles) without hand-rolling routing/data-fetching primitives.

**Decision:** React 19, TanStack Router (file-based routing) + TanStack Query, shadcn/ui component primitives, Tailwind.

**Consequences:** strong ecosystem fit for the intended design language. The SSR/edge deployment choice that came bundled with TanStack Start is tracked separately — see ADR-010.

---

### ADR-004: Separate raw data from derived data in the schema

**Status:** Accepted

**Context:** technical indicators and scores are computed values that may need their computation logic revised over time; re-fetching source data to change a formula would be wasteful and slow.

**Decision:** `prices_daily` (raw) → `technical_snapshot` (derived, recomputed on each refresh) → `scores` (derived from both raw-adjacent fundamentals and derived technicals). Same pattern for `financials_quarterly` (raw) feeding `scores`.

**Consequences:** indicator/scoring logic can be changed and recomputed without touching ingestion. This is one of the strongest architectural decisions in the codebase — preserve it explicitly when designing v2 scoring (`SCORING_ENGINE.md` §4).

---

### ADR-005: Explainable rule-based scoring instead of an AI/ML model

**Status:** Accepted

**Context:** `PRODUCT_REQUIREMENTS.md` requires every score to be fully explainable; a trained model or LLM-based score would be opaque by comparison, however accurate.

**Decision:** all scoring (`scoring_service.py`, `compute_scores.py`, `analysis/rules/*`) is deterministic, threshold- and delta-based, built entirely from stored numeric fields — no model inference, no LLM call, anywhere in the scoring path.

**Consequences:** genuinely honors the transparency principle. Trade-off: the score is only as sophisticated as its hand-written rules (see `SCORING_ENGINE.md` §3 for the resulting v1 limitations). This trade-off is accepted deliberately, not a shortfall to "fix" by switching to ML — any future AI feature must be additive/explanatory, never a replacement for this deterministic core (`PRODUCT_REQUIREMENTS.md` §7).

---

### ADR-006: "AI Insights" is a legacy label for a non-AI feature

**Status:** Accepted, naming should still be fixed

**Context:** `API_CONTRACT.md` and `CLAUDE.MD` both refer to Module 6/9 as "AI Insights." The actual implementation (`analysis/engine.py`) explicitly calls no LLM or model — it's deterministic template-filled prose, by design, consistent with ADR-005.

**Decision:** keep the deterministic implementation (it's correct per ADR-005); the *name* "AI Insights" should be corrected across docs and UI copy to something accurate (e.g., "Research Summary" or "Analysis") so it doesn't imply model-generated content that isn't there.

**Consequences:** tracked as a documentation/copy fix, not an engineering change — see `TECHNICAL_DEBT.md` and `ENGINEERING_ROADMAP.md`.

---

### ADR-007: Journal-first, not portfolio-first

**Status:** Accepted

**Context:** the product's differentiator, per `PRODUCT_REQUIREMENTS.md`, is closing the loop on the founder's own reasoning over time — not tracking live positions/P&L.

**Decision:** build `journal_entries`/`journal_reviews` as first-party, central tables, and explicitly exclude portfolio/position tracking from scope (`PRODUCT_REQUIREMENTS.md` §7).

**Consequences:** the schema reflects this correctly. The implementation does not yet (no write API — `TECHNICAL_DEBT.md` TD-003) — this is an execution gap against an otherwise correct decision, not a reason to reconsider the decision itself.

---

### ADR-008: Sector-first news over per-company article feeds

**Status:** Accepted, implementation unvalidated

**Context:** per-company news feeds turn into noise; the actual want is "what companies deserve research because of this event," i.e., sector/event-driven, not article-volume-driven.

**Decision:** build sector classification and weekly sector-level summaries (Module 7) instead of a per-company news list.

**Consequences:** architecturally the right shape. Execution status: built but never run against live data (`TECHNICAL_DEBT.md` TD-008) — the decision is sound, its implementation isn't yet proven.

---

### ADR-009: Where the product vision documents disagree, `Product_Vision.md`'s framing wins over `CLAUDE.MD`'s

**Status:** Accepted (this audit)

**Context:** `CLAUDE.MD` describes an "institutional-grade... Bloomberg Terminal"-scale platform; `Product_Vision.md` and the founder's direct statements describe a narrow personal tool explicitly not competing with Bloomberg/Screener.in/TradingView. These cannot both be the target.

**Decision:** `PRODUCT_REQUIREMENTS.md` adopts the personal-tool framing. `CLAUDE.MD` should be edited to match (`TECHNICAL_DEBT.md` TD-012); until then, treat its scope language as superseded, while its visual/design-style guidance (dark-first, dense, premium typography) remains valid per `UI_UX.md` §1.

**Consequences:** prevents future scope creep driven by an AI coding assistant reading `CLAUDE.MD` literally and over-building toward a platform the founder explicitly doesn't want.

---

### ADR-010: Reconsider SSR/Cloudflare Workers deployment for the frontend

**Status:** Proposed, not yet actioned

**Context:** the frontend was built on TanStack Start with SSR and deployed to Cloudflare Workers — infrastructure suited to a multi-user, latency-sensitive product. The actual user count is one.

**Decision (proposed):** move to a static SPA build against the FastAPI backend, on the simplest available host, until there's a real multi-user or SEO/latency reason to bring SSR back.

**Consequences if adopted:** reduced operational complexity, faster local iteration, easier debugging (no edge-runtime-specific quirks). Tracked in `TECHNICAL_DEBT.md` TD-007 and `ENGINEERING_ROADMAP.md`. This ADR should be marked Accepted once actioned, or Rejected with a reason if the founder decides the SSR setup is worth keeping for a specific stated reason.

---

### ADR-011: No self-serve multi-tenancy; friends get manual access, not accounts

**Status:** Accepted

**Context:** `PRODUCT_REQUIREMENTS.md` explicitly rules out becoming a SaaS product. Nullable `user_id` columns exist throughout the schema as low-cost future-proofing, not as evidence of a planned account system.

**Decision:** no auth system, no billing, no self-serve signup is in scope. If friends are given access later, it will be manual (shared credentials or direct DB access), not a product feature.

**Consequences:** keeps the build simple. If this changes, it needs a new ADR and a real design pass on auth — don't half-build multi-tenancy incidentally while building something else.

---

### ADR-012: `CLAUDE.MD`, `Product_Vision.md`, and `API_CONTRACT.md` are confirmed removed, closing ADR-009

**Status:** Accepted (Milestone 1)

**Context:** ADR-009 treated `CLAUDE.MD`'s scope language as "superseded" pending a rewrite tracked in TD-012, and TD-013 similarly proposed updating or deprecating `API_CONTRACT.md`. During Milestone 1 planning, none of `CLAUDE.MD`, `Product_Vision.md`, or `API_CONTRACT.md` were found anywhere in the repository. The founder confirmed this is intentional — the files were removed, not merely omitted from an upload.

**Decision:** treat ADR-009's conflict as closed by removal, not by rewrite. `PRODUCT_REQUIREMENTS.md` and `CURRENT_STATE.md` are the sole current statements of vision and scope going forward. `CLAUDE.MD`'s genuinely-still-valid visual/style guidance (dark-first, dense typography) lives directly in `UI_UX.md` §1 without needing to reference the removed file. `API_CONTRACT.md`'s still-valid data-flow rule ("React never screens, ranks, filters, or calculates. FastAPI does.") lives directly in `ENGINEERING_GUIDE.md` §7.

**Consequences:** TD-012 and TD-013 are marked resolved in `TECHNICAL_DEBT.md`. ADR-009 itself is left unedited per this log's append-only convention — it remains accurate as a historical record of the conflict and its original resolution; this entry records what happened to the files afterward.

---

### ADR-013: `journal_reviews.ai_comparison_summary` is a plain writable field — no AI-generation logic is built

**Status:** Accepted (Milestone 4 / TD-017)

**Context:** the `ai_comparison_summary` column (`db/schema.sql`) carries an inline comment describing it as "generated by comparing thesis vs current financials/price." Building TD-017's write layer required a decision on whether to implement that generation (an LLM or rule-based comparison job) as part of this milestone.

**Decision:** treat `aiComparisonSummary` as an ordinary optional text field, writable through the same `POST`/`PUT /journal-reviews` endpoints as every other review field, with zero generation logic anywhere in the backend. The frontend form labels it "Notes comparing thesis vs. outcome" rather than anything implying automation, so the UI doesn't overpromise what the field does. Two independent reasons drove this: (1) `PRODUCT_REQUIREMENTS.md` states explicitly that the product should offer "transparent, explainable scoring — never a black box, never AI-generated opinions standing in for real analysis," so auto-generating this field would cut against a stated product principle, not just be extra scope; (2) building an actual comparison/generation job is a new subsystem (a new data pipeline, a new dependency, a new failure mode), which the founder's session instructions explicitly excluded ("if TD-017 requires a significant architectural change ... stop and explain before proceeding").

**Consequences:** the column exists and is fully writable/readable, so a future milestone could add generation logic without a schema or API change — only a new service function that populates the same field. No new debt is created by this decision (the column was never silently ignored, unlike TD-011's `shareholding_pattern`), but if the founder wants this to actually be AI-generated, that would need its own scoped milestone, its own founder decision on which model/approach to use, and would need to be reconciled against the "never AI-generated opinions" principle above rather than assumed compatible with it.

---

### ADR-014: `JournalReviewUpdate` excludes `entryId` — reviews cannot be reparented after creation

**Status:** Accepted (Milestone 4 / TD-017)

**Context:** `JournalEntryUpdate` and `PipelineItemUpdate` (the two existing write-layer precedents) both reuse their `Create` shape unchanged for `PUT`, because every field on those two tables — including the FK (`journal_entries.symbol`, `pipeline_items.symbol`) — is legitimately editable after creation. `journal_reviews.entry_id` is a different kind of column: it expresses "this review is a retrospective on that specific entry," a relationship that shouldn't change once the review exists.

**Decision:** `JournalReviewUpdate` is defined as its own `BaseModel` (not a subclass of `JournalReviewBase`) that omits `entryId` entirely, alongside `reviewedAt` (also immutable, same treatment as `journal_entries.created_at`). `PUT /journal-reviews/{id}` therefore cannot move a review to a different entry or backdate/forward-date it — only the retrospective content fields are replaceable.

**Consequences:** this is a deliberate, narrow deviation from the "Update mirrors Create exactly" convention the other two write layers established — documented here so it isn't mistaken for an oversight, and so a future contributor extending this module doesn't "fix" it by making `entryId` editable without first re-deciding this point. If a genuine need for reparenting reviews between entries emerges, that should be a new decision (and probably a dedicated endpoint, e.g. a `PATCH .../entry`, mirroring how `pipeline_items` got a dedicated `PATCH .../stage` rather than folding stage-moves into the general `PUT`), not a silent loosening of this one.

---

### ADR-015: Universe source of truth is a version-controlled CSV, not a database table; `companies.is_active` becomes a real, enforced flag

**Status:** Accepted (Milestone 5)

**Context:** the hardcoded 8-company `UNIVERSE` list in `ingest/universe.py` needed replacing with something that scales to ~100 companies now (Nifty 50 + Nifty Next 50) and to the full NSE universe (~1500–2000) later, without further architectural change. Three options were considered: a CSV file, a JSON file, and a database table with an admin-editable UI.

**Decision:** `data/universe_top100.csv`, checked into the repository, is the source of truth, loaded by `ingest/universe.py`'s `load_universe()`. A database table was rejected for this milestone — which companies are "in scope" is an infrequent, human, auditable decision (NSE reconstitutes Nifty 50/Next 50 semi-annually; see `TECHNICAL_DEBT.md` TD-025), not something needing live in-app mutation, and a table would need its own admin-editing workflow to get the same review/audit trail a CSV gets for free from git. JSON was rejected as adding a serialization format with no advantage over CSV for flat, tabular data, when the project's own `ingest/seed_fundamentals.py` already established CSV as the convention for structured external datasets. Alongside this, `companies.is_active` (present in `db/schema.sql` since before this milestone but never actually read or written by any code) is now genuinely populated by `ensure_company_rows()` in `fetch_prices.py` and filtered on by `services/company_service.py`'s `get_all_companies` (list/Discover/Screener paths only — `get_company_by_symbol` deliberately has no such filter, so a journal entry or pipeline item pointing at a company that later leaves the universe still resolves on its detail page).

**Consequences:** scaling the universe later (to 150–300, or the full NSE list) means replacing or extending this one CSV — `fetch_prices.py`, `compute_technicals.py`, and `compute_scores.py` need no further code changes, since all three already only ever call `load_universe()`/import `UNIVERSE`. A company leaving the tracked universe should be handled by flipping its CSV row to `is_active=false` (which `ensure_company_rows()` will sync to the DB), not by deleting its row from the CSV or the database — deleting would orphan its historical price/fundamentals data and, if referenced by a journal entry or pipeline item, would violate the "never delete user-generated data" principle. `ingest/reset_market_data.py`'s one-time cleanup of the old 8 pre-Milestone-5 dev companies is the one place this milestone does delete `companies` rows outright, and only after checking (via `journal_entries`/`pipeline_items`) that nothing user-generated references them — see that script's own docstring for the full FK-safety reasoning.
