import { useQuery } from "@tanstack/react-query";
import { fetchJournalEntries } from "@/features/journal/api/journal";
import { queryKeys } from "@/shared/hooks/queryKeys";

export function useJournalEntries() {
  return useQuery({ queryKey: queryKeys.journalEntries, queryFn: fetchJournalEntries });
}
