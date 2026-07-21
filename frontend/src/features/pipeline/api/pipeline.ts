import { ApiError } from "@/shared/api/client";
import type { PipelineItemDetail, PipelineItemInput, PipelineStage } from "@/shared/api/types";

const API_URL = "http://127.0.0.1:8000";

/**
 * Per-item pipeline CRUD (Milestone 3). Distinct from `fetchPipeline` in
 * `features/market/api/market.ts`, which calls the pre-existing grouped
 * `GET /pipeline` and is left untouched for backward compatibility — this
 * file is additive, backing the new `/pipeline-items` write endpoints.
 */

/** POST /pipeline-items */
export async function createPipelineItem(input: PipelineItemInput): Promise<PipelineItemDetail> {
  const response = await fetch(`${API_URL}/pipeline-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to create pipeline item", response.status);
  }

  return response.json();
}

/** PUT /pipeline-items/{id} */
export async function updatePipelineItem(id: string, input: PipelineItemInput): Promise<PipelineItemDetail> {
  const response = await fetch(`${API_URL}/pipeline-items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to update pipeline item", response.status);
  }

  return response.json();
}

/** PATCH /pipeline-items/{id}/stage — moves a card between columns. */
export async function movePipelineItemStage(id: string, stage: PipelineStage): Promise<PipelineItemDetail> {
  const response = await fetch(`${API_URL}/pipeline-items/${id}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to move pipeline item", response.status);
  }

  return response.json();
}

/** DELETE /pipeline-items/{id} */
export async function deletePipelineItem(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/pipeline-items/${id}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(detail ?? "Failed to delete pipeline item", response.status);
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
