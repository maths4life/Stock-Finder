import type { ReactNode } from "react";
import { Check, Sparkles, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import { RatingBadge } from "@/shared/components/common/Badge";
import type { CompanyAnalysis } from "@/shared/api/types";

type Props = {
  analysis: CompanyAnalysis;
};

/**
 * Research page's "AI Research Report" section (Module 6). Renders the
 * deterministic, rule-based report GET /company/{symbol}/analysis
 * returns — every sentence here comes straight from the backend, no
 * client-side generation or invented copy.
 */
export function AIResearchReport({ analysis }: Props) {
  return (
    <div className="space-y-10">
      {/* Headline: rating, confidence, investment summary */}
      <div className="rounded-xl ring-1 ring-hairline bg-secondary/40 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent" />
            <span className="text-[11px] uppercase tracking-widest font-medium text-accent">AI Research Engine</span>
          </div>
          <div className="flex items-center gap-3">
            <RatingBadge rating={analysis.rating} />
            <span className="text-[11px] font-mono tabular-nums text-ink-subtle">{analysis.confidence}% confidence</span>
          </div>
        </div>
        <p className="text-heading-lg leading-snug text-ink text-pretty">{analysis.investment_summary}</p>
      </div>

      <ReportSubsection title="Business Summary">
        <p className="text-[15px] leading-relaxed text-ink text-pretty">{analysis.business_summary}</p>
      </ReportSubsection>

      <div className="grid md:grid-cols-2 gap-x-10 gap-y-10">
        <AnalysisPanel
          title="Fundamental Analysis"
          groups={[
            { label: "Profitability", items: analysis.fundamental_analysis.profitability },
            { label: "Growth", items: analysis.fundamental_analysis.growth },
            { label: "Valuation", items: analysis.fundamental_analysis.valuation },
            { label: "Balance Sheet & Liquidity", items: analysis.fundamental_analysis.balance_sheet_and_liquidity },
          ]}
        />
        <AnalysisPanel
          title="Technical Analysis"
          groups={[
            { label: "Trend", items: analysis.technical_analysis.trend },
            { label: "Momentum", items: analysis.technical_analysis.momentum },
            { label: "Volume", items: analysis.technical_analysis.volume },
            { label: "Moving Averages", items: analysis.technical_analysis.moving_averages },
          ]}
        />
      </div>

      <ReportSubsection title="Valuation Commentary">
        <p className="text-[15px] leading-relaxed text-ink text-pretty">{analysis.valuation_summary}</p>
      </ReportSubsection>

      <ReportSubsection title="6–12 Month Outlook">
        <p className="text-[15px] leading-relaxed text-ink text-pretty">{analysis.outlook_6_12_month}</p>
      </ReportSubsection>

      <div className="grid md:grid-cols-3 gap-8">
        <CatalystList title="Positive Catalysts" items={analysis.positive_catalysts} icon={TrendingUp} tone="positive" />
        <CatalystList title="Negative Catalysts" items={analysis.negative_catalysts} icon={TrendingDown} tone="negative" />
        <CatalystList title="Risk Factors" items={analysis.risk_factors} icon={TriangleAlert} tone="warning" />
      </div>

      <ReportSubsection title="Overall Verdict">
        <div className="rounded-xl ring-1 ring-hairline bg-secondary/40 p-6 flex items-start gap-3">
          <Check className="size-4 text-accent mt-0.5 shrink-0" />
          <p className="text-[15px] leading-relaxed text-ink text-pretty">{analysis.overall_verdict}</p>
        </div>
      </ReportSubsection>
    </div>
  );
}

function ReportSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle mb-3">{title}</p>
      {children}
    </div>
  );
}

function AnalysisPanel({ title, groups }: { title: string; groups: { label: string; items: string[] }[] }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle mb-4">{title}</p>
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[11px] font-medium text-ink-muted mb-1.5">{group.label}</p>
            {group.items.length > 0 ? (
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item} className="text-sm text-ink leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-subtle">No data-backed observations for this section.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalystList({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: typeof TrendingUp;
  tone: "positive" | "negative" | "warning";
}) {
  const iconClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-[oklch(0.6_0.15_60)]";
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle mb-3">{title}</p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[13px] text-ink leading-snug">
            <Icon className={`size-3.5 mt-0.5 shrink-0 ${iconClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
