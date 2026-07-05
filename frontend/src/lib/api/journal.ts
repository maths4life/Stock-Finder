import { resolveMock } from "./client";
import { journalEntryRecords } from "./mock/journal.data";
import type { JournalEntry } from "./types";

/** GET /journal-entries */
export function fetchJournalEntries(): Promise<JournalEntry[]> {
  return resolveMock(() => [...journalEntryRecords].sort((a, b) => b.id.localeCompare(a.id)));
}
