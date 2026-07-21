import { ApiError } from "@/shared/api/client";
import type { JournalEntry, JournalEntryInput } from "@/shared/api/types";

const API_URL = "http://127.0.0.1:8000";

/** GET /journal-entries */
export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  const response = await fetch(`${API_URL}/journal-entries`);

  if (!response.ok) {
    throw new ApiError("Failed to fetch journal entries", response.status);
  }

  return response.json();
}

/** POST /journal-entries */
export async function createJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
  const response = await fetch(`${API_URL}/journal-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to create journal entry", response.status);
  }

  return response.json();
}

/** PUT /journal-entries/{id} */
export async function updateJournalEntry(id: string, input: JournalEntryInput): Promise<JournalEntry> {
  const response = await fetch(`${API_URL}/journal-entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to update journal entry", response.status);
  }

  return response.json();
}

/** DELETE /journal-entries/{id} */
export async function deleteJournalEntry(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/journal-entries/${id}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to delete journal entry", response.status);
  }
}

/** FastAPI's HTTPException body is `{ detail: string }` — surface it in
 * the toast/error UI instead of a generic message when present. */
async function safeErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    return typeof body?.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}
