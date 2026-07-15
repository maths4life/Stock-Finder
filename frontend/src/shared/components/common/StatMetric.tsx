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

const sizeClasses: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
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
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tabular-nums leading-none",
          sizeClasses[size],
          highlight ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className={cn("mt-1 text-[11px] font-mono", tone ? toneClasses[tone] : "text-ink-muted")}>{sub}</p>}
    </div>
  );
}
