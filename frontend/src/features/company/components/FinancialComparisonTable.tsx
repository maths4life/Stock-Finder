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
    <div className="w-full rounded-lg ring-1 ring-hairline overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-secondary/50">
            <th className="text-left font-medium text-metric-label px-5 py-3">Metric</th>
            <th className="text-right font-medium text-metric-label px-5 py-3">{data.currentLabel ?? "Current"}</th>
            <th className="text-right font-medium text-metric-label px-5 py-3">{data.previousLabel ?? "Previous"}</th>
            <th className="text-right font-medium text-metric-label px-5 py-3">Difference</th>
            <th className="text-right font-medium text-metric-label px-5 py-3">Growth %</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const tone =
              row.diff === null ? "text-ink-muted" : row.diff >= 0 ? "text-positive" : "text-negative";
            return (
              <tr key={row.metric} className="hairline-t">
                <td className="text-left text-table-label text-ink-muted px-5 py-3.5">{row.metric}</td>
                <td className="text-right text-table-value font-medium tabular-nums text-ink px-5 py-3.5">
                  {formatMetricValue(row.metric, row.current)}
                </td>
                <td className="text-right text-table-value tabular-nums text-ink-muted px-5 py-3.5">
                  {formatMetricValue(row.metric, row.previous)}
                </td>
                <td className={cn("text-right text-table-value font-medium tabular-nums px-5 py-3.5", tone)}>
                  {formatDiff(row.metric, row.diff)}
                </td>
                <td className={cn("text-right text-table-value font-medium tabular-nums px-5 py-3.5", tone)}>
                  {formatGrowth(row.growthPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
