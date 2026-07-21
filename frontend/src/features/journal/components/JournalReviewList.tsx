import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
import { useDeleteJournalReview } from "@/features/journal/hooks/useJournalReviews";
import { JournalReviewForm } from "@/features/journal/components/JournalReviewForm";
import type { JournalReview } from "@/shared/api/types";

const OUTCOME_LABEL: Record<NonNullable<JournalReview["thesisPlayedOut"]>, string> = {
  yes: "Played out as expected",
  partially: "Played out partially",
  no: "Did not play out",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface JournalReviewListProps {
  entryId: string;
  reviews: JournalReview[];
  /** ISO date the entry's review comes due — used only to prompt the
   * "+ Add review" affordance more prominently; purely presentational. */
  reviewDueAt: string | null;
}

export function JournalReviewList({ entryId, reviews, reviewDueAt }: JournalReviewListProps) {
  const deleteMutation = useDeleteJournalReview();
  const [formOpen, setFormOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<JournalReview | undefined>(undefined);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const isDue = reviewDueAt != null && new Date(reviewDueAt).getTime() <= Date.now();

  function openCreate() {
    setEditingReview(undefined);
    setFormOpen(true);
  }

  function openEdit(review: JournalReview) {
    setEditingReview(review);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId);
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8">
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">
        {reviews.length > 0 ? `Reviews (${reviews.length})` : "Review"}
      </p>

      <div className="space-y-6">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border border-hairline p-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] font-mono text-ink-subtle">
                {formatDate(r.reviewedAt)}
              </span>
              <div className="flex items-center gap-3">
                <button
                  aria-label="Edit review"
                  onClick={() => openEdit(r)}
                  className="text-ink-subtle hover:text-ink transition-colors"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  aria-label="Delete review"
                  onClick={() => setPendingDeleteId(r.id)}
                  className="text-ink-subtle hover:text-negative transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>

            {r.thesisPlayedOut && (
              <p className="text-[13px] font-medium text-ink mb-2">
                {OUTCOME_LABEL[r.thesisPlayedOut]}
              </p>
            )}

            {r.whatActuallyHappened && (
              <p className="text-[14px] leading-relaxed text-ink-muted text-pretty mb-2">
                {r.whatActuallyHappened}
              </p>
            )}

            {r.lessons && (
              <p className="text-[13px] leading-relaxed text-ink-subtle text-pretty">
                <span className="text-accent">Lesson —</span> {r.lessons}
              </p>
            )}

            {r.mistakes && (
              <p className="text-[13px] leading-relaxed text-ink-subtle text-pretty mt-1">
                <span className="text-accent">Mistake —</span> {r.mistakes}
              </p>
            )}

            {r.aiComparisonSummary && (
              <p className="text-[13px] leading-relaxed text-ink-subtle text-pretty mt-1">
                {r.aiComparisonSummary}
              </p>
            )}

            {r.wouldBuyAgain != null && (
              <p className="text-[11px] text-ink-subtle mt-2">
                Would buy again: {r.wouldBuyAgain ? "Yes" : "No"}
              </p>
            )}
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={openCreate}
          className={
            isDue
              ? "border-accent text-accent hover:bg-accent/10"
              : "border-dashed border-hairline-strong text-ink-subtle hover:text-ink hover:border-accent"
          }
        >
          {isDue ? "Review is due — record it" : "+ Add review"}
        </Button>
      </div>

      <JournalReviewForm
        open={formOpen}
        onOpenChange={setFormOpen}
        entryId={entryId}
        review={editingReview}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the review. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
