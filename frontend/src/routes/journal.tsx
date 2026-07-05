import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatMetric } from "@/components/common/StatMetric";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useJournalEntries } from "@/hooks/useJournalEntries";
import { useCompaniesForSymbols } from "@/hooks/useCompaniesForSymbols";
import { fetchJournalEntries } from "@/lib/api/journal";
import { queryKeys } from "@/hooks/queryKeys";
import { NotebookPen } from "lucide-react";

export const Route = createFileRoute("/journal")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: queryKeys.journalEntries, queryFn: fetchJournalEntries }),
  head: () => ({
    meta: [
      { title: "Journal — Quant" },
      { name: "description", content: "Record every thesis. Review, learn, compound." },
    ],
  }),
  component: Journal,
});

function Journal() {
  const { data: entries = [], isPending, isError, refetch } = useJournalEntries();
  const { data: companies = [] } = useCompaniesForSymbols(entries.map((e) => e.symbol));
  const companyBySymbol = new Map(companies.map((c) => [c.symbol, c]));

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-12 pb-24">
        <PageHeader
          eyebrow="Research journal"
          title="Write down what you believe, and why."
          description="The most under-rated tool in investing. Six months from now, you'll be glad you did."
          className="mb-14"
        />

        {isPending && (
          <div className="space-y-10">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-9 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        )}

        {isError && <ErrorState description="Couldn't load your journal." onRetry={() => refetch()} />}

        {!isPending && !isError && entries.length === 0 && (
          <EmptyState icon={NotebookPen} title="No entries yet" description="Start a thesis on any research page to see it here." />
        )}

        {!isPending && !isError && entries.length > 0 && (
          <div className="space-y-14">
            {entries.map((e) => {
              const c = companyBySymbol.get(e.symbol);
              return (
                <article key={e.id} className="hairline-b pb-14 last:border-b-0 animate-fade-up">
                  <div className="flex items-baseline justify-between mb-3">
                    <Link
                      to="/research/$symbol"
                      params={{ symbol: e.symbol }}
                      className="text-[11px] uppercase tracking-widest text-accent hover:underline underline-offset-2"
                    >
                      {c ? `${c.name} · ${c.exchange}:${c.symbol}` : e.symbol}
                    </Link>
                    <span className="text-[11px] font-mono text-ink-subtle">{e.date}</span>
                  </div>
                  <h2 className="text-heading-xl text-balance">{e.title}</h2>

                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6 hairline-b pb-6">
                    <StatMetric label="Conviction" value={`${e.conviction}/5`} />
                    <StatMetric label="Target Price" value={`₹${e.targetPrice.toLocaleString("en-IN")}`} />
                    <StatMetric label="Expected Return" value={`${e.expectedReturnPct}%`} />
                    <StatMetric label="Horizon" value={`${e.horizonMonths} months`} />
                  </div>

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Thesis</p>
                    <p className="text-[15px] leading-relaxed text-ink text-pretty">{e.thesis}</p>
                  </div>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Catalysts</p>
                    <ul className="space-y-1.5">
                      {e.catalysts.map((cat) => (
                        <li key={cat} className="text-[15px] text-ink flex gap-3">
                          <span className="text-accent">→</span> {cat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Risks</p>
                    <ul className="space-y-1.5">
                      {e.risks.map((r) => (
                        <li key={r} className="text-[15px] text-ink-muted flex gap-3">
                          <span className="text-negative">×</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">What would make you sell</p>
                    <p className="text-[15px] text-ink-muted leading-relaxed text-pretty">{e.sellTrigger}</p>
                  </div>

                  <div className="mt-6 flex items-center gap-2 text-[11px] text-ink-subtle">
                    <span className="size-1.5 rounded-full bg-accent" />
                    Review reopens {e.reviewDue}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <button className="w-full mt-10 py-6 rounded-xl border border-dashed border-hairline-strong text-sm font-medium text-ink-subtle hover:text-ink hover:border-accent transition-colors">
          + Start a new thesis
        </button>
      </div>
    </AppShell>
  );
}
