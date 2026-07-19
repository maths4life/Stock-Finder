import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntries,
  updateJournalEntry,
} from "@/features/journal/api/journal";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { JournalEntryInput } from "@/shared/api/types";

export function useJournalEntries() {
  return useQuery({ queryKey: queryKeys.journalEntries, queryFn: fetchJournalEntries });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JournalEntryInput) => createJournalEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries });
      toast.success("Thesis saved to your journal.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't save that entry. Try again.");
    },
  });
}

export function useUpdateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: JournalEntryInput }) => updateJournalEntry(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries });
      toast.success("Entry updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update that entry. Try again.");
    },
  });
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJournalEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries });
      toast.success("Entry deleted.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't delete that entry. Try again.");
    },
  });
}
