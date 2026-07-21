import type { ComparisonTable } from "@/shared/api/types";
import { cn } from "@/shared/utils/utils";

/**
 * Research page's Quarterly/Annual Financial Comparison sections. Same
 * grid-header/hairline-row table shape as the existing Shareholding
 * section in research.$symbol.tsx, reused rather than inventing a new
 * table style. Diff/Growth% are pre-computed by the backend (see
 * backend/services/fundamental_service.py) — this component only
 * formats and colors them, no arithmetic here.
 */

const CRORE_METRICS = new Set([
  "Revenue",
  "Net Profit",
  "EBITDA",
  "Cash",
  "Debt",
  "Free Cash Flow",
  "Operating Cash Flow",
  "Equity",
]);
const PERCENT_METRICS = new Set(["EBITDA Margin", "Operating Margin", "ROE", "ROCE"]);

function formatMetricValue(metric: string, value: number | null): string {
  if (value === null) return "N/A";
  if (CRORE_METRICS.has(metric)) return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}cr`;
  if (PERCENT_METRICS.has(metric)) return `${value.toFixed(1)}%`;
  if (metric === "EPS") return `₹${value.toFixed(2)}`;
  return value.toFixed(2);
}

function formatDiff(metric: string, diff: number | null): string {
  if (diff === null) return "N/A";
  const sign = diff >= 0 ? "+" : "";
  return sign + formatMetricValue(metric, diff);
}

function formatGrowth(growthPct: number | null): string {
  if (growthPct === null) return "N/A";
  return `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`;
}

export function FinancialComparisonTable({ data }: { data: ComparisonTable }) {
  return (
    <div className="rounded-xl ring-1 ring-hairline overflow-hidden">
      <div className="grid grid-cols-5 px-5 py-2.5 bg-secondary/50 text-[10px] uppercase tracking-widest text-ink-subtle">
        <span>Metric</span>
        <span className="text-right">{data.currentLabel ?? "Current"}</span>
        <span className="text-right">{data.previousLabel ?? "Previous"}</span>
        <span className="text-right">Difference</span>
        <span className="text-right">Growth %</span>
      </div>
      {data.rows.map((row) => {
        const tone =
          row.diff === null ? "text-ink-muted" : row.diff >= 0 ? "text-positive" : "text-negative";
        return (
          <div key={row.metric} className="grid grid-cols-5 px-5 py-3 text-sm hairline-t">
            <span className="text-ink-muted">{row.metric}</span>
            <span className="text-right font-mono tabular-nums text-ink">
              {formatMetricValue(row.metric, row.current)}
            </span>
            <span className="text-right font-mono tabular-nums text-ink-muted">
              {formatMetricValue(row.metric, row.previous)}
            </span>
            <span className={cn("text-right font-mono tabular-nums", tone)}>{formatDiff(row.metric, row.diff)}</span>
            <span className={cn("text-right font-mono tabular-nums", tone)}>{formatGrowth(row.growthPct)}</span>
          </div>
        );
      })}
    </div>
  );
}
