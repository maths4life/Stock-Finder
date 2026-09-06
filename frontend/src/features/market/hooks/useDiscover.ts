import { useQuery } from "@tanstack/react-query";
import {
  fetchDataFreshness,
  fetchDiscoverGroups,
  fetchMarketIndicators,
  fetchMarketNews,
  fetchPipeline,
  fetchSectorPulse,
} from "@/features/market/api/market";
import { queryKeys } from "@/shared/hooks/queryKeys";

export function useDiscoverGroups() {
  return useQuery({ queryKey: queryKeys.discoverGroups, queryFn: fetchDiscoverGroups });
}

export function usePipeline() {
  return useQuery({ queryKey: queryKeys.pipeline, queryFn: fetchPipeline });
}

export function useSectorPulse() {
  return useQuery({ queryKey: queryKeys.sectorPulse, queryFn: fetchSectorPulse });
}

export function useMarketIndicators() {
  return useQuery({ queryKey: queryKeys.marketIndicators, queryFn: fetchMarketIndicators });
}

export function useDataFreshness() {
  return useQuery({ queryKey: queryKeys.dataFreshness, queryFn: fetchDataFreshness });
}

/** Live RSS market news — staleTime matches the backend's 5-minute in-process cache. */
export function useMarketNews(limit = 8) {
  return useQuery({
    queryKey: queryKeys.marketNews,
    queryFn: () => fetchMarketNews(limit),
    staleTime: 5 * 60 * 1000, // 5 min — mirrors backend _CACHE_TTL_SECONDS
  });
}
