import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/shared/components/layout/AppShell";
import { CompanyCard } from "@/features/company/components/CompanyCard";
import { CompanyRow } from "@/features/company/components/CompanyRow";
import { SentimentBadge } from "@/shared/components/common/Badge";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { CompanyCardGridSkeleton } from "@/shared/components/common/Skeletons";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCompaniesForSymbols } from "@/features/company/hooks/useCompaniesForSymbols";
import { useDiscoverGroups, useMarketIndicators, usePipeline, useSectorPulse } from "@/features/market/hooks/useDiscover";
import { fetchDiscoverGroups } from "@/features/market/api/market";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { DiscoverGroup } from "@/shared/api/types";
import { ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: queryKeys.discoverGroups, queryFn: fetchDiscoverGroups }),
  head: () => ({
    meta: [
      { title: "Stock Trackr" },
      {
        name: "description",
        content: "Today's most researchable Indian companies, grouped by why they matter.",
      },
      { property: "og:title", content: "Stock Trackr" },
      {
        property: "og:description",
        content: "A calm briefing on the Indian companies worth your attention today.",
      },
    ],
  }),
  component: Discover,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatToday() {
  const d = new Date();
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function Discover() {
  const groupsQuery = useDiscoverGroups();

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-24">
        <header className="mb-14 animate-fade-up">
          <p className="text-eyebrow text-accent mb-2">{formatToday()}</p>
          <h1 className="text-display md:text-display-lg text-balance max-w-[22ch]">
            Which companies deserve your attention today?
          </h1>
          <p className="mt-5 text-base text-ink-muted max-w-xl leading-relaxed">
            Eight companies surfaced across four narratives. Take twenty minutes.
            Add one to your pipeline, or move on.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-x-12 gap-y-16">
          {/* Feed */}
          <div className="col-span-12 lg:col-span-8 space-y-16">
            {groupsQuery.isPending && <DiscoverFeedSkeleton />}
            {groupsQuery.isError && (
              <ErrorState description="Couldn't load today's briefing." onRetry={() => groupsQuery.refetch()} />
            )}
            {groupsQuery.data?.map((group, gi) => (
              <DiscoverGroupSection key={group.id} group={group} index={gi} />
            ))}
          </div>

          {/* Sidebar */}
          <aside className="col-span-12 lg:col-span-4 space-y-8">
            <PipelinePreview />
            <SectorPulseList />
            <MarketContextList />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {companies.map((c) => (
            <CompanyCard key={c.symbol} company={c} />
          ))}
        </div>
      ) : (
        <div>
          {companies.map((c) => (
            <CompanyRow key={c.symbol} company={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function PipelinePreview() {
  const { data: columns = [], isPending } = usePipeline();
  const { data: companies = [] } = useCompaniesForSymbols(columns.flatMap((c) => c.items.map((i) => i.symbol)));
  const companyBySymbol = new Map(companies.map((c) => [c.symbol, c]));

  const stageColor: Record<string, string> = {
    Watching: "bg-hairline-strong",
    Researching: "bg-[oklch(0.65_0.14_75)]",
    Conviction: "bg-positive",
  };

  return (
    <div className="p-6 rounded-xl ring-1 ring-hairline bg-secondary/40 border-t-2 border-accent animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-eyebrow text-ink-subtle">Active Pipeline</h3>
        <Link to="/ideas" className="text-[11px] text-accent hover:underline underline-offset-2">
          Full board
        </Link>
      </div>
      {isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {columns.flatMap((stage) =>
            stage.items.map((item) => {
              const c = companyBySymbol.get(item.symbol);
              if (!c) return null;
              return (
                <Link key={item.symbol + stage.stage} to="/research/$symbol" params={{ symbol: item.symbol }} className="flex gap-4 group">
                  <div className={"w-1 rounded-full shrink-0 " + stageColor[stage.stage]} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-ink-subtle font-medium">{stage.stage}</p>
                    <p className="text-sm font-medium mt-0.5 group-hover:text-accent transition-colors">{c.name}</p>
                    <p className="text-[11px] text-ink-subtle mt-1 truncate">
                      {item.note} · {item.ago}
                    </p>
                  </div>
                </Link>
              );
            }),
          )}
        </div>
      )}
      <Link
        to="/ideas"
        className="mt-6 w-full py-2 px-3 flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:brightness-110 transition-all"
      >
        Open Pipeline
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}

function SectorPulseList() {
  const { data: sectors = [], isPending } = useSectorPulse();
  return (
    <div>
      <h3 className="text-eyebrow text-ink-subtle mb-3">Top Sectors</h3>
      {isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {sectors.map((s) => (
            <div key={s.sector}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{s.sector}</span>
                <SentimentBadge sentiment={s.sentiment} />
              </div>
              <p className="mt-1 text-[12px] text-ink-muted leading-snug text-pretty">{s.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MarketContextList() {
  const { data: indicators = [], isPending } = useMarketIndicators();
  return (
    <div>
      <h3 className="text-eyebrow text-ink-subtle mb-3">Market Context</h3>
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
                <span className={"ml-2 text-[11px] font-mono " + (m.tone === "positive" ? "text-positive" : "text-ink-subtle")}>
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
