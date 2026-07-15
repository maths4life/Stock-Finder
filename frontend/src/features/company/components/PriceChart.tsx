import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/shared/components/ui/chart";
import type { PriceBar, PriceRange } from "@/shared/api/types";

const RANGES: PriceRange[] = ["1M", "3M", "6M", "1Y", "5Y", "ALL"];

const chartConfig = {
  close: { label: "Close", color: "var(--color-accent)" },
} satisfies ChartConfig;

type Props = {
  data: PriceBar[];
  range: PriceRange;
  onRangeChange: (range: PriceRange) => void;
  isLoading?: boolean;
};

/** Research page's "Price History" section (Module 3). Renders only
 * fields the backend actually returns from `prices_daily` — no derived
 * or invented values. */
export function PriceChart({ data, range, onRangeChange, isLoading }: Props) {
  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-4">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className={
              "px-2 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors " +
              (r === range ? "bg-accent text-accent-foreground" : "text-ink-subtle hover:text-ink hover:bg-secondary")
            }
          >
            {r}
          </button>
        ))}
      </div>

      {isLoading && <div className="h-[220px] rounded-xl bg-secondary/40 animate-pulse" />}

      {!isLoading && data.length < 2 && (
        <div className="h-[220px] rounded-xl ring-1 ring-hairline grid place-items-center text-sm text-ink-muted">
          No price history available for this range.
        </div>
      )}

      {!isLoading && data.length >= 2 && (
        <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
          <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => new Date(v as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Close"]}
                />
              }
            />
            <Area dataKey="close" type="monotone" stroke="var(--color-accent)" fill="url(#priceFill)" strokeWidth={1.5} />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
