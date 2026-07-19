# UI / UX Philosophy

**Purpose:** navigation model, design principles, the intended investor workflow, and page-by-page philosophy.

**Audience:** founder, frontend contributors, designers.

---

## 1. Design principles

Per `PRODUCT_REQUIREMENTS.md` §9 and confirmed by the actual build (shadcn/ui, restrained Tailwind usage, `AppShell` + `CommandPalette` navigation pattern): simple, minimal, opinionated, fast, quality-over-quantity. The homepage should tell the founder, immediately, where to spend research time today — not present a dashboard of everything.

**Note on visual style vs. scope (historical context, resolved):** an earlier internal style document (`CLAUDE.MD`, since intentionally removed from the repository — see `DECISIONS.md` ADR-012) described a "premium financial terminal... Bloomberg Terminal... dark-first... dense but readable" aesthetic. That visual language is legitimate and is preserved directly in this document (dark-first, dense typography, elegant animation are fine choices for this kind of tool). What was rejected, per `PRODUCT_REQUIREMENTS.md`, was that same document's extension of "Bloomberg Terminal" from a visual reference into a *scope* reference ("professional investment research platform rather than a simple stock dashboard"). Visual inspiration: keep, as stated in §1 above. Scope inspiration: reject.

## 2. Navigation model

Five routes, file-based (`frontend/src/routes/`):

| Route | Purpose | Current honesty of that purpose |
|---|---|---|
| `/` (Discover) | "Which companies deserve your attention today?" | Structurally answers this from a fixed 8-company universe — see `CURRENT_STATE.md` §1. Purpose is right, universe undermines it. |
| `/research`, `/research/$symbol` | Company deep-dive: overview, chart, technicals, fundamentals, score breakdown, thesis. | Genuinely delivers on its purpose for the 8 tracked companies. |
| `/screener` | Filter/sort across the tracked universe. | Functions correctly, but is secondary by design — see `PRODUCT_REQUIREMENTS.md` §7 (not the primary interface). |
| `/journal` | Record and review investment theses. | UI exists and looks complete; **is entirely mock data with no persistence** — see `CURRENT_STATE.md` §1. This is the largest gap between UX intent and UX reality in the product. |
| `/ideas` | Pipeline (Watching → Researching → Conviction). | Read-only against the real `pipeline_items` table; no way to move an item through stages via the app yet. |

A global `CommandPalette` (`shared/components/layout/CommandPalette.tsx`) provides quick company lookup — a good pattern for a dense, keyboard-friendly personal tool; keep and extend this rather than adding more nav chrome.

## 3. Homepage philosophy

The homepage must always answer exactly one question, with a small number of explained items, never a long list. This is correctly implemented as a set of small `DiscoverGroup`s ("Improving Fundamentals," "Technical Momentum," "Small & Mid Cap Watch," "Biggest Movers") rather than one giant ranked table — a good structural decision, independent of the universe-size problem. Once the universe grows (`PRODUCT_ROADMAP.md` Phase 2), this grouping structure should scale without a redesign; only the underlying queries' `limit` and selectivity need to change.

**What the homepage should be honest about, once the universe grows:** it must be allowed to show fewer than 10–15 items, or none, on a day when nothing genuinely clears the bar. A tool that always finds "something" every day, regardless of whether anything actually changed, teaches its one user not to trust it. This is currently moot at 8 companies (everything is always shown, reshuffled) but becomes a real design requirement the moment the universe is real.

## 4. Research page philosophy

Should answer: "Should I seriously consider investing in this company?" The current sections (overview, chart, technicals, fundamentals, score breakdown, pros/cons, checklist, verdict, and — intended but not connected — thesis/notes/watchlist status) map correctly onto that question. The candlestick+volume chart rewrite (`PriceChart.tsx` on `lightweight-charts`, per `MODULE_5_REPORT.md`) was the right call over the prior area-chart-of-close-only version — keep this component as the standard, don't regress it.

**Gap:** "My Personal Notes," "My Journal," and "Watchlist Status" are meant to live directly on this page per `PRODUCT_REQUIREMENTS.md`, but since the journal has no backend, this section either doesn't exist yet or is decorative. Fixing the journal write path (`PRODUCT_ROADMAP.md` Phase 1) is a UX fix as much as a backend fix — this page is incomplete without it.

## 5. Journal philosophy

The most under-built part of the product relative to how central it is to the vision. Per `PRODUCT_REQUIREMENTS.md`, the journal exists to force explicit, falsifiable reasoning (including a pre-committed sell trigger) and to close the loop later via review. UX-wise, this means:

- Writing an entry should take under two minutes — friction here directly reduces whether it gets used at all.
- The review flow (`journal_reviews`, `review_due_at`) should surface proactively — a "Due for Review" view, not something the founder has to remember to seek out. Nothing in the current frontend does this yet.
- Reviews should show the thesis alongside what the score/price actually did since — this is where `journal_reviews.ai_comparison_summary` is meant to matter, and it should stay deterministic/data-driven per the same explainability rule as the scoring engine, not become a place AI narrative sneaks in unjustified.

## 6. Information hierarchy rules (apply to any new page)

1. One page, one question (per `PRODUCT_REQUIREMENTS.md`'s module philosophy — "What companies exist," "What deserves attention today," "Should I invest," "Find me things worth researching").
2. Every number that implies a judgment (a score, a verdict, a "why this matters") must have a visible path to its underlying inputs, not just a tooltip restating the number.
3. Missing data shows "—", never 0 or a silently omitted field.
4. No page should default to showing volume for its own sake — screener filters and research detail exist for the person who wants depth; the homepage is not that person's entry point.

## 7. Future redesign ideas

Tracked in `IDEAS.md`, not here — this document describes current and near-term intended UX, not speculative redesigns.
