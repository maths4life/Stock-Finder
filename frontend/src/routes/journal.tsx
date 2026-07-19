import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Trash2, NotebookPen } from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { StatMetric } from "@/shared/components/common/StatMetric";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { EmptyState } from "@/shared/components/common/EmptyState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
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
import { useJournalEntries, useDeleteJournalEntry } from "@/features/journal/hooks/useJournalEntries";
import { useCompaniesForSymbols } from "@/features/company/hooks/useCompaniesForSymbols";
import { fetchJournalEntries } from "@/features/journal/api/journal";
import { JournalEntryForm } from "@/features/journal/components/JournalEntryForm";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { JournalEntry } from "@/shared/api/types";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Journal() {
  const { data: entries = [], isPending, isError, refetch } = useJournalEntries();
  const { data: companies = [] } = useCompaniesForSymbols(entries.map((e) => e.symbol));
  const companyBySymbol = new Map(companies.map((c) => [c.symbol, c]));
  const deleteMutation = useDeleteJournalEntry();

  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>(undefined);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function openCreate() {
    setEditingEntry(undefined);
    setFormOpen(true);
  }

  function openEdit(entry: JournalEntry) {
    setEditingEntry(entry);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId);
      setPendingDeleteId(null);
    }
  }

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
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-ink-subtle">{formatDate(e.createdAt)}</span>
                      <button
                        aria-label="Edit entry"
                        onClick={() => openEdit(e)}
                        className="text-ink-subtle hover:text-ink transition-colors"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        aria-label="Delete entry"
                        onClick={() => setPendingDeleteId(e.id)}
                        className="text-ink-subtle hover:text-negative transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <h2 className="text-heading-xl text-balance">{e.title || e.symbol}</h2>

                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6 hairline-b pb-6">
                    <StatMetric label="Conviction" value={e.confidenceLevel != null ? `${e.confidenceLevel}/5` : "—"} />
                    <StatMetric
                      label="Target Price"
                      value={e.targetPrice != null ? `₹${e.targetPrice.toLocaleString("en-IN")}` : "—"}
                    />
                    <StatMetric
                      label="Expected Return"
                      value={e.expectedReturnPct != null ? `${e.expectedReturnPct}%` : "—"}
                    />
                    <StatMetric label="Horizon" value={e.horizonMonths != null ? `${e.horizonMonths} months` : "—"} />
                  </div>

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Thesis</p>
                    <p className="text-[15px] leading-relaxed text-ink text-pretty">{e.thesis}</p>
                  </div>

                  {(e.fundamentalReasons || e.technicalReasons || e.sectorReasons || e.macroReasons) && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Reasons</p>
                      <ul className="space-y-1.5">
                        {e.fundamentalReasons && (
                          <li className="text-[15px] text-ink flex gap-3">
                            <span className="text-accent">→</span> {e.fundamentalReasons}
                          </li>
                        )}
                        {e.technicalReasons && (
                          <li className="text-[15px] text-ink flex gap-3">
                            <span className="text-accent">→</span> {e.technicalReasons}
                          </li>
                        )}
                        {e.sectorReasons && (
                          <li className="text-[15px] text-ink flex gap-3">
                            <span className="text-accent">→</span> {e.sectorReasons}
                          </li>
                        )}
                        {e.macroReasons && (
                          <li className="text-[15px] text-ink flex gap-3">
                            <span className="text-accent">→</span> {e.macroReasons}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {e.risksAccepted && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Risks</p>
                      <p className="text-[15px] text-ink-muted leading-relaxed text-pretty">{e.risksAccepted}</p>
                    </div>
                  )}

                  {e.assumptions && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Assumptions</p>
                      <p className="text-[15px] text-ink-muted leading-relaxed text-pretty">{e.assumptions}</p>
                    </div>
                  )}

                  {e.sellTrigger && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">What would make you sell</p>
                      <p className="text-[15px] text-ink-muted leading-relaxed text-pretty">{e.sellTrigger}</p>
                    </div>
                  )}

                  {e.personalNotes && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Personal notes</p>
                      <p className="text-[15px] text-ink-muted leading-relaxed text-pretty">{e.personalNotes}</p>
                    </div>
                  )}

                  {e.reviewDueAt && (
                    <div className="mt-6 flex items-center gap-2 text-[11px] text-ink-subtle">
                      <span className="size-1.5 rounded-full bg-accent" />
                      Review reopens {formatDate(e.reviewDueAt)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <Button
          variant="outline"
          onClick={openCreate}
          className="w-full mt-10 py-6 rounded-xl border-dashed border-hairline-strong text-sm font-medium text-ink-subtle hover:text-ink hover:border-accent transition-colors"
        >
          + Start a new thesis
        </Button>
      </div>

      <JournalEntryForm open={formOpen} onOpenChange={setFormOpen} entry={editingEntry} />

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the journal entry. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
