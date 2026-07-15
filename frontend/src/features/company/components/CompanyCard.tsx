import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Company } from "@/shared/api/types";
import { Sparkline } from "@/shared/components/common/Sparkline";
import { VerdictBadge } from "@/shared/components/common/Badge";
import { cn } from "@/shared/utils/utils";

type Props = {
  company: Company;
  /** Optional extra content rendered below the sparkline row (e.g. score metrics on the screener). */
  footer?: ReactNode;
  /** Optional content shown above the rationale, e.g. a "why selected" line with an icon. */
  note?: ReactNode;
  className?: string;
};

/**
 * The single card presentation used everywhere a company is shown as a
 * self-contained tile (Discover's technical momentum grid, Screener
 * results). Purely presentational — all data comes in via props so it can
 * be fed straight from a `Company` API response.
 */
export function CompanyCard({ company: c, footer, note, className }: Props) {
  const positive = c.changePct >= 0;
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className={cn(
        "group block p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-card-hover transition-all",
        className,
      )}
    >
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
        <p className="text-sm text-ink-muted leading-relaxed text-pretty mb-4 line-clamp-2">{c.rationale}</p>
      )}

      <div className="flex items-end justify-between">
        <Sparkline data={c.spark} tone={positive ? "positive" : "negative"} fill width={140} height={36} />
        <div className="text-right">
          <div className="font-mono text-sm tabular-nums">₹{c.price.toLocaleString("en-IN")}</div>
          <div className={cn("text-[11px] font-mono tabular-nums", positive ? "text-positive" : "text-negative")}>
            {positive ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {footer}
    </Link>
  );
}
