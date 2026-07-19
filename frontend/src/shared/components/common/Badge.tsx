import type { ReactNode } from "react";
import { cn } from "@/shared/utils/utils";
import type { AnalysisRating, RiskLevel, SectorOutlook, Sentiment, Verdict } from "@/shared/api/types";

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

const RATING_TONE: Record<AnalysisRating, BadgeTone> = {
  "Strong Buy": "positive",
  Buy: "positive",
  Hold: "warning",
  Avoid: "negative",
};

/** Module 6's Strong Buy/Buy/Hold/Avoid rating — a distinct scale from
 * VerdictBadge's Strong Conviction/Watch/Under Review/Pass above, so
 * kept as its own component rather than overloading VERDICT_TONE. */
export function RatingBadge({ rating, className }: { rating: AnalysisRating; className?: string }) {
  return (
    <Badge tone={RATING_TONE[rating] ?? "neutral"} className={className}>
      {rating}
    </Badge>
  );
}

const OUTLOOK_TONE: Record<SectorOutlook, BadgeTone> = {
  Positive: "positive",
  Neutral: "neutral",
  Negative: "negative",
};

/** Module 7's Weekly Market Intelligence sector outlook -- a distinct,
 * news-derived scale from SentimentBadge's score-derived Sector Pulse
 * above, so kept as its own component rather than reusing SENTIMENT_TONE. */
export function OutlookBadge({ outlook, className }: { outlook: SectorOutlook; className?: string }) {
  return (
    <Badge tone={OUTLOOK_TONE[outlook] ?? "neutral"} className={className}>
      {outlook}
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
