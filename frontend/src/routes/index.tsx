import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/components/layout/AppShell";
import { CompanyCard } from "@/features/company/components/CompanyCard";
import { CompanyRow } from "@/features/company/components/CompanyRow";
import { SentimentBadge } from "@/shared/components/common/Badge";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { CompanyCardGridSkeleton } from "@/shared/components/common/Skeletons";
import { DataFreshness } from "@/shared/components/common/DataFreshness";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCompaniesForSymbols } from "@/features/company/hooks/useCompaniesForSymbols";
import { cn } from "@/shared/utils/utils";
import {
  useDiscoverGroups,
  useMarketIndicators,
  useMarketNews,
  useSectorPulse,
} from "@/features/market/hooks/useDiscover";
import { fetchDiscoverGroups } from "@/features/market/api/market";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { DiscoverGroup, SectorPulse } from "@/shared/api/types";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: queryKeys.discoverGroups,
      queryFn: fetchDiscoverGroups,
    }),
  head: () => ({
    meta: [
      { title: "Today's Shortlist — Stock Finder" },
      {
        name: "description",
        content: "The Indian companies worth your time today, grouped by why they matter.",
      },
      { property: "og:title", content: "Today's Shortlist — Stock Finder" },
      {
        property: "og:description",
        content: "A daily shortlist of Indian equities worth a second look, and why.",
      },
    ],
  }),
  component: Discover,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function formatToday() {
  const d = new Date();
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function Discover() {
  const groupsQuery = useDiscoverGroups();

  return (
    <AppShell>
      <div className="page-container py-12 pb-24">
        <header className="mb-12 animate-fade-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-eyebrow text-accent mb-2">{formatToday()}</p>
            <h1 className="text-heading-xl md:text-display text-balance max-w-[26ch]">
              Today's shortlist
            </h1>
            <p className="mt-3 text-sm text-ink-muted max-w-lg leading-relaxed">
              Companies worth a look today, grouped by why they qualify.
            </p>
          </div>
          <DataFreshness />
        </header>

        <div className="grid grid-cols-12 gap-x-12 gap-y-16">
          {/* Feed */}
          <div className="col-span-12 lg:col-span-8 space-y-16">
            {groupsQuery.isPending && <DiscoverFeedSkeleton />}
            {groupsQuery.isError && (
              <ErrorState
                description="Couldn't load today's briefing."
                onRetry={() => groupsQuery.refetch()}
              />
            )}
            {groupsQuery.data?.map((group, gi) => (
              <DiscoverGroupSection key={group.id} group={group} index={gi} />
            ))}
          </div>

          {/* Sidebar — market-wide context, freed up now that the pipeline
              lives solely on the Ideas page (Section 4). */}
          <aside className="col-span-12 lg:col-span-4 space-y-10">
            <MarketContextList />
            <SectorPulseList />
            <MarketNewsList />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function DiscoverGroupSection({ group, index }: { group: DiscoverGroup; index: number }) {
  const { data: companies = [], isPending } = useCompaniesForSymbols(group.symbols);
  return (
    <section className="animate-fade-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-end justify-between hairline-b pb-3 mb-6">
        <div>
          <h2 className="text-eyebrow text-ink-subtle">{group.label}</h2>
          <p className="mt-1.5 text-sm text-ink-muted">{group.tagline}</p>
        </div>
        <span className="text-[11px] font-mono text-ink-subtle">{group.symbols.length} names</span>
      </div>

      {isPending ? (
        group.layout === "grid" ? (
          <CompanyCardGridSkeleton count={group.symbols.length} />
        ) : (
          <Skeleton className="h-40 w-full rounded-md" />
        )
      ) : group.layout === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {companies.map((c) => (
            <CompanyCard
              key={c.symbol}
              company={c}
              note={null}        // no rationale/bullets on Discover — just name, price, change
              showScores={false} // scores live on the Research page
              showAddToIdeas={false}
            />
          ))}
        </div>
      ) : (
        <div>
          {companies.map((c) => (
            <CompanyRow
              key={c.symbol}
              company={c}
              description={c.sector} // sector only — no conviction text on front page
              showScores={false}
              showAddToIdeas={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}


function MarketContextList() {
  const { data: indicators = [], isPending } = useMarketIndicators();
  return (
    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface-raised">
      <h3 className="text-eyebrow text-ink-subtle mb-4">Market Context</h3>
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {indicators.map((m) => (
            <div key={m.label} className="flex justify-between items-baseline py-2.5">
              <span className="text-sm text-ink-muted">{m.label}</span>
              <div className="text-right">
                <span className="font-mono text-sm text-ink tabular-nums">{m.value}</span>
                <span
                  className={
                    "ml-2 text-[11px] font-mono " +
                    (m.tone === "positive" ? "text-positive" : "text-ink-subtle")
                  }
                >
                  {m.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectorPulseList() {
  const { data: sectors = [], isPending } = useSectorPulse();
  const [openSector, setOpenSector] = useState<string | null>(null);

  function toggle(sector: string) {
    setOpenSector((prev) => (prev === sector ? null : sector));
  }

  return (
    <div className="rounded-xl ring-1 ring-hairline bg-surface-raised overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        <h3 className="text-eyebrow text-ink-subtle">Top Sectors</h3>
      </div>
      {isPending ? (
        <div className="px-6 pb-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {sectors.map((s: SectorPulse) => {
            const isOpen = openSector === s.sector;
            return (
              <div key={s.sector}>
                {/* Clickable header row */}
                <button
                  id={`sector-${s.sector.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => toggle(s.sector)}
                  className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-secondary/40 transition-colors text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-medium text-ink">{s.sector}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <SentimentBadge sentiment={s.sentiment} />
                    <ChevronDown
                      className={cn(
                        "size-3.5 text-ink-subtle transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </div>
                </button>

                {/* Expandable detail */}
                {isOpen && (
                  <div className="px-6 pb-4 pt-1 bg-secondary/20 border-t border-hairline">
                    <p className="text-[12.5px] text-ink-muted leading-relaxed text-pretty mb-3">
                      {s.reason}
                    </p>
                    {s.topSymbols.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.topSymbols.map((sym) => (
                          <Link
                            key={sym}
                            to="/research/$symbol"
                            params={{ symbol: sym }}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-surface-raised ring-1 ring-hairline text-ink hover:text-accent hover:ring-accent/40 transition-colors"
                          >
                            {sym}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarketNewsList() {
  const { data: articles = [], isPending, isError, refetch } = useMarketNews(8);
  return (
    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface-raised">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-eyebrow text-ink-subtle">Market News</h3>
        {!isPending && (
          <span className="text-[10px] font-mono text-ink-subtle tracking-wide uppercase">Live</span>
        )}
      </div>
      {isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-4">
          <p className="text-xs text-ink-muted mb-2">Couldn't load news.</p>
          <button
            onClick={() => refetch()}
            className="text-xs text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      ) : articles.length === 0 ? (
        <p className="text-xs text-ink-muted">No recent articles found.</p>
      ) : (
        <ul className="space-y-4">
          {articles.map((article) => (
            <li key={article.url}>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <p className="text-[12.5px] text-ink leading-snug group-hover:text-accent transition-colors line-clamp-2">
                  {article.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-ink-subtle truncate">
                    {article.source}
                  </span>
                  {article.ageLabel && (
                    <span className="text-[10px] font-mono text-ink-subtle shrink-0">
                      · {article.ageLabel}
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiscoverFeedSkeleton() {
  return (
    <div className="space-y-16">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-4 w-40 mb-6" />
          <CompanyCardGridSkeleton count={2} />
        </div>
      ))}
    </div>
  );
}
