import type { CompanyQueryParams } from "@/shared/api/types";

/**
 * Central query-key factory. Keeping keys in one place avoids typos/drift
 * once more screens start reading the same resources, and makes cache
 * invalidation after a future mutation (e.g. "add to pipeline") predictable.
 */
export const queryKeys = {
  companies: {
    all: ["companies"] as const,
    list: (params: CompanyQueryParams) => ["companies", "list", params] as const,
    detail: (symbol: string) => ["companies", "detail", symbol] as const,
    search: (query: string) => ["companies", "search", query] as const,
    prices: (symbol: string, range: string) => ["companies", "prices", symbol, range] as const,
    analysis: (symbol: string) => ["companies", "analysis", symbol] as const,
    weeklyMarketIntelligence: (symbol: string) => ["companies", "weekly-market-intelligence", symbol] as const,
  },
  discoverGroups: ["discover-groups"] as const,
  pipeline: ["pipeline"] as const,
  sectorPulse: ["sector-pulse"] as const,
  marketIndicators: ["market-indicators"] as const,
  journalEntries: ["journal-entries"] as const,
};
