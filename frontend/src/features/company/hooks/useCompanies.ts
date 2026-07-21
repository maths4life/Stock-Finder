import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAllCompanies, fetchCompanies, fetchCompany, fetchCompanyPrices, searchCompanies } from "@/features/company/api/companies";
import type { CompanyQueryParams, PriceRange } from "@/shared/api/types";
import { queryKeys } from "@/shared/hooks/queryKeys";

/** Paginated, filterable, sortable company list — the one hook the screener and research index both use. */
export function useCompanies(params: CompanyQueryParams) {
  return useQuery({
    queryKey: queryKeys.companies.list(params),
    queryFn: () => fetchCompanies(params),
    placeholderData: keepPreviousData,
  });
}

export function useCompany(symbol: string | undefined) {
  return useQuery({
    queryKey: queryKeys.companies.detail(symbol ?? ""),
    queryFn: () => fetchCompany(symbol as string),
    enabled: Boolean(symbol),
    retry: false,
  });
}

/** Debounced-at-call-site search, used by the command palette. */
export function useCompanySearch(query: string) {
  return useQuery({
    queryKey: queryKeys.companies.search(query),
    queryFn: () => searchCompanies(query),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Full unfiltered list — only for deriving option sets like sector dropdowns. */
export function useAllCompanies() {
  return useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: fetchAllCompanies,
    staleTime: 5 * 60 * 1000,
  });
}

/** Research page's Price History chart (Module 3). Same query key/fn pair
 * used by the route loader's SSR prefetch — must stay identical to avoid
 * a hydration mismatch. */
export function useCompanyPrices(symbol: string | undefined, range: PriceRange = "6M") {
  return useQuery({
    queryKey: queryKeys.companies.prices(symbol ?? "", range),
    queryFn: () => fetchCompanyPrices(symbol as string, range),
    enabled: Boolean(symbol),
    retry: false,
  });
}
