import { Link } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Company } from "@/shared/api/types";
import { AddToIdeasButton } from "@/shared/components/common/AddToIdeasButton";
import { cn } from "@/shared/utils/utils";

type Props = {
  company: Company;
  /** Override the middle description column (defaults to the rationale). */
  description?: string;
  className?: string;
  /** Show the Overall/Fundamental/Technical score cluster. Default true. */
  showScores?: boolean;
  /** Show the "Add to Ideas" action. Independent of showScores. Default true. */
  showAddToIdeas?: boolean;
};

/** Dense, single-line-ish row presentation used in list-style sections (Discover feed, Research library). */
export function CompanyRow({ company: c, description, className, showScores = true, showAddToIdeas = true }: Props) {
  const positive = c.changePct >= 0;
  return (
    <div
      className={cn(
        "group grid grid-cols-12 gap-4 sm:gap-6 py-5 hairline-b last:border-b-0 hover:bg-secondary/40 transition-colors -mx-3 px-3 rounded-md items-center",
        className,
      )}
    >
      <Link
        to="/research/$symbol"
        params={{ symbol: c.symbol }}
        className="col-span-12 sm:col-span-3 min-w-0"
      >
        <p className="font-semibold text-[15px] text-ink group-hover:text-accent transition-colors truncate">
          {c.name}
        </p>
        <p className="font-mono text-[11px] text-ink-subtle mt-0.5">
          {c.exchange}:{c.symbol}
        </p>
      </Link>
      <Link
        to="/research/$symbol"
        params={{ symbol: c.symbol }}
        className={cn(
          "col-span-12",
          showScores ? (showAddToIdeas ? "sm:col-span-4" : "sm:col-span-5") : "sm:col-span-6",
        )}
      >
        <p className="text-[13.5px] leading-relaxed text-ink-muted text-pretty line-clamp-2">
          {description ?? c.rationale}
        </p>
        <p className="text-[11px] text-ink-subtle mt-2 uppercase tracking-widest">{c.sector}</p>
      </Link>
      {showScores && (
        <Link
          to="/research/$symbol"
          params={{ symbol: c.symbol }}
          className="col-span-6 sm:col-span-2 flex items-center gap-3 font-mono text-[11px] text-ink-subtle tabular-nums"
        >
          <span className="text-base font-semibold text-ink">{c.overallScore.toFixed(0)}</span>
          <span className="hidden md:inline">
            F {c.fundamentalScore.toFixed(0)} · T {c.technicalScore.toFixed(0)}
          </span>
        </Link>
      )}
      <Link
        to="/research/$symbol"
        params={{ symbol: c.symbol }}
        className={cn(
          "col-span-6 flex sm:flex-col items-center sm:items-end justify-between",
          showScores ? "sm:col-span-2" : "sm:col-span-3",
        )}
      >
        <div className="flex items-center gap-1.5">
          {positive ? (
            <TrendingUp className="size-3 text-positive" />
          ) : (
            <TrendingDown className="size-3 text-negative" />
          )}
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {positive ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </span>
        </div>
        <p className="text-[11px] text-ink-subtle sm:my-1">{c.marketCap}</p>
      </Link>
      {showAddToIdeas && (
        <div className="col-span-12 sm:col-span-1 flex sm:justify-end">
          <AddToIdeasButton symbol={c.symbol} />
        </div>
      )}
    </div>
  );
}
