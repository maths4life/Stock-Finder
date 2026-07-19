import { API_URL } from "@/shared/api/config";
import { ApiError } from "./client";
import type { Company, CompanyQueryParams, Paginated } from "./types";

/**
 * GET /companies
 * Currently the backend returns the full list.
 * We'll move filtering, sorting and pagination to the backend later.
 */
export async function fetchCompanies(
  params: CompanyQueryParams = {}
): Promise<Paginated<Company>> {
  const response = await fetch(`${API_URL}/companies`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  const companies: Company[] = await response.json();

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;

  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: companies.slice(start, end),
    page,
    pageSize,
    total: companies.length,
    totalPages: Math.ceil(companies.length / pageSize),
  };
}

/**
 * GET /company/{symbol}
 * We'll create this backend endpoint next.
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
 * Used by search bar.
 * Temporarily searches the downloaded company list.
 */
export async function searchCompanies(
  query: string,
  limit = 8
): Promise<Company[]> {
  const response = await fetch(`${API_URL}/companies`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  const companies: Company[] = await response.json();

  const q = query.trim().toLowerCase();

  return companies
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

/**
 * Used for dropdowns.
 */
export async function fetchAllCompanies(): Promise<Company[]> {
  const response = await fetch(`${API_URL}/companies`);

  if (!response.ok) {
    throw new Error("Failed to fetch companies");
  }

  return response.json();
}

/**
 * Used by watchlist/portfolio.
 */
export async function fetchCompaniesBySymbols(
  symbols: string[]
): Promise<Company[]> {
  const companies = await fetchAllCompanies();

  return companies.filter((c) =>
    symbols.includes(c.symbol.toUpperCase())
  );
}