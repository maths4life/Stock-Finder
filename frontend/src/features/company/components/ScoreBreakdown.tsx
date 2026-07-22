import { useState } from "react";
import { ChevronDown, Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import type { Company, ScoreMetric } from "@/shared/api/types";

/** Amber, matching the existing "warning" tone used by
 * AIResearchReport.tsx's CatalystList — reused here rather than
 * inventing a second amber value, kept as a shared constant so
 * both call sites can be pointed at one real CSS token later. */
const WARNING = "oklch(0.6 0.15 60)";
const POSITIVE = "var(--positive)";
const NEGATIVE = "var(--negative)";
const NEUTRAL = "var(--ink-subtle)";

/** Green ≥70% of available points, amber 40-70%, red below — the
 * green/amber/red indicator system the score breakdown is built
 * around. `passed` (the engine's own pass/fail read at the metric's
 * documented threshold) drives the check/cross icon; this percentage
 * drives the bar/dot color, so a metric can be a soft amber "partial
 * credit" even when it technically failed its pass bar, and vice
 * versa — both signals are shown, neither hides the other. */
function scoreTone(pct: number): "positive" | "warning" | "negative" {
  if (pct >= 70) return "positive";
  if (pct >= 40) return "warning";
  return "negative";
}

const toneColor = { positive: POSITIVE, warning: WARNING, negative: NEGATIVE } as const;

function formatValue(v: ScoreMetric["value"]): string {
  if (v === null || v === undefined) return "N/A";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return v;
  // Heuristic display formatting: percentages/ratios get 1-2 decimals,
  // the underlying number is real either way, this only affects
  // rendering. Ratios below 20 (D/E, PB, PEG, PE-ish) get 2 decimals;
  // everything else (percentages, RSI, 52w-range%) gets 1.
  return Math.abs(v) < 20 ? v.toFixed(2) : v.toFixed(1);
}

function MetricRow({ item }: { item: ScoreMetric }) {
  const noData = item.maxScore === 0;
  const pct = noData ? 0 : (item.score / item.maxScore) * 100;
  const tone = noData ? "warning" : scoreTone(pct);

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {noData ? (
            <AlertTriangle className="size-3.5 shrink-0" style={{ color: NEUTRAL }} />
          ) : item.passed ? (
            <Check className="size-3.5 shrink-0 text-positive" />
          ) : (
            <X className="size-3.5 shrink-0 text-negative" />
          )}
          <p className="text-sm font-medium text-ink truncate">{item.metric}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono tabular-nums text-ink">
            {noData ? "—" : `${item.score} / ${item.maxScore}`}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">
            {formatValue(item.value)}
          </p>
        </div>
      </div>
      <p className="mt-1.5 text-[13px] text-ink-muted leading-snug">{item.reason}</p>
      {!noData && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-primary/20 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: toneColor[tone] }}
          />
        </div>
      )}
    </div>
  );
}

function ScoreSection({ title, score, items }: { title: string; score: number; items: ScoreMetric[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-subtle">{title}</p>
        <p className="text-sm font-mono tabular-nums text-ink">{score.toFixed(0)} / 100</p>
      </div>
      <div className="divide-y divide-hairline">
        {items.map((item) => (
          <MetricRow key={item.metric} item={item} />
        ))}
      </div>
    </div>
  );
}

/** The "▼ Why this score?" panel — the full transparency contract for
 * Overall/Fundamental/Technical scores. Renders exclusively from
 * `c.scoreBreakdown`/`c.weighting`, both computed server-side by
 * analysis/scoring_engine.py — no calculation happens in this
 * component, only formatting. If the backend hasn't sent a breakdown
 * (e.g. an older cached response), the panel simply doesn't render. */
export function ScoreBreakdownPanel({ company: c }: { company: Company }) {
  const [open, setOpen] = useState(false);
  if (!c.scoreBreakdown || !c.weighting) return null;

  const fundamentalPct = Math.round(c.weighting.fundamental * 100);
  const technicalPct = Math.round(c.weighting.technical * 100);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="hairline-b">
      <CollapsibleTrigger className="w-full flex items-center justify-between py-4 text-left group">
        <span className="text-[13px] font-medium text-ink-muted group-hover:text-ink transition-colors">
          Why this score?
        </span>
        <ChevronDown
          className={cn("size-4 text-ink-subtle transition-transform duration-200", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-8">
        {/* The weighting formula, stated plainly with the real numbers,
            not hardcoded copy — pulled from c.weighting/c.overallScore/
            c.fundamentalScore/c.technicalScore directly. */}
        <div className="rounded-lg bg-surface-raised px-5 py-4 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-mono tabular-nums">
          <span className="text-ink">{c.overallScore.toFixed(0)}</span>
          <span className="text-ink-subtle">Overall Score</span>
          <span className="text-ink-subtle mx-1">=</span>
          <span className="text-ink">{fundamentalPct}%</span>
          <span className="text-ink-subtle">Fundamental ({c.fundamentalScore.toFixed(0)})</span>
          <span className="text-ink-subtle mx-1">+</span>
          <span className="text-ink">{technicalPct}%</span>
          <span className="text-ink-subtle">Technical ({c.technicalScore.toFixed(0)})</span>
        </div>

        <div className="space-y-8">
          <ScoreSection title="Fundamental Breakdown" score={c.fundamentalScore} items={c.scoreBreakdown.fundamental} />
          <ScoreSection title="Technical Breakdown" score={c.technicalScore} items={c.scoreBreakdown.technical} />
        </div>

        <p className="mt-6 text-[11px] text-ink-subtle leading-snug">
          A metric shows "—" when the platform doesn't have that data point for this company yet — it's excluded
          from the score entirely rather than guessed at.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
