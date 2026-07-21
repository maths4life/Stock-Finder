import { ApiError } from "@/shared/api/client";
import type {
  JournalReview,
  JournalReviewInput,
  JournalReviewUpdateInput,
} from "@/shared/api/types";

const API_URL = "http://127.0.0.1:8000";

/** GET /journal-reviews — every review across every entry. The journal
 * page groups these by `entryId` client-side, the same way it already
 * joins entries to companies via a Map instead of a server-side join. */
export async function fetchJournalReviews(): Promise<JournalReview[]> {
  const response = await fetch(`${API_URL}/journal-reviews`);

  if (!response.ok) {
    throw new ApiError("Failed to fetch journal reviews", response.status);
  }

  return response.json();
}

/** POST /journal-reviews */
export async function createJournalReview(input: JournalReviewInput): Promise<JournalReview> {
  const response = await fetch(`${API_URL}/journal-reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to create journal review", response.status);
  }

  return response.json();
}

/** PUT /journal-reviews/{id} */
export async function updateJournalReview(
  id: string,
  input: JournalReviewUpdateInput,
): Promise<JournalReview> {
  const response = await fetch(`${API_URL}/journal-reviews/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to update journal review", response.status);
  }

  return response.json();
}

/** DELETE /journal-reviews/{id} */
export async function deleteJournalReview(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/journal-reviews/${id}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to delete journal review", response.status);
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
