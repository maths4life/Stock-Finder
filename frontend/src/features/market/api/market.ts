import { API_URL } from "@/shared/api/config";
import { ApiError } from "@/shared/api/client";
import type { DiscoverGroup, MarketIndicator, PipelineColumn, SectorPulse } from "@/shared/api/types";

/** GET /discover/groups */
export async function fetchDiscoverGroups(): Promise<DiscoverGroup[]> {
  const response = await fetch(`${API_URL}/discover/groups`);

  if (!response.ok) {
    throw new ApiError("Failed to fetch discover groups", response.status);
  }

  return response.json();
}

/** GET /pipeline */
export async function fetchPipeline(): Promise<PipelineColumn[]> {
  const response = await fetch(`${API_URL}/pipeline`);

  if (!response.ok) {
    throw new ApiError("Failed to fetch pipeline", response.status);
  }

  return response.json();
}

/** GET /sectors/pulse */
export async function fetchSectorPulse(): Promise<SectorPulse[]> {
  const response = await fetch(`${API_URL}/sectors/pulse`);

  if (!response.ok) {
    throw new ApiError("Failed to fetch sector pulse", response.status);
  }

  return response.json();
}

/** GET /market/indicators */
export async function fetchMarketIndicators(): Promise<MarketIndicator[]> {
  const response = await fetch(`${API_URL}/market/indicators`);

  if (!response.ok) {
    throw new ApiError("Failed to fetch market indicators", response.status);
  }

  return response.json();
}
