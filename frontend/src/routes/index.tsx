import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, TrendingUp, TrendingDown, ArrowUpRight, Radio } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/shared/components/layout/AppShell";
import { SentimentBadge } from "@/shared/components/common/Badge";
import { ErrorState } from "@/shared/components/common/ErrorState";
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
import type { Company, DiscoverGroup, SectorPulse } from "@/shared/api/types";

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
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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
        {/* ── Hero header ── */}
        <header className="mb-14 animate-fade-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-eyebrow text-accent mb-3">{formatToday()}</p>
            <h1 className="text-heading-xl md:text-display text-balance max-w-[26ch]">
              Today's shortlist
            </h1>
            <p className="mt-3 text-base text-ink-muted max-w-lg leading-relaxed">
              Indian equities worth a second look today, grouped by why they qualify.
            </p>
          </div>
          <DataFreshness />
        </header>

        <div className="grid grid-cols-12 gap-x-12 gap-y-16">
          {/* ── Main feed ── */}
          <div className="col-span-12 lg:col-span-8 space-y-14">
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

          {/* ── Sidebar ── */}
          <aside className="col-span-12 lg:col-span-4 space-y-6">
            <MarketContextWidget />
            <SectorPulseWidget />
            <MarketNewsWidget />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed section
// ─────────────────────────────────────────────────────────────────────────────

function DiscoverGroupSection({ group, index }: { group: DiscoverGroup; index: number }) {
  const { data: companies = [], isPending } = useCompaniesForSymbols(group.symbols);

  return (
    <section className="animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-ink tracking-tight">{group.label}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{group.tagline}</p>
        </div>
        <span className="text-xs font-mono text-ink-subtle bg-secondary px-2 py-0.5 rounded-full">
          {group.symbols.length} names
        </span>
      </div>

      {/* Content */}
      {isPending ? (
        <div className="space-y-px rounded-xl overflow-hidden ring-1 ring-hairline">
          {Array.from({ length: group.symbols.length || 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4 bg-surface-raised">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : group.layout === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((c, i) => (
            <CompactCard key={c.symbol} company={c} index={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden ring-1 ring-hairline divide-y divide-hairline bg-surface-raised">
          {companies.map((c, i) => (
            <CompactRow key={c.symbol} company={c} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Premium compact card for grid layout */
function CompactCard({ company: c, index }: { company: Company; index: number }) {
  const positive = c.changePct >= 0;
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className="group relative block rounded-xl bg-surface-raised ring-1 ring-hairline hover:ring-hairline-strong hover:shadow-card-hover transition-all duration-200 overflow-hidden"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Subtle top accent stripe */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-0.5 transition-opacity opacity-0 group-hover:opacity-100",
          positive ? "bg-positive" : "bg-negative",
        )}
      />

      <div className="p-5">
        {/* Name + symbol */}
        <div className="mb-4">
          <p className="text-[15px] font-semibold text-ink leading-tight group-hover:text-accent transition-colors truncate">
            {c.name}
          </p>
          <p className="font-mono text-[11px] text-ink-subtle mt-1">
            {c.exchange}:{c.symbol} · {c.sector}
          </p>
        </div>

        {/* Price row */}
        <div className="flex items-end justify-between">
          <div className="font-mono text-2xl font-semibold text-ink tabular-nums">
            ₹{c.price.toLocaleString("en-IN")}
          </div>
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-semibold tabular-nums",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {positive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {positive ? "+" : ""}{c.changePct.toFixed(2)}%
          </div>
        </div>

        {/* Market cap */}
        <p className="text-[11px] font-mono text-ink-subtle mt-2">{c.marketCap}</p>
      </div>

      {/* Arrow indicator */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowUpRight className="size-4 text-accent" />
      </div>
    </Link>
  );
}

/** Premium compact row for list layout */
function CompactRow({ company: c, index }: { company: Company; index: number }) {
  const positive = c.changePct >= 0;
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className="group flex items-center justify-between px-5 py-4 hover:bg-secondary/40 transition-colors"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Left: name + meta */}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink group-hover:text-accent transition-colors truncate">
          {c.name}
        </p>
        <p className="font-mono text-[11px] text-ink-subtle mt-0.5">
          {c.exchange}:{c.symbol} · <span className="uppercase tracking-wider">{c.sector}</span>
        </p>
      </div>

      {/* Right: price + change */}
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <div className="text-right">
          <p className="font-mono text-[15px] font-semibold text-ink tabular-nums">
            ₹{c.price.toLocaleString("en-IN")}
          </p>
          <p className="text-[11px] font-mono text-ink-subtle tabular-nums">{c.marketCap}</p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-semibold tabular-nums min-w-[60px] justify-end",
            positive ? "text-positive" : "text-negative",
          )}
        >
          {positive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {positive ? "+" : ""}{c.changePct.toFixed(2)}%
        </div>
        <ArrowUpRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar widgets
// ─────────────────────────────────────────────────────────────────────────────

function WidgetShell({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl ring-1 ring-hairline bg-surface-raised overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 hairline-b">
        <h3 className="text-sm font-semibold text-ink tracking-tight">{title}</h3>
        {badge}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MarketContextWidget() {
  const { data: indicators = [], isPending } = useMarketIndicators();
  return (
    <WidgetShell title="Market Context">
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-hairline">
          {indicators.map((m) => (
            <div key={m.label} className="flex items-center justify-between py-2.5">
              <span className="text-[13px] text-ink-muted">{m.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[14px] font-medium text-ink tabular-nums">{m.value}</span>
                <span
                  className={cn(
                    "text-[12px] font-mono tabular-nums",
                    m.tone === "positive" ? "text-positive" : m.tone === "negative" ? "text-negative" : "text-ink-subtle",
                  )}
                >
                  {m.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}

function SectorPulseWidget() {
  const { data: sectors = [], isPending } = useSectorPulse();
  const [openSector, setOpenSector] = useState<string | null>(null);

  function toggle(sector: string) {
    setOpenSector((prev) => (prev === sector ? null : sector));
  }

  return (
    <div className="rounded-xl ring-1 ring-hairline bg-surface-raised overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 hairline-b">
        <h3 className="text-sm font-semibold text-ink tracking-tight">Top Sectors</h3>
      </div>
      {isPending ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {sectors.map((s: SectorPulse) => {
            const isOpen = openSector === s.sector;
            return (
              <div key={s.sector}>
                <button
                  id={`sector-${s.sector.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => toggle(s.sector)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/40 transition-colors text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-[14px] font-medium text-ink">{s.sector}</span>
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

                {isOpen && (
                  <div className="px-5 pb-4 pt-2 bg-secondary/20 border-t border-hairline">
                    <p className="text-[13px] text-ink-muted leading-relaxed text-pretty mb-3">
                      {s.reason}
                    </p>
                    {s.topSymbols.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.topSymbols.map((sym) => (
                          <Link
                            key={sym}
                            to="/research/$symbol"
                            params={{ symbol: sym }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-mono font-medium bg-surface-raised ring-1 ring-hairline text-ink hover:text-accent hover:ring-accent/40 transition-colors"
                          >
                            {sym}
                            <ArrowUpRight className="size-3 opacity-50" />
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

function MarketNewsWidget() {
  const { data: articles = [], isPending, isError, refetch } = useMarketNews(8);
  return (
    <WidgetShell
      title="Market News"
      badge={
        !isPending && (
          <div className="flex items-center gap-1.5">
            <Radio className="size-3 text-positive animate-pulse" />
            <span className="text-[11px] font-medium text-positive">Live</span>
          </div>
        )
      }
    >
      {isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-4">
          <p className="text-sm text-ink-muted mb-2">Couldn't load news.</p>
          <button onClick={() => refetch()} className="text-sm text-accent hover:underline">
            Retry
          </button>
        </div>
      ) : articles.length === 0 ? (
        <p className="text-sm text-ink-muted">No recent articles found.</p>
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
                <p className="text-[13.5px] text-ink leading-snug group-hover:text-accent transition-colors line-clamp-2">
                  {article.title}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-ink-subtle truncate">
                    {article.source}
                  </span>
                  {article.ageLabel && (
                    <span className="text-[11px] font-mono text-ink-subtle shrink-0">
                      · {article.ageLabel}
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function DiscoverFeedSkeleton() {
  return (
    <div className="space-y-14">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="rounded-xl overflow-hidden ring-1 ring-hairline divide-y divide-hairline">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between px-5 py-4 bg-surface-raised">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <div className="flex gap-6">
                  <div className="space-y-1.5 text-right">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <Skeleton className="h-4 w-14" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
