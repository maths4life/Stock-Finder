import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sparkles, SlidersHorizontal, RotateCcw } from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { StatMetric } from "@/shared/components/common/StatMetric";
import { Sparkline } from "@/shared/components/common/Sparkline";
import { VerdictBadge } from "@/shared/components/common/Badge";
import { EmptyState } from "@/shared/components/common/EmptyState";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { CompanyRowListSkeleton } from "@/shared/components/common/Skeletons";
import { Pagination } from "@/shared/components/common/Pagination";
import { Slider } from "@/shared/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useAllCompanies, useCompanies } from "@/features/company/hooks/useCompanies";
import { fetchCompanies } from "@/features/company/api/companies";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { Company, CompanyQueryParams, RiskLevel } from "@/shared/api/types";
import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";

const PAGE_SIZE = 6;

type FilterState = {
  sector: string;
  minRoe: number;
  minRoce: number;
  minEpsGrowth: number;
  minSalesGrowth: number;
  maxPe: number;
  maxDebtToEquity: number;
  minPromoterHolding: number;
  aboveEma200: boolean;
  aboveEma50: boolean;
  volumeBreakout: boolean;
  riskLevel: RiskLevel | "Any";
  horizon: CompanyQueryParams["horizon"];
};

const DEFAULT_FILTERS: FilterState = {
  sector: "All",
  minRoe: 0,
  minRoce: 0,
  minEpsGrowth: 0,
  minSalesGrowth: 0,
  maxPe: 200,
  maxDebtToEquity: 3,
  minPromoterHolding: 0,
  aboveEma200: false,
  aboveEma50: false,
  volumeBreakout: false,
  riskLevel: "Any",
  horizon: "Any",
};

function toQueryParams(filters: FilterState, page: number): CompanyQueryParams {
  return {
    sector: filters.sector,
    riskLevel: filters.riskLevel,
    horizon: filters.horizon,
    minRoe: filters.minRoe,
    minRoce: filters.minRoce,
    minEpsGrowth: filters.minEpsGrowth,
    minSalesGrowth: filters.minSalesGrowth,
    maxPe: filters.maxPe,
    maxDebtToEquity: filters.maxDebtToEquity,
    minPromoterHolding: filters.minPromoterHolding,
    aboveEma200: filters.aboveEma200,
    aboveEma50: filters.aboveEma50,
    volumeBreakout: filters.volumeBreakout,
    sort: "overallScore",
    sortDirection: "desc",
    page,
    pageSize: PAGE_SIZE,
  };
}

export const Route = createFileRoute("/screener")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: queryKeys.companies.list(toQueryParams(DEFAULT_FILTERS, 1)),
      queryFn: () => fetchCompanies(toQueryParams(DEFAULT_FILTERS, 1)),
    }),
  head: () => ({
    meta: [
      { title: "Screener — Quant" },
      { name: "description", content: "Filter on fundamentals and technicals. See only what qualifies." },
    ],
  }),
  component: Screener,
});

function whySelected(c: Company): string {
  const reasons: string[] = [];
  if (c.roe >= 20) reasons.push(`ROE of ${c.roe.toFixed(1)}%`);
  if (c.profitGrowthPct >= 20) reasons.push(`profit growth of ${c.profitGrowthPct.toFixed(1)}%`);
  if (c.aboveEma200) reasons.push("trading above its 200-day average");
  if (c.volumeBreakout) reasons.push("breaking out on volume");
  if (reasons.length === 0) return c.rationale;
  return `Qualified on ${reasons.join(", ")}.`;
}

function Screener() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const { data: allCompanies = [] } = useAllCompanies();
  const sectors = useMemo(() => ["All", ...new Set(allCompanies.map((c) => c.sector))], [allCompanies]);

  const query = useCompanies(toQueryParams(applied, page));
  const results = query.data?.items ?? [];

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const applyFilters = () => {
    setApplied(filters);
    setPage(1);
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setPage(1);
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-24">
        <PageHeader
          eyebrow="AI Stock Discovery"
          title="Set your criteria. See only what qualifies."
          description="No lists of hundreds. High-conviction names, ranked by a transparent score — not a black box."
          className="mb-10"
        />

        <div className="grid grid-cols-12 gap-10">
          {/* Filter panel */}
          <aside className="col-span-12 lg:col-span-4">
            <div className="rounded-xl ring-1 ring-hairline bg-surface-raised p-6 lg:sticky lg:top-20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-3.5 text-ink-subtle" />
                  <p className="text-eyebrow text-ink-subtle">Filters</p>
                </div>
                <button onClick={reset} className="flex items-center gap-1 text-[11px] text-ink-subtle hover:text-ink transition-colors">
                  <RotateCcw className="size-3" /> Reset
                </button>
              </div>

              <div className="space-y-7">
                <div>
                  <FieldLabel>Sector</FieldLabel>
                  <Select value={filters.sector} onValueChange={(v) => update("sector", v)}>
                    <SelectTrigger className="w-full mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <FieldGroup label="Fundamentals">
                  <SliderField label="Minimum ROE" value={filters.minRoe} max={40} unit="%" onChange={(v) => update("minRoe", v)} />
                  <SliderField label="Minimum ROCE" value={filters.minRoce} max={45} unit="%" onChange={(v) => update("minRoce", v)} />
                  <SliderField label="Minimum EPS growth" value={filters.minEpsGrowth} max={60} unit="%" onChange={(v) => update("minEpsGrowth", v)} />
                  <SliderField label="Minimum sales growth" value={filters.minSalesGrowth} max={60} unit="%" onChange={(v) => update("minSalesGrowth", v)} />
                  <SliderField label="Maximum P/E" value={filters.maxPe} max={200} unit="x" onChange={(v) => update("maxPe", v)} />
                  <SliderField label="Maximum Debt/Equity" value={filters.maxDebtToEquity} max={3} step={0.1} unit="x" onChange={(v) => update("maxDebtToEquity", v)} />
                  <SliderField label="Minimum promoter holding" value={filters.minPromoterHolding} max={80} unit="%" onChange={(v) => update("minPromoterHolding", v)} />
                </FieldGroup>

                <FieldGroup label="Technicals">
                  <CheckField label="Above 200-day average" checked={filters.aboveEma200} onChange={(v) => update("aboveEma200", v)} />
                  <CheckField label="Above 50-day average" checked={filters.aboveEma50} onChange={(v) => update("aboveEma50", v)} />
                  <CheckField label="Volume breakout" checked={filters.volumeBreakout} onChange={(v) => update("volumeBreakout", v)} />
                </FieldGroup>

                <FieldGroup label="Investment profile">
                  <div>
                    <FieldLabel>Risk level</FieldLabel>
                    <Select value={filters.riskLevel} onValueChange={(v) => update("riskLevel", v as FilterState["riskLevel"])}>
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Any", "Low", "Moderate", "High"].map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Investment horizon</FieldLabel>
                    <Select value={filters.horizon} onValueChange={(v) => update("horizon", v as FilterState["horizon"])}>
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Any">Any</SelectItem>
                        <SelectItem value="short">≤ 6 months</SelectItem>
                        <SelectItem value="medium">6–12 months</SelectItem>
                        <SelectItem value="long">12+ months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </FieldGroup>
              </div>

              <button
                onClick={applyFilters}
                className="mt-8 w-full py-2.5 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:brightness-110 transition-all"
              >
                Find Stocks
              </button>
            </div>
          </aside>

          {/* Results */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-baseline gap-3 mb-6 hairline-b pb-3">
              <span className="text-heading-xl tabular-nums">{query.data?.total ?? "–"}</span>
              <span className="text-sm text-ink-muted">
                {query.data?.total === 1 ? "company matches" : "companies match"} — ranked by overall score
              </span>
            </div>

            {query.isPending && <CompanyRowListSkeleton count={PAGE_SIZE} />}

            {query.isError && (
              <ErrorState description="Couldn't load screener results." onRetry={() => query.refetch()} />
            )}

            {query.isSuccess && results.length === 0 && (
              <EmptyState
                icon={SearchX}
                title="No matches"
                description="Loosen a filter and try again — most screens over-constrain on the first pass."
                action={
                  <button onClick={reset} className="text-sm font-medium text-accent hover:underline underline-offset-2">
                    Reset all filters
                  </button>
                }
              />
            )}

            {query.isSuccess && results.length > 0 && (
              <>
                <div className="space-y-4">
                  {results.map((c) => (
                    <ResultCard key={c.symbol} company={c} />
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
        </div>
      </div>
    </AppShell>
  );
}

function ResultCard({ company: c }: { company: Company }) {
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className="block p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-card-hover transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-[15px]">{c.name}</p>
            <VerdictBadge verdict={c.verdict} />
          </div>
          <p className="font-mono text-[10px] text-ink-subtle">
            {c.exchange}:{c.symbol} · {c.sector}
          </p>
          <p className="mt-3 text-[13.5px] text-ink-muted leading-relaxed text-pretty flex items-start gap-1.5">
            <Sparkles className="size-3.5 text-accent shrink-0 mt-0.5" />
            <span>{whySelected(c)}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm tabular-nums">₹{c.price.toLocaleString("en-IN")}</div>
          <div className={"text-[11px] font-mono tabular-nums " + (c.changePct >= 0 ? "text-positive" : "text-negative")}>
            {c.changePct >= 0 ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </div>
          <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} width={90} height={28} className="mt-2 ml-auto" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-4 hairline-t pt-4">
        <StatMetric label="Overall" value={c.overallScore.toFixed(0)} highlight />
        <StatMetric label="Fundamental" value={c.fundamentalScore.toFixed(0)} />
        <StatMetric label="Technical" value={c.technicalScore.toFixed(0)} />
        <StatMetric label="Risk" value={c.riskLevel} size="sm" />
        <StatMetric label="Expected Return" value={`${c.expectedReturnPct}%`} size="sm" />
        <StatMetric label="Horizon" value={`${c.investmentHorizonMonths}mo`} size="sm" />
      </div>
    </Link>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-ink-muted">{children}</p>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hairline-t pt-6">
      <p className="text-eyebrow text-ink-subtle mb-4">{label}</p>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function SliderField({
  label,
  value,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-xs text-ink tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <Slider value={[value]} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}
