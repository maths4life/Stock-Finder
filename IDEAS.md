# Ideas — Parking Lot

**Purpose:** collect ideas that are interesting but explicitly not planned. Kept separate from `PRODUCT_ROADMAP.md` on purpose, per the original request: don't mix speculative ideas into committed phases.

**Audience:** founder.

**Rule:** nothing here should be built directly from this document. If an idea's time comes, promote it into `PRODUCT_ROADMAP.md` with a stated phase and rationale first — that step is what forces the "is this actually worth doing now" question, which is exactly the discipline that was skipped when Module 7 (news) got built ahead of the journal write path.

---

## Scoring & data

- Automated calibration reports: a scheduled job that compares `scores.overall_score` at journal-entry time against actual price/fundamental movement by the review date, without waiting for a manual quarterly check.
- Backtest the v1 scoring thresholds against historical prices for the current 8 companies as a sanity check, even before universe expansion — cheap, and might surface an obviously wrong weight early.
- A "conviction decay" indicator: flag journal entries whose thesis conditions have visibly stopped holding (e.g., debt-to-equity crossed the threshold that was part of the original thesis) — a nudge to review early, not just at the scheduled `review_due_at`.
- Sector-relative valuation bands shown directly on the research page (not just used internally by the score) — "this P/E is in the cheap third of its sector" as a standalone UI element.

## Discovery

- "Why did this drop off the list" — when a company leaves the daily shortlist, a one-line reason (score fell below threshold, a peer scored higher, data went stale), instead of it just silently disappearing.
- A manual "surprise me" mode that deliberately surfaces a company outside the founder's typical sector exposure, once the universe is large enough for this to be meaningful.

## Journal

- Tagging/search across journal entries once there's enough volume to need it.
- A "what I got wrong" digest — periodically surface the theses that didn't play out, specifically, as a deliberate anti-recency-bias habit.

## News (only after Phase 5 in `PRODUCT_ROADMAP.md` proves the pipeline works)

- Push notification (or a digest email) when a major event hits a sector containing a pipeline company.
- Extending sector classification beyond keyword matching to something more robust, if keyword matching proves too noisy in practice — not before it's actually been tested against live data.

## AI (none of these are justified yet — see `PRODUCT_REQUIREMENTS.md` §7 and `SCORING_ENGINE.md` §1; revisit only after the deterministic score is calibrated)

- Natural-language query over the founder's own journal history ("what did I say about debt levels last time I passed on a company like this?") — additive to the deterministic core, not a replacement, and only worth considering once there's enough journal volume to query.
- LLM-assisted first-draft business summaries, strictly labeled as AI-generated and kept separate from the deterministic score/rationale — never blended into it.

## Product shape

- If friends do get access later: a lightweight "why I passed" annotation shared between users on the same pipeline item, without building full multi-tenant accounts (see `DECISIONS.md` ADR-011 — this would still need a real design pass, not a shortcut).
- A quarterly "state of my portfolio decisions" personal report generated from journal + review data — closer to a reflection tool than a dashboard.

---

*Add to this list freely. Remove from it only by promoting an idea into `PRODUCT_ROADMAP.md`, or by deciding it's no longer interesting (in which case, just delete the line — no need to keep rejected ideas around, unlike ADRs).*
