import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Company } from "@/shared/api/types";
import { VerdictBadge } from "@/shared/components/common/Badge";
import { AddToIdeasButton } from "@/shared/components/common/AddToIdeasButton";
import { cn } from "@/shared/utils/utils";

type Props = {
  company: Company;
  /** Optional extra content rendered below the sparkline row (e.g. score metrics on the screener). */
  footer?: ReactNode;
  /** Optional content shown above the rationale, e.g. a "why selected" line with an icon. */
  note?: ReactNode;
  className?: string;
  /** Show Overall/Fundamental/Technical scores. Default true — set false
   * only for tight spaces where the row variant is a better fit. */
  showScores?: boolean;
  /** Show the "Add to Ideas" action. Independent of showScores — Discover
   * shows scores but hides this to keep Research the primary action. */
  showAddToIdeas?: boolean;
};

/**
 * The single card presentation used everywhere a company is shown as a
 * self-contained tile (Discover's technical momentum grid, Screener
 * results). Purely presentational — all data comes in via props so it can
 * be fed straight from a `Company` API response.
 */
export function CompanyCard({ company: c, footer, note, className, showScores = true, showAddToIdeas = true }: Props) {
  const positive = c.changePct >= 0;
  return (
    <div
      className={cn(
        "group relative rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-card-hover transition-all",
        className,
      )}
    >
      <Link to="/research/$symbol" params={{ symbol: c.symbol }} className="block p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-[15px] text-ink truncate">{c.name}</p>
            </div>
            <p className="font-mono text-[11px] text-ink-subtle mt-0.5">
              {c.exchange}:{c.symbol} · {c.sector}
            </p>
          </div>
          <VerdictBadge verdict={c.verdict} className="shrink-0" />
        </div>

        {note ?? (
          <p className="text-sm text-ink-muted leading-relaxed text-pretty mb-4 line-clamp-2">
            {c.rationale}
          </p>
        )}

        <div className="flex items-baseline justify-between">
          <div className="font-mono text-lg font-semibold tabular-nums">
            ₹{c.price.toLocaleString("en-IN")}
          </div>
          <div
            className={cn(
              "text-[13px] font-mono font-medium tabular-nums",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {positive ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </div>
        </div>

        {showScores && (
          <div className="mt-4 pt-4 hairline-t flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-lg font-semibold text-ink tabular-nums">
                {c.overallScore.toFixed(0)}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-ink-subtle">Score</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-ink-subtle tabular-nums">
              <span>F {c.fundamentalScore.toFixed(0)}</span>
              <span>T {c.technicalScore.toFixed(0)}</span>
              <span>{c.riskLevel} risk</span>
            </div>
          </div>
        )}

        {footer}
      </Link>

      {showAddToIdeas && (
        <div className="px-5 pb-5 -mt-1">
          <AddToIdeasButton symbol={c.symbol} className="w-full justify-center" />
        </div>
      )}
    </div>
  );
}
