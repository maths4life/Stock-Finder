import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { Sparkline } from "@/shared/components/common/Sparkline";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { EmptyState } from "@/shared/components/common/EmptyState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { usePipeline } from "@/features/market/hooks/useDiscover";
import { useCompaniesForSymbols } from "@/features/company/hooks/useCompaniesForSymbols";
import { fetchPipeline } from "@/features/market/api/market";
import { PipelineItemForm } from "@/features/pipeline/components/PipelineItemForm";
import { useDeletePipelineItem, useMovePipelineItemStage } from "@/features/pipeline/hooks/usePipelineItems";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { PipelineColumn, PipelineItem, PipelineStage } from "@/shared/api/types";
import { Inbox, MoreVertical } from "lucide-react";

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

const STAGES: PipelineStage[] = ["Watching", "Researching", "Conviction"];

const stageHint: Record<PipelineStage, { hint: string; color: string }> = {
  Watching: { hint: "Something caught your attention", color: "bg-hairline-strong" },
  Researching: { hint: "Building the thesis", color: "bg-[oklch(0.65_0.14_75)]" },
  Conviction: { hint: "Ready to hold for 6–12 months", color: "bg-positive" },
};

function Ideas() {
  const { data: columns = [], isPending, isError, refetch } = usePipeline();

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PipelineItem | undefined>(undefined);
  const [editingItemStage, setEditingItemStage] = useState<PipelineStage | undefined>(undefined);
  const [createStage, setCreateStage] = useState<PipelineStage>("Watching");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const moveMutation = useMovePipelineItemStage();
  const deleteMutation = useDeletePipelineItem();

  function openCreate(stage: PipelineStage) {
    setEditingItem(undefined);
    setEditingItemStage(undefined);
    setCreateStage(stage);
    setFormOpen(true);
  }

  function openEdit(item: PipelineItem, stage: PipelineStage) {
    setEditingItem(item);
    setEditingItemStage(stage);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    deleteMutation.mutate(pendingDeleteId);
    setPendingDeleteId(null);
  }

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
              <PipelineColumnView
                key={col.stage}
                column={col}
                onAdd={() => openCreate(col.stage)}
                onEdit={(item) => openEdit(item, col.stage)}
                onMove={(item, stage) => moveMutation.mutate({ id: item.id, stage })}
                onDelete={(item) => setPendingDeleteId(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <PipelineItemForm
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editingItem}
        itemId={editingItem?.id}
        stage={editingItem ? editingItemStage : createStage}
      />

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this from your pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the pipeline item. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function PipelineColumnView({
  column: col,
  onAdd,
  onEdit,
  onMove,
  onDelete,
}: {
  column: PipelineColumn;
  onAdd: () => void;
  onEdit: (item: PipelineItem) => void;
  onMove: (item: PipelineItem, stage: PipelineStage) => void;
  onDelete: (item: PipelineItem) => void;
}) {
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
            description={`Add a company to "${col.stage}" to get started.`}
            className="py-8 rounded-xl border border-dashed border-hairline-strong"
          />
        )}
        {col.items.map((item) => {
          const c = companyBySymbol.get(item.symbol);
          if (!c) return null;
          const positive = c.changePct >= 0;
          return (
            <div
              key={item.id}
              className="relative p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-card-hover transition-all group"
            >
              <div className="absolute top-3 right-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-ink-subtle hover:text-ink"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(item)}>Edit note</DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {STAGES.filter((s) => s !== col.stage).map((s) => (
                          <DropdownMenuItem key={s} onClick={() => onMove(item, s)}>
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-negative focus:text-negative" onClick={() => onDelete(item)}>
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Link to="/research/$symbol" params={{ symbol: item.symbol }} className="block">
                <div className="flex items-start justify-between gap-3 mb-3 pr-8">
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
            </div>
          );
        })}

        <button
          onClick={onAdd}
          className="w-full py-3 rounded-xl border border-dashed border-hairline-strong text-xs text-ink-subtle hover:text-ink hover:border-accent transition-colors"
        >
          + Add company
        </button>
      </div>
    </div>
  );
}
