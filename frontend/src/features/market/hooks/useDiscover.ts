import { useQuery } from "@tanstack/react-query";
import { fetchDiscoverGroups, fetchMarketIndicators, fetchPipeline, fetchSectorPulse } from "@/features/market/api/market";
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
