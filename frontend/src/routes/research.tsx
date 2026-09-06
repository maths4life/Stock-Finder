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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useCompanies } from "@/features/company/hooks/useCompanies";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { fetchCompanies } from "@/features/company/api/companies";
import { queryKeys } from "@/shared/hooks/queryKeys";
import { SearchX } from "lucide-react";
import type { CompanyQueryParams, CompanySort } from "@/shared/api/types";

const PAGE_SIZE = 8;
const DEFAULT_PARAMS = {
  sort: "overallScore" as CompanySort,
  sortDirection: "desc" as const,
  page: 1,
  pageSize: PAGE_SIZE,
};

/** Quick filters (Section 7) — thin presets over the same
 * `CompanyQueryParams` the Screener's full filter panel uses, so "High
 * Score" etc. aren't a second filtering system, just a shortcut into it. */
const QUICK_FILTERS: { id: string; label: string; params: Partial<CompanyQueryParams> }[] = [
  { id: "all", label: "All", params: {} },
  { id: "high-score", label: "High Score", params: {} },
  { id: "low-risk", label: "Low Risk", params: { riskLevel: "Low" } },
  { id: "momentum", label: "Momentum", params: { aboveEma200: true, aboveEma50: true } },
  { id: "value", label: "Value", params: { maxPe: 20 } },
];

export const Route = createFileRoute("/research")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: queryKeys.companies.list(DEFAULT_PARAMS),
      queryFn: () => fetchCompanies(DEFAULT_PARAMS),
    }),
  head: () => ({
    meta: [
      { title: "Research — Stock Finder" },
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
  const [quickFilter, setQuickFilter] = useState("all");
  const debouncedSearch = useDebouncedValue(search, 250);

  const activeQuickFilter = QUICK_FILTERS.find((f) => f.id === quickFilter) ?? QUICK_FILTERS[0];

  const query = useCompanies({
    search: debouncedSearch,
    sort,
    sortDirection: sort === "name" ? "asc" : "desc",
    page,
    pageSize: PAGE_SIZE,
    ...activeQuickFilter.params,
  });
  const results = query.data?.items ?? [];

  function selectQuickFilter(id: string) {
    setQuickFilter(id);
    setPage(1);
    if (id === "high-score") setSort("overallScore");
  }

  return (
    <AppShell>
      <div className="page-container py-12 pb-24">
        <PageHeader
          eyebrow="Research library"
          title="Every company, one clean page."
          className="mb-10"
        />

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => selectQuickFilter(f.id)}
              className={
                "px-3.5 py-1.5 rounded-full text-[12.5px] font-medium ring-1 transition-colors " +
                (quickFilter === f.id
                  ? "bg-accent text-accent-foreground ring-accent"
                  : "ring-hairline text-ink-muted hover:bg-secondary hover:text-ink")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

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

        {query.isError && (
          <ErrorState
            description="Couldn't load the research library."
            onRetry={() => query.refetch()}
          />
        )}

        {query.isSuccess && results.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="No companies match"
            description="Try a different name or ticker."
          />
        )}

        {query.isSuccess && results.length > 0 && (
          <>
            <div>
              {results.map((c) => (
                <CompanyRow key={c.symbol} company={c} showAddToIdeas={false} />
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
