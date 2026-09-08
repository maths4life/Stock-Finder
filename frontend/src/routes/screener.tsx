import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronDown, RotateCcw, SearchX, Sparkles, X } from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { StatMetric } from "@/shared/components/common/StatMetric";
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
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { useAllCompanies, useCompanies } from "@/features/company/hooks/useCompanies";
import { fetchCompanies } from "@/features/company/api/companies";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { Company, CompanyQueryParams, RiskLevel } from "@/shared/api/types";
import { AddToIdeasButton } from "@/shared/components/common/AddToIdeasButton";

const PAGE_SIZE = 10;

/**
 * Every bound here maps 1:1 to a real `CompanyQueryParams` field the
 * backend already filters on (see backend/services/screener_service.py) —
 * no client-side filtering engine, no invented metrics. `undefined` means
 * "no bound set", not 0, so partially-filled ranges (e.g. Min only) work.
 */
type SortField =
  | "overallScore"
  | "fundamentalScore"
  | "technicalScore"
  | "profitGrowthPct"
  | "salesGrowthPct"
  | "roe"
  | "pe"
  | "marketCapCr"
  | "changePct";

/** Maps UI-friendly labels to backend sort field names. */
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "overallScore", label: "Score" },
  { value: "fundamentalScore", label: "Fundamental" },
  { value: "technicalScore", label: "Technical" },
  { value: "profitGrowthPct", label: "Profit Growth" },
  { value: "salesGrowthPct", label: "Revenue Growth" },
  { value: "roe", label: "ROE" },
  { value: "pe", label: "P/E" },
  { value: "marketCapCr", label: "Market Cap" },
  { value: "changePct", label: "Daily Change" },
];

type FilterState = {
  sector: string;
  minPe?: number;
  maxPe?: number;
  minRoe?: number;
  maxRoe?: number;
  minRoce?: number;
  maxRoce?: number;
  // Labeled "Profit Growth" in the UI — backend proxies EPS growth with
  // profit growth (see CompanyQueryParams.minEpsGrowth's doc comment),
  // so this is the real profit-growth figure, not a separate metric.
  minProfitGrowth?: number;
  maxProfitGrowth?: number;
  minRevenueGrowth?: number;
  maxRevenueGrowth?: number;
  maxDebtToEquity?: number;
  minPromoterHolding?: number;
  aboveEma200: boolean;
  aboveEma50: boolean;
  volumeBreakout: boolean;
  riskLevel: RiskLevel | "Any";
  horizon: CompanyQueryParams["horizon"];
  sortField: SortField;
  sortDirection: "asc" | "desc";
};

const DEFAULT_FILTERS: FilterState = {
  sector: "All",
  aboveEma200: false,
  aboveEma50: false,
  volumeBreakout: false,
  riskLevel: "Any",
  horizon: "Any",
  sortField: "overallScore",
  sortDirection: "desc",
};

const PRESETS: { id: string; label: string; filters: Partial<FilterState> }[] = [
  { id: "quality", label: "Quality", filters: { minRoe: 20, minRoce: 15, maxDebtToEquity: 0.5 } },
  { id: "growth", label: "Growth", filters: { minProfitGrowth: 20, minRevenueGrowth: 15 } },
  { id: "value", label: "Value", filters: { maxPe: 20 } },
  {
    id: "momentum",
    label: "Momentum",
    filters: { aboveEma200: true, aboveEma50: true, volumeBreakout: true },
  },
  { id: "low-risk", label: "Low Risk", filters: { riskLevel: "Low" } },
];

function toQueryParams(filters: FilterState, page: number): CompanyQueryParams {
  return {
    sector: filters.sector,
    riskLevel: filters.riskLevel,
    horizon: filters.horizon,
    minPe: filters.minPe,
    maxPe: filters.maxPe,
    minRoe: filters.minRoe,
    maxRoe: filters.maxRoe,
    minRoce: filters.minRoce,
    maxRoce: filters.maxRoce,
    minEpsGrowth: filters.minProfitGrowth,
    maxEpsGrowth: filters.maxProfitGrowth,
    minSalesGrowth: filters.minRevenueGrowth,
    maxSalesGrowth: filters.maxRevenueGrowth,
    maxDebtToEquity: filters.maxDebtToEquity,
    minPromoterHolding: filters.minPromoterHolding,
    aboveEma200: filters.aboveEma200,
    aboveEma50: filters.aboveEma50,
    volumeBreakout: filters.volumeBreakout,
    sort: filters.sortField,
    sortDirection: filters.sortDirection,
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
      { title: "Screener — Stock Finder" },
      {
        name: "description",
        content: "Filter on fundamentals and technicals. See only what qualifies.",
      },
    ],
  }),
  component: Screener,
});

/** Compact "signal" line for a result row — every phrase reads a field the
 * backend already computed, same discipline as qualifyingReasons.ts. */
function shortSignal(c: Company): string {
  const bits: string[] = [];
  if (c.profitGrowthPct >= 15) bits.push("Strong profit growth");
  if (c.salesGrowthPct >= 15) bits.push("Strong revenue growth");
  if (c.roe >= 20) bits.push(`ROE ${c.roe.toFixed(0)}%`);
  if (c.aboveEma200) bits.push("Above 200 DMA");
  if (c.goldenCross) bits.push("Golden cross");
  if (c.volumeBreakout) bits.push("Volume breakout");
  if (c.debtToEquity < 0.5) bits.push("Low leverage");
  if (bits.length === 0) return c.rationale;
  return bits.slice(0, 3).join(" · ");
}

/** One active-filter chip's label + the updater that clears just that filter. */
type ActiveChip = { key: string; label: string; clear: (f: FilterState) => FilterState };

function activeChips(filters: FilterState): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (filters.sector !== "All")
    chips.push({ key: "sector", label: filters.sector, clear: (f) => ({ ...f, sector: "All" }) });
  if (filters.minPe !== undefined)
    chips.push({
      key: "minPe",
      label: `P/E > ${filters.minPe}`,
      clear: (f) => ({ ...f, minPe: undefined }),
    });
  if (filters.maxPe !== undefined)
    chips.push({
      key: "maxPe",
      label: `P/E < ${filters.maxPe}`,
      clear: (f) => ({ ...f, maxPe: undefined }),
    });
  if (filters.minRoe !== undefined)
    chips.push({
      key: "minRoe",
      label: `ROE > ${filters.minRoe}%`,
      clear: (f) => ({ ...f, minRoe: undefined }),
    });
  if (filters.maxRoe !== undefined)
    chips.push({
      key: "maxRoe",
      label: `ROE < ${filters.maxRoe}%`,
      clear: (f) => ({ ...f, maxRoe: undefined }),
    });
  if (filters.minRoce !== undefined)
    chips.push({
      key: "minRoce",
      label: `ROCE > ${filters.minRoce}%`,
      clear: (f) => ({ ...f, minRoce: undefined }),
    });
  if (filters.maxRoce !== undefined)
    chips.push({
      key: "maxRoce",
      label: `ROCE < ${filters.maxRoce}%`,
      clear: (f) => ({ ...f, maxRoce: undefined }),
    });
  if (filters.minProfitGrowth !== undefined)
    chips.push({
      key: "minProfitGrowth",
      label: `Profit growth > ${filters.minProfitGrowth}%`,
      clear: (f) => ({ ...f, minProfitGrowth: undefined }),
    });
  if (filters.maxProfitGrowth !== undefined)
    chips.push({
      key: "maxProfitGrowth",
      label: `Profit growth < ${filters.maxProfitGrowth}%`,
      clear: (f) => ({ ...f, maxProfitGrowth: undefined }),
    });
  if (filters.minRevenueGrowth !== undefined)
    chips.push({
      key: "minRevenueGrowth",
      label: `Revenue growth > ${filters.minRevenueGrowth}%`,
      clear: (f) => ({ ...f, minRevenueGrowth: undefined }),
    });
  if (filters.maxRevenueGrowth !== undefined)
    chips.push({
      key: "maxRevenueGrowth",
      label: `Revenue growth < ${filters.maxRevenueGrowth}%`,
      clear: (f) => ({ ...f, maxRevenueGrowth: undefined }),
    });
  if (filters.maxDebtToEquity !== undefined)
    chips.push({
      key: "maxDebtToEquity",
      label: `D/E < ${filters.maxDebtToEquity}`,
      clear: (f) => ({ ...f, maxDebtToEquity: undefined }),
    });
  if (filters.minPromoterHolding !== undefined)
    chips.push({
      key: "minPromoterHolding",
      label: `Promoter holding > ${filters.minPromoterHolding}%`,
      clear: (f) => ({ ...f, minPromoterHolding: undefined }),
    });
  if (filters.riskLevel !== "Any")
    chips.push({
      key: "riskLevel",
      label: `${filters.riskLevel} Risk`,
      clear: (f) => ({ ...f, riskLevel: "Any" }),
    });
  if (filters.horizon && filters.horizon !== "Any")
    chips.push({
      key: "horizon",
      label:
        filters.horizon === "short"
          ? "≤ 6 months"
          : filters.horizon === "medium"
            ? "6–12 months"
            : "12+ months",
      clear: (f) => ({ ...f, horizon: "Any" }),
    });
  if (filters.aboveEma200)
    chips.push({
      key: "aboveEma200",
      label: "Above 200 DMA",
      clear: (f) => ({ ...f, aboveEma200: false }),
    });
  if (filters.aboveEma50)
    chips.push({
      key: "aboveEma50",
      label: "Above 50 DMA",
      clear: (f) => ({ ...f, aboveEma50: false }),
    });
  if (filters.volumeBreakout)
    chips.push({
      key: "volumeBreakout",
      label: "Momentum",
      clear: (f) => ({ ...f, volumeBreakout: false }),
    });
  return chips;
}

function Screener() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: allCompanies = [] } = useAllCompanies();
  const sectors = useMemo(
    () => ["All", ...new Set(allCompanies.map((c) => c.sector))],
    [allCompanies],
  );

  const query = useCompanies(toQueryParams(applied, page));
  const results = query.data?.items ?? [];

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setActivePreset(null);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setApplied(filters);
    setPage(1);
  };

  const reset = () => {
    setActivePreset(null);
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setPage(1);
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const merged = { ...DEFAULT_FILTERS, ...preset.filters };
    setActivePreset(preset.id);
    setFilters(merged);
    setApplied(merged);
    setPage(1);
  };

  const clearChip = (chip: ActiveChip) => {
    const next = chip.clear(applied);
    setActivePreset(null);
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  const chips = activeChips(applied);

  return (
    <AppShell>
      <div className="page-container py-12 pb-24">
        <PageHeader
          eyebrow="Screener"
          title="Set your criteria. See only what qualifies."
          description="No lists of hundreds. High-conviction names, ranked by a transparent score — not a black box."
          className="mb-8"
        />

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={
                "px-3.5 py-1.5 rounded-full text-[12.5px] font-medium ring-1 transition-colors " +
                (activePreset === preset.id
                  ? "bg-accent text-accent-foreground ring-accent"
                  : "ring-hairline text-ink-muted hover:bg-secondary hover:text-ink")
              }
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Horizontal filter bar */}
        <div className="rounded-xl ring-1 ring-hairline bg-surface-raised p-5 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-medium text-ink-muted">Filters</p>
            <button
              onClick={reset}
              className="flex items-center gap-1 text-[12px] text-ink-subtle hover:text-ink transition-colors"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-5">
            <div className="w-full sm:w-44">
              <FieldLabel>Sector</FieldLabel>
              <Select value={filters.sector} onValueChange={(v) => update("sector", v)}>
                <SelectTrigger className="w-full mt-1.5">
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

            <RangeField
              label="P/E"
              minValue={filters.minPe}
              maxValue={filters.maxPe}
              onMinChange={(v) => update("minPe", v)}
              onMaxChange={(v) => update("maxPe", v)}
            />
            <RangeField
              label="ROE"
              unit="%"
              minValue={filters.minRoe}
              maxValue={filters.maxRoe}
              onMinChange={(v) => update("minRoe", v)}
              onMaxChange={(v) => update("maxRoe", v)}
            />
            <RangeField
              label="Profit Growth"
              unit="%"
              minValue={filters.minProfitGrowth}
              maxValue={filters.maxProfitGrowth}
              onMinChange={(v) => update("minProfitGrowth", v)}
              onMaxChange={(v) => update("maxProfitGrowth", v)}
            />
            <div className="w-28">
              <FieldLabel>Max D/E</FieldLabel>
              <Input
                type="number"
                inputMode="decimal"
                step={0.1}
                min={0}
                placeholder="e.g. 1.0"
                value={filters.maxDebtToEquity ?? ""}
                onChange={(e) =>
                  update(
                    "maxDebtToEquity",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
                className="mt-1.5"
              />
            </div>
          </div>

          {/* More filters */}
          <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="mt-5 hairline-t pt-5">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink transition-colors">
              More Filters
              <ChevronDown
                className={"size-3.5 transition-transform " + (moreOpen ? "rotate-180" : "")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-5 space-y-6">
              <FilterGroup label="Fundamentals">
                <RangeField
                  label="ROCE"
                  unit="%"
                  minValue={filters.minRoce}
                  maxValue={filters.maxRoce}
                  onMinChange={(v) => update("minRoce", v)}
                  onMaxChange={(v) => update("maxRoce", v)}
                />
                <RangeField
                  label="Revenue Growth"
                  unit="%"
                  minValue={filters.minRevenueGrowth}
                  maxValue={filters.maxRevenueGrowth}
                  onMinChange={(v) => update("minRevenueGrowth", v)}
                  onMaxChange={(v) => update("maxRevenueGrowth", v)}
                />
                <div className="w-40">
                  <FieldLabel>Min promoter holding</FieldLabel>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    placeholder="e.g. 50"
                    value={filters.minPromoterHolding ?? ""}
                    onChange={(e) =>
                      update(
                        "minPromoterHolding",
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                    className="mt-1.5"
                  />
                </div>
              </FilterGroup>

              <FilterGroup label="Risk & Horizon">
                <div className="w-40">
                  <FieldLabel>Risk level</FieldLabel>
                  <Select
                    value={filters.riskLevel}
                    onValueChange={(v) => update("riskLevel", v as FilterState["riskLevel"])}
                  >
                    <SelectTrigger className="w-full mt-1.5">
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
                <div className="w-44">
                  <FieldLabel>Investment horizon</FieldLabel>
                  <Select
                    value={filters.horizon}
                    onValueChange={(v) => update("horizon", v as FilterState["horizon"])}
                  >
                    <SelectTrigger className="w-full mt-1.5">
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
              </FilterGroup>

              <FilterGroup label="Technicals">
                <CheckField
                  label="Above 200-day average"
                  checked={filters.aboveEma200}
                  onChange={(v) => update("aboveEma200", v)}
                />
                <CheckField
                  label="Above 50-day average"
                  checked={filters.aboveEma50}
                  onChange={(v) => update("aboveEma50", v)}
                />
                <CheckField
                  label="Volume breakout (momentum)"
                  checked={filters.volumeBreakout}
                  onChange={(v) => update("volumeBreakout", v)}
                />
              </FilterGroup>
            </CollapsibleContent>
          </Collapsible>

          <div className="mt-6 flex justify-end">
            <button
              onClick={applyFilters}
              className="px-6 py-2.5 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:brightness-110 transition-all"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-[12px] text-ink-subtle mr-1">Active filters:</span>
            {chips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => clearChip(chip)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-secondary text-ink hover:bg-secondary/70 transition-colors"
              >
                {chip.label}
                <X className="size-3 text-ink-subtle" />
              </button>
            ))}
            <button
              onClick={reset}
              className="text-[12px] font-medium text-accent hover:underline underline-offset-2 ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Results header: count + sort controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 hairline-b pb-3">
          <div className="flex items-baseline gap-3">
            <span className="text-heading-xl tabular-nums">{query.data?.total ?? "–"}</span>
            <span className="text-sm text-ink-muted">
              {query.data?.total === 1
                ? "company matches your criteria"
                : "companies match your criteria"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[12px] text-ink-subtle">Sort by</span>
            <Select
              value={applied.sortField}
              onValueChange={(v) => {
                const next = { ...applied, sortField: v as SortField };
                setFilters(next);
                setApplied(next);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 h-8 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-[12.5px]">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              aria-label="Toggle sort direction"
              onClick={() => {
                const dir = (applied.sortDirection === "desc" ? "asc" : "desc") as "asc" | "desc";
                const next = { ...applied, sortDirection: dir };
                setFilters(next);
                setApplied(next);
                setPage(1);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 h-8 rounded-md ring-1 ring-hairline text-[12px] text-ink-muted hover:text-ink hover:bg-secondary transition-colors"
            >
              <ArrowUpDown className="size-3.5" />
              {applied.sortDirection === "desc" ? "High → Low" : "Low → High"}
            </button>
          </div>
        </div>

        {query.isPending && <CompanyRowListSkeleton count={PAGE_SIZE} />}

        {query.isError && (
          <ErrorState
            description="Couldn't load screener results."
            onRetry={() => query.refetch()}
          />
        )}

        {query.isSuccess && results.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="No matches"
            description="Loosen a filter and try again — most screens over-constrain on the first pass."
            action={
              <button
                onClick={reset}
                className="text-sm font-medium text-accent hover:underline underline-offset-2"
              >
                Reset all filters
              </button>
            }
          />
        )}

        {query.isSuccess && results.length > 0 && (
          <>
            <div className="space-y-3">
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
    </AppShell>
  );
}

function ResultCard({ company: c }: { company: Company }) {
  const positive = c.changePct >= 0;
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className="block p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-card-hover transition-all"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-ink truncate">{c.name}</p>
          <p className="font-mono text-[12px] text-ink-subtle mt-0.5">
            {c.exchange}:{c.symbol} · {c.sector}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-[15px] font-semibold tabular-nums">
            ₹{c.price.toLocaleString("en-IN")}
          </div>
          <div
            className={
              "text-[13px] font-mono font-medium tabular-nums " +
              (positive ? "text-positive" : "text-negative")
            }
          >
            {positive ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13.5px] text-ink-muted leading-relaxed text-pretty flex items-start gap-1.5">
        <Sparkles className="size-3.5 text-accent shrink-0 mt-0.5" />
        <span>{shortSignal(c)}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 hairline-t pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <StatMetric label="Overall" value={c.overallScore.toFixed(0)} highlight />
          <StatMetric label="Fundamental" value={c.fundamentalScore.toFixed(0)} />
          <StatMetric label="Technical" value={c.technicalScore.toFixed(0)} />
          <StatMetric label="Risk" value={c.riskLevel} size="sm" />
        </div>
        <AddToIdeasButton symbol={c.symbol} className="shrink-0" />
      </div>
    </Link>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] font-medium text-ink-muted">{children}</p>;
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-eyebrow text-ink-subtle mb-3">{label}</p>
      <div className="flex flex-wrap gap-x-8 gap-y-4">{children}</div>
    </div>
  );
}

/** Min–Max numeric range input pair — replaces the old draggable sliders
 * with plain typeable inputs. `undefined` means "unset", so partially
 * filled ranges (only Min, only Max) are valid and map straight onto the
 * backend's independent min/max query params. */
function RangeField({
  label,
  unit,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  onMinChange: (v: number | undefined) => void;
  onMaxChange: (v: number | undefined) => void;
}) {
  return (
    <div className="w-full sm:w-auto">
      <FieldLabel>
        {label}
        {unit ? ` (${unit})` : ""}
      </FieldLabel>
      <div className="flex items-center gap-2 mt-1.5">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Min"
          value={minValue ?? ""}
          onChange={(e) => onMinChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-24"
        />
        <span className="text-ink-subtle text-sm">–</span>
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Max"
          value={maxValue ?? ""}
          onChange={(e) => onMaxChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className="w-24"
        />
      </div>
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}
