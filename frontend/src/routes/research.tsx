import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { SearchInput } from "@/shared/components/common/SearchInput";
import { CompanyRow } from "@/features/company/components/CompanyRow";
import { EmptyState } from "@/shared/components/common/EmptyState";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { CompanyRowListSkeleton } from "@/shared/components/common/Skeletons";
import { Pagination } from "@/shared/components/common/Pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useCompanies } from "@/features/company/hooks/useCompanies";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { fetchCompanies } from "@/features/company/api/companies";
import { queryKeys } from "@/shared/hooks/queryKeys";
import { SearchX } from "lucide-react";
import type { CompanySort } from "@/shared/api/types";

const PAGE_SIZE = 8;
const DEFAULT_PARAMS = { sort: "overallScore" as CompanySort, sortDirection: "desc" as const, page: 1, pageSize: PAGE_SIZE };

export const Route = createFileRoute("/research")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: queryKeys.companies.list(DEFAULT_PARAMS),
      queryFn: () => fetchCompanies(DEFAULT_PARAMS),
    }),
  head: () => ({
    meta: [
      { title: "Research — Quant" },
      { name: "description", content: "Deep, calm research briefings on Indian companies." },
    ],
  }),
  component: ResearchLayout,
});

function ResearchLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/research") return <ResearchIndex />;
  return <Outlet />;
}

function ResearchIndex() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CompanySort>("overallScore");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 250);

  const query = useCompanies({
    search: debouncedSearch,
    sort,
    sortDirection: sort === "name" ? "asc" : "desc",
    page,
    pageSize: PAGE_SIZE,
  });
  const results = query.data?.items ?? [];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-24">
        <PageHeader
          eyebrow="Research library"
          title="Every company, understood in a minute."
          className="mb-10"
        />

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or ticker…"
            className="flex-1"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as CompanySort)}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overallScore">Sort: Overall score</SelectItem>
              <SelectItem value="name">Sort: Name (A–Z)</SelectItem>
              <SelectItem value="changePct">Sort: Day change</SelectItem>
              <SelectItem value="marketCapCr">Sort: Market cap</SelectItem>
              <SelectItem value="pe">Sort: P/E</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {query.isPending && <CompanyRowListSkeleton count={PAGE_SIZE} />}

        {query.isError && <ErrorState description="Couldn't load the research library." onRetry={() => query.refetch()} />}

        {query.isSuccess && results.length === 0 && (
          <EmptyState icon={SearchX} title="No companies match" description="Try a different name or ticker." />
        )}

        {query.isSuccess && results.length > 0 && (
          <>
            <div>
              {results.map((c) => (
                <CompanyRow key={c.symbol} company={c} />
              ))}
            </div>
            {query.data && query.data.totalPages > 1 && (
              <Pagination
                className="mt-6"
                page={query.data.page}
                totalPages={query.data.totalPages}
                total={query.data.total}
                pageSize={query.data.pageSize}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
