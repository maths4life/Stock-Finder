import { ApiError } from "@/shared/api/client";
import type {
  Company,
  CompanyQueryParams,
  Paginated,
  PriceBar,
  PriceRange,
} from "@/shared/api/types";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
/**
 * GET /companies (Module 4 — Screener)
 * Backend owns filtering, sorting, ranking, and pagination — this just
 * forwards CompanyQueryParams to the querystring and returns the
 * Paginated<Company> envelope as-is. No client-side slicing/filtering.
 */
export async function fetchCompanies(params: CompanyQueryParams = {}): Promise<Paginated<Company>> {
  const qs = new URLSearchParams();
  if (params.symbols) qs.set("symbols", params.symbols);
  if (params.search) qs.set("search", params.search);
  if (params.sector && params.sector !== "All") qs.set("sector", params.sector);
  if (params.riskLevel && params.riskLevel !== "Any") qs.set("riskLevel", params.riskLevel);
  if (params.horizon && params.horizon !== "Any") qs.set("horizon", params.horizon);
  if (params.minRoe) qs.set("minRoe", String(params.minRoe));
  if (params.maxRoe !== undefined) qs.set("maxRoe", String(params.maxRoe));
  if (params.minRoce) qs.set("minRoce", String(params.minRoce));
  if (params.maxRoce !== undefined) qs.set("maxRoce", String(params.maxRoce));
  if (params.minEpsGrowth) qs.set("minEpsGrowth", String(params.minEpsGrowth));
  if (params.maxEpsGrowth !== undefined) qs.set("maxEpsGrowth", String(params.maxEpsGrowth));
  if (params.minSalesGrowth) qs.set("minSalesGrowth", String(params.minSalesGrowth));
  if (params.maxSalesGrowth !== undefined) qs.set("maxSalesGrowth", String(params.maxSalesGrowth));
  if (params.minPe !== undefined) qs.set("minPe", String(params.minPe));
  if (params.maxPe !== undefined) qs.set("maxPe", String(params.maxPe));
  if (params.maxDebtToEquity !== undefined)
    qs.set("maxDebtToEquity", String(params.maxDebtToEquity));
  if (params.minPromoterHolding) qs.set("minPromoterHolding", String(params.minPromoterHolding));
  if (params.aboveEma200) qs.set("aboveEma200", "true");
  if (params.aboveEma50) qs.set("aboveEma50", "true");
  if (params.volumeBreakout) qs.set("volumeBreakout", "true");
  if (params.minMarketCap !== undefined) qs.set("minMarketCap", String(params.minMarketCap));
  if (params.maxMarketCap !== undefined) qs.set("maxMarketCap", String(params.maxMarketCap));
  if (params.sort) qs.set("sort", params.sort);
  if (params.sortDirection) qs.set("sortDirection", params.sortDirection);
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 20));

  const response = await fetch(`${API_URL}/companies?${qs.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  return response.json();
}

/**
 * GET /company/{symbol}
 */
export async function fetchCompany(symbol: string): Promise<Company> {
  const response = await fetch(`${API_URL}/company/${symbol}`);

  if (response.status === 404) {
    throw new ApiError(`No company found for symbol "${symbol}"`, 404);
  }

  if (!response.ok) {
    throw new Error("Failed to fetch company");
  }

  return response.json();
}

/**
 * GET /company/{symbol}/prices — Module 3 Price History section. Doesn't
 * 404 on an unknown symbol (see routes/companies.py's docstring); an
 * empty array is the honest response and the chart renders its own
 * empty state for that case.
 */
export async function fetchCompanyPrices(
  symbol: string,
  range: PriceRange = "6M",
): Promise<PriceBar[]> {
  const qs = new URLSearchParams({ range });
  const response = await fetch(`${API_URL}/company/${symbol}/prices?${qs.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch price history");
  }

  return response.json();
}

/**
 * Used by search bar. Search happens in Postgres (ILIKE on name/symbol)
 * via the `search` query param; ranked by overall score server-side.
 */
export async function searchCompanies(query: string, limit = 8): Promise<Company[]> {
  const { items } = await fetchCompanies({ search: query, pageSize: limit });
  return items;
}

/**
 * Used for dropdowns (e.g. sector filter options) and as the base list
 * `fetchCompaniesBySymbols` filters over.
 */
let allCompaniesCache: { promise: Promise<Company[]>; timestamp: number } | null = null;
const ALL_COMPANIES_TTL = 60 * 1000; // 1 minute

export async function fetchAllCompanies(): Promise<Company[]> {
  const now = Date.now();
  if (allCompaniesCache && now - allCompaniesCache.timestamp < ALL_COMPANIES_TTL) {
    return allCompaniesCache.promise;
  }
  const promise = fetchCompanies({ sort: "name", pageSize: 1000 }).then((res) => res.items);
  allCompaniesCache = { promise, timestamp: now };
  return promise;
}

/**
 * Used by watchlist/portfolio/discover groups. Fetches only the requested
 * symbols directly from the API instead of downloading the full universe.
 */
export async function fetchCompaniesBySymbols(symbols: string[]): Promise<Company[]> {
  if (!symbols || symbols.length === 0) return [];
  const { items } = await fetchCompanies({
    symbols: symbols.join(","),
    pageSize: Math.max(symbols.length, 20),
  });
  return items;
}
