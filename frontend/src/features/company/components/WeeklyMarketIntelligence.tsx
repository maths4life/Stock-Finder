import type { ReactNode } from "react";
import { CalendarClock, Newspaper } from "lucide-react";
import { OutlookBadge } from "@/shared/components/common/Badge";
import { CompanyRow } from "@/features/company/components/CompanyRow";
import type { WeeklyMarketIntelligence as WeeklyMarketIntelligenceData } from "@/shared/api/types";

type Props = {
  data: WeeklyMarketIntelligenceData;
};

/**
 * Research page's "Weekly Market Intelligence" section (Module 7).
 * Renders the fully processed weekly news -> sector intelligence
 * FastAPI already built -- no filtering, ranking, or sentiment reading
 * happens here. Reuses `CompanyRow` (the same row component the Discover
 * feed and Research library use) for "Companies Worth Research" instead
 * of a new list component, and `OutlookBadge` alongside the existing
 * `RatingBadge`/`RiskBadge`/`SentimentBadge` family in Badge.tsx.
 */
export function WeeklyMarketIntelligence({ data }: Props) {
  const dateRange = formatDateRange(data.weekStartDate, data.weekEndDate);

  return (
    <div className="space-y-10">
      <div className="rounded-xl ring-1 ring-hairline bg-secondary/40 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Newspaper className="size-3.5 text-accent" />
            <span className="text-[11px] uppercase tracking-widest font-medium text-accent">
              {data.sector} — Sector Outlook
            </span>
          </div>
          <div className="flex items-center gap-3">
            <OutlookBadge outlook={data.sectorOutlook} />
            <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-ink-subtle">
              <CalendarClock className="size-3" /> {dateRange}
            </span>
          </div>
        </div>
        <p className="text-heading-lg leading-snug text-ink text-pretty">{data.weeklySummary}</p>
      </div>

      {!data.hasCoverage && (
        <p className="text-sm text-ink-subtle">
          This is a placeholder read — the weekly refresh hasn't generated intelligence for this sector yet.
        </p>
      )}

      <ReportSubsection title="Major Events">
        {data.importantEvents.length > 0 ? (
          <ul className="space-y-5">
            {data.importantEvents.map((event) => (
              <li key={event.headline} className="rounded-lg ring-1 ring-hairline p-4">
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[15px] font-medium text-ink hover:text-accent transition-colors text-pretty"
                >
                  {event.headline}
                </a>
                <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">
                  <span className="text-ink-subtle uppercase tracking-widest text-[10px] mr-1.5">Why it matters</span>
                  {event.whyItMatters}
                </p>
                <p className="mt-1 text-[13.5px] text-ink-muted leading-relaxed">
                  <span className="text-ink-subtle uppercase tracking-widest text-[10px] mr-1.5">Expected impact</span>
                  {event.expectedImpact}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-subtle">No notable events found in this sector for the current week.</p>
        )}
      </ReportSubsection>

      <ReportSubsection title="Market Impact">
        <p className="text-[15px] leading-relaxed text-ink text-pretty">{data.marketImpact}</p>
      </ReportSubsection>

      <ReportSubsection title="Companies Worth Research">
        {data.sectorResearchCandidates.length > 0 ? (
          <div className="divide-y divide-hairline -mt-1">
            {data.sectorResearchCandidates.map((c) => (
              <CompanyRow
                key={c.symbol}
                company={c}
                description={`Opportunity Score ${c.overallScore.toFixed(0)}/100 — ${c.rationale}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-subtle">No other covered companies in this sector yet.</p>
        )}
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

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}
