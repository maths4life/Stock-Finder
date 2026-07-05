import { useQuery } from "@tanstack/react-query";
import { fetchCompaniesBySymbols } from "@/lib/api/companies";

export function useCompaniesForSymbols(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  return useQuery({
    queryKey: ["companies", "by-symbols", key],
    queryFn: () => fetchCompaniesBySymbols(symbols),
    enabled: symbols.length > 0,
  });
}
