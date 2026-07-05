import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RiskLevel, Sentiment, Verdict } from "@/lib/api/types";

export type BadgeTone = "positive" | "negative" | "neutral" | "warning" | "muted";

const toneClasses: Record<BadgeTone, string> = {
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  neutral: "bg-neutral-soft text-neutral",
  warning: "bg-[oklch(0.96_0.03_75)] text-[oklch(0.45_0.11_65)] dark:bg-[oklch(0.3_0.05_75)] dark:text-[oklch(0.85_0.1_75)]",
  muted: "bg-secondary text-ink-subtle",
};

export function Badge({ tone = "muted", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const VERDICT_TONE: Record<Verdict, BadgeTone> = {
  "Strong Conviction": "positive",
  Watch: "neutral",
  "Under Review": "warning",
  Pass: "muted",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <Badge tone={VERDICT_TONE[verdict] ?? "neutral"} className={className}>
      {verdict}
    </Badge>
  );
}

const SENTIMENT_TONE: Record<Sentiment, BadgeTone> = {
  Bullish: "positive",
  Positive: "positive",
  Neutral: "neutral",
  Bearish: "negative",
};

export function SentimentBadge({ sentiment, className }: { sentiment: Sentiment; className?: string }) {
  return (
    <Badge tone={SENTIMENT_TONE[sentiment] ?? "neutral"} className={className}>
      {sentiment}
    </Badge>
  );
}

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  Low: "positive",
  Moderate: "neutral",
  High: "negative",
};

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  return (
    <Badge tone={RISK_TONE[risk] ?? "neutral"} className={className}>
      {risk} risk
    </Badge>
  );
}
