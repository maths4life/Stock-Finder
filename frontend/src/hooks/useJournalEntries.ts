import { useQuery } from "@tanstack/react-query";
import { fetchJournalEntries } from "@/lib/api/journal";
import { queryKeys } from "./queryKeys";

export function useJournalEntries() {
  return useQuery({ queryKey: queryKeys.journalEntries, queryFn: fetchJournalEntries });
}
