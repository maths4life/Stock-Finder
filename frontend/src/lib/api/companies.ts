import { paginate, resolveMock, ApiError } from "./client";
import { companyRecords } from "./mock/companies.data";
import type { Company, CompanyQueryParams, Paginated } from "./types";

/**
 * All company reads funnel through this module. Today it filters/sorts an
 * in-memory array; tomorrow each function body becomes a Supabase query
 * (`.from("companies").select().ilike(...).order(...).range(...)`) against
 * the same params shape, so callers never change.
 */

const DEFAULT_PAGE_SIZE = 10;

function matchesQuery(c: Company, params: CompanyQueryParams): boolean {
  const search = params.search?.trim().toLowerCase();
  if (search && !(c.name.toLowerCase().includes(search) || c.symbol.toLowerCase().includes(search))) {
    return false;
  }
  if (params.sector && params.sector !== "All" && c.sector !== params.sector) return false;
  if (params.riskLevel && params.riskLevel !== "Any" && c.riskLevel !== params.riskLevel) return false;
  if (params.minRoe !== undefined && c.roe < params.minRoe) return false;
  if (params.minRoce !== undefined && c.roce < params.minRoce) return false;
  if (params.minEpsGrowth !== undefined && c.epsGrowthPct < params.minEpsGrowth) return false;
  if (params.minSalesGrowth !== undefined && c.salesGrowthPct < params.minSalesGrowth) return false;
  if (params.maxPe !== undefined && c.pe > params.maxPe) return false;
  if (params.maxDebtToEquity !== undefined && c.debtToEquity > params.maxDebtToEquity) return false;
  if (params.minPromoterHolding !== undefined && c.promoterHoldingPct < params.minPromoterHolding) return false;
  if (params.aboveEma200 && !c.aboveEma200) return false;
  if (params.aboveEma50 && !c.aboveEma50) return false;
  if (params.volumeBreakout && !c.volumeBreakout) return false;
  if (params.horizon && params.horizon !== "Any") {
    const months = c.investmentHorizonMonths;
    if (params.horizon === "short" && months > 6) return false;
    if (params.horizon === "medium" && (months <= 6 || months > 12)) return false;
    if (params.horizon === "long" && months <= 12) return false;
  }
  return true;
}

function sortCompanies(items: Company[], sort: CompanyQueryParams["sort"], direction: CompanyQueryParams["sortDirection"]) {
  const dir = direction === "asc" ? 1 : -1;
  const key = sort ?? "overallScore";
  return [...items].sort((a, b) => {
    if (key === "name") return dir * a.name.localeCompare(b.name);
    return dir * ((a[key] as number) - (b[key] as number));
  });
}

/** GET /companies — paginated, filtered, sorted list. */
export function fetchCompanies(params: CompanyQueryParams = {}): Promise<Paginated<Company>> {
  return resolveMock(() => {
    const all = Object.values(companyRecords);
    const filtered = all.filter((c) => matchesQuery(c, params));
    const sorted = sortCompanies(filtered, params.sort, params.sortDirection ?? "desc");
    return paginate(sorted, params.page ?? 1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  });
}

/** GET /companies/:symbol */
export function fetchCompany(symbol: string): Promise<Company> {
  return resolveMock(() => {
    const company = companyRecords[symbol.toUpperCase()];
    if (!company) throw new ApiError(`No company found for symbol "${symbol}"`, 404);
    return company;
  });
}

/** GET /companies?search=... — lightweight lookup used by the command palette. */
export function searchCompanies(query: string, limit = 8): Promise<Company[]> {
  return resolveMock(
    () => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return Object.values(companyRecords)
        .filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
        .slice(0, limit);
    },
    { latencyMs: 150 },
  );
}

/** GET /companies (unfiltered, un-paginated) — used for sector option lists etc. */
export function fetchAllCompanies(): Promise<Company[]> {
  return resolveMock(() => Object.values(companyRecords));
}

export function fetchCompaniesBySymbols(symbols: string[]): Promise<Company[]> {
  return resolveMock(() => symbols.map((s) => companyRecords[s.toUpperCase()]).filter((c): c is Company => Boolean(c)));
}
