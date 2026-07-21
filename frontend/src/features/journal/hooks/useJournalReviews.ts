import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createJournalReview,
  deleteJournalReview,
  fetchJournalReviews,
  updateJournalReview,
} from "@/features/journal/api/journalReviews";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { JournalReviewInput, JournalReviewUpdateInput } from "@/shared/api/types";

export function useJournalReviews() {
  return useQuery({ queryKey: queryKeys.journalReviews, queryFn: fetchJournalReviews });
}

export function useCreateJournalReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JournalReviewInput) => createJournalReview(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalReviews });
      toast.success("Review saved.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't save that review. Try again.");
    },
  });
}

export function useUpdateJournalReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: JournalReviewUpdateInput }) =>
      updateJournalReview(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalReviews });
      toast.success("Review updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update that review. Try again.");
    },
  });
}

export function useDeleteJournalReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournalReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalReviews });
      toast.success("Review deleted.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't delete that review. Try again.");
    },
  });
}
