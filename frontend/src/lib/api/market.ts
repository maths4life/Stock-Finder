import { resolveMock } from "./client";
import { discoverGroupRecords, marketIndicatorRecords, pipelineRecords, sectorPulseRecords } from "./mock/market.data";
import type { DiscoverGroup, MarketIndicator, PipelineColumn, SectorPulse } from "./types";

/** GET /discover/groups */
export function fetchDiscoverGroups(): Promise<DiscoverGroup[]> {
  return resolveMock(() => discoverGroupRecords);
}

/** GET /pipeline */
export function fetchPipeline(): Promise<PipelineColumn[]> {
  return resolveMock(() => pipelineRecords);
}

/** GET /sectors/pulse */
export function fetchSectorPulse(): Promise<SectorPulse[]> {
  return resolveMock(() => sectorPulseRecords);
}

/** GET /market/indicators */
export function fetchMarketIndicators(): Promise<MarketIndicator[]> {
  return resolveMock(() => marketIndicatorRecords);
}
