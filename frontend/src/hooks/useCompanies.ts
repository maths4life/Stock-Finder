import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAllCompanies, fetchCompanies, fetchCompany, searchCompanies } from "@/lib/api/companies";
import type { CompanyQueryParams } from "@/lib/api/types";
import { queryKeys } from "./queryKeys";

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
