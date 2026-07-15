import { ApiError } from "@/shared/api/client";
import type { Company, CompanyQueryParams, Paginated, PriceBar, PriceRange } from "@/shared/api/types";

const API_URL = "http://127.0.0.1:8000";

/**
 * GET /companies
 * Backend does the fetch/search (Module 1). Pagination is still applied
 * here on the returned array — that's a display concern, not screening/
 * ranking/filtering, so it's fine to keep client-side for now. Sorting
 * and heavier filtering move server-side in Module 4 (Screener).
 */
export async function fetchCompanies(
  params: CompanyQueryParams = {}
): Promise<Paginated<Company>> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);

  const response = await fetch(`${API_URL}/companies?${qs.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  const companies: Company[] = await response.json();

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;

  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: companies.slice(start, end),
    page,
    pageSize,
    total: companies.length,
    totalPages: Math.ceil(companies.length / pageSize),
  };
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
  range: PriceRange = "6M"
): Promise<PriceBar[]> {
  const qs = new URLSearchParams({ range });
  const response = await fetch(`${API_URL}/company/${symbol}/prices?${qs.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch price history");
  }

  return response.json();
}

/**
 * Used by search bar. Search now happens in Postgres (ILIKE on name/symbol)
 * via the `search` query param, not a client-side .filter() over the full
 * list.
 */
export async function searchCompanies(
  query: string,
  limit = 8
): Promise<Company[]> {
  const qs = new URLSearchParams({ search: query, limit: String(limit) });
  const response = await fetch(`${API_URL}/companies?${qs.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  return response.json();
}

/**
 * Used for dropdowns (e.g. sector filter options).
 */
export async function fetchAllCompanies(): Promise<Company[]> {
  const response = await fetch(`${API_URL}/companies`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  return response.json();
}

/**
 * Used by watchlist/portfolio. A lookup by exact symbol, not screening or
 * ranking, so it's fine to filter client-side over the already-fetched list.
 */
export async function fetchCompaniesBySymbols(
  symbols: string[]
): Promise<Company[]> {
  const companies = await fetchAllCompanies();

  return companies.filter((c) =>
    symbols.includes(c.symbol.toUpperCase())
  );
}
