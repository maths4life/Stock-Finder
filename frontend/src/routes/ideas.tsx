import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { Sparkline } from "@/shared/components/common/Sparkline";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { EmptyState } from "@/shared/components/common/EmptyState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { usePipeline } from "@/features/market/hooks/useDiscover";
import { useCompaniesForSymbols } from "@/features/company/hooks/useCompaniesForSymbols";
import { fetchPipeline } from "@/features/market/api/market";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { PipelineColumn } from "@/shared/api/types";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/ideas")({
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: queryKeys.pipeline, queryFn: fetchPipeline }),
  head: () => ({
    meta: [
      { title: "Ideas Pipeline — Quant" },
      { name: "description", content: "Watching, researching, conviction. Every idea in one board." },
    ],
  }),
  component: Ideas,
});

const stageHint: Record<PipelineColumn["stage"], { hint: string; color: string }> = {
  Watching: { hint: "Something caught your attention", color: "bg-hairline-strong" },
  Researching: { hint: "Building the thesis", color: "bg-[oklch(0.65_0.14_75)]" },
  Conviction: { hint: "Ready to hold for 6–12 months", color: "bg-positive" },
};

function Ideas() {
  const { data: columns = [], isPending, isError, refetch } = usePipeline();

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-24">
        <PageHeader
          eyebrow="Ideas board"
          title="Every idea in one place, moving forward."
          description="Watchlist and journal, merged. Track meaningful change, not price ticks."
          className="mb-12"
        />

        {isPending && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-28" />
                {Array.from({ length: 2 }).map((_, j) => (
                  <Skeleton key={j} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </div>
        )}

        {isError && <ErrorState description="Couldn't load your pipeline." onRetry={() => refetch()} />}

        {!isPending && !isError && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {columns.map((col) => (
              <PipelineColumnView key={col.stage} column={col} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PipelineColumnView({ column: col }: { column: PipelineColumn }) {
  const meta = stageHint[col.stage];
  const { data: companies = [] } = useCompaniesForSymbols(col.items.map((i) => i.symbol));
  const companyBySymbol = new Map(companies.map((c) => [c.symbol, c]));

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={"size-1.5 rounded-full " + meta.color} />
          <h2 className="text-eyebrow text-ink">{col.stage}</h2>
          <span className="text-[11px] font-mono text-ink-subtle">{col.items.length}</span>
        </div>
      </div>
      <p className="text-xs text-ink-subtle mb-4">{meta.hint}</p>

      <div className="space-y-3">
        {col.items.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="Nothing here yet"
            description={`Move a company to "${col.stage}" from its research page.`}
            className="py-8 rounded-xl border border-dashed border-hairline-strong"
          />
        )}
        {col.items.map((item) => {
          const c = companyBySymbol.get(item.symbol);
          if (!c) return null;
          const positive = c.changePct >= 0;
          return (
            <Link
              key={item.symbol}
              to="/research/$symbol"
              params={{ symbol: item.symbol }}
              className="block p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-card-hover transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-heading-md group-hover:text-accent transition-colors">{c.name}</p>
                  <p className="font-mono text-[10px] text-ink-subtle mt-1">
                    {c.exchange}:{c.symbol}
                  </p>
                </div>
                <Sparkline data={c.spark} tone={positive ? "positive" : "negative"} width={60} height={24} />
              </div>
              <p className="text-xs text-ink-muted leading-snug mb-3">"{item.note}"</p>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-ink-subtle">
                <span>{item.ago}</span>
                <span className={positive ? "text-positive" : "text-negative"}>
                  {positive ? "▲" : "▼"} {Math.abs(c.changePct).toFixed(2)}%
                </span>
              </div>
            </Link>
          );
        })}

        <button className="w-full py-3 rounded-xl border border-dashed border-hairline-strong text-xs text-ink-subtle hover:text-ink hover:border-accent transition-colors">
          + Add company
        </button>
      </div>
    </div>
  );
}
