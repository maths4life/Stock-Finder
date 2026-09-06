import { cn } from "@/shared/utils/utils";

type Props = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "positive" | "negative" | "neutral";
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  className?: string;
};

// Value size scale: sm/md are used for dense metric grids (Valuation,
// Technicals, Support & Resistance), lg is reserved for the handful of
// headline numbers called out in the spec (price, market cap, scores).
const sizeClasses: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-[15px]",
  md: "text-lg",
  lg: "text-metric-value-lg",
};

const toneClasses: Record<NonNullable<Props["tone"]>, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-ink",
};

/** A single label/value stat block — the atomic unit reused by score rows, hero metrics, and journal stats. */
export function StatMetric({ label, value, sub, tone, size = "md", highlight, className }: Props) {
  return (
    <div className={className}>
      <p className="text-metric-label">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tabular-nums leading-tight",
          sizeClasses[size],
          highlight ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && (
        <p
          className={cn(
            "mt-1 text-[13px] font-medium tabular-nums",
            tone ? toneClasses[tone] : "text-ink-muted",
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
