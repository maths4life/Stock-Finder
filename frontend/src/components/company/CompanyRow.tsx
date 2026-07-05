import { Link } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Company } from "@/lib/api/types";
import { Sparkline } from "@/components/common/Sparkline";
import { cn } from "@/lib/utils";

type Props = {
  company: Company;
  /** Override the middle description column (defaults to the rationale). */
  description?: string;
  className?: string;
};

/** Dense, single-line-ish row presentation used in list-style sections (Discover feed, Research library). */
export function CompanyRow({ company: c, description, className }: Props) {
  const positive = c.changePct >= 0;
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className={cn(
        "group grid grid-cols-12 gap-6 py-5 hairline-b last:border-b-0 hover:bg-secondary/40 transition-colors -mx-3 px-3 rounded-md",
        className,
      )}
    >
      <div className="col-span-12 sm:col-span-3">
        <p className="font-semibold text-[15px] text-ink group-hover:text-accent transition-colors">{c.name}</p>
        <p className="font-mono text-[11px] text-ink-subtle mt-0.5">
          {c.exchange}:{c.symbol}
        </p>
      </div>
      <div className="col-span-12 sm:col-span-6">
        <p className="text-[13.5px] leading-relaxed text-ink-muted text-pretty line-clamp-2">
          {description ?? c.rationale}
        </p>
        <p className="text-[11px] text-ink-subtle mt-2 uppercase tracking-widest">{c.sector}</p>
      </div>
      <div className="col-span-12 sm:col-span-3 flex sm:flex-col items-center sm:items-end justify-between">
        <div className="flex items-center gap-1.5">
          {positive ? <TrendingUp className="size-3 text-positive" /> : <TrendingDown className="size-3 text-negative" />}
          <span className={cn("text-sm font-medium tabular-nums", positive ? "text-positive" : "text-negative")}>
            {positive ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </span>
        </div>
        <Sparkline data={c.spark} tone={positive ? "positive" : "negative"} width={90} height={24} className="hidden sm:block my-1" />
        <p className="text-[11px] text-ink-subtle">{c.marketCap}</p>
      </div>
    </Link>
  );
}
