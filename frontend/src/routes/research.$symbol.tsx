import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  NotebookPen,
} from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { StatMetric } from "@/shared/components/common/StatMetric";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { AddToIdeasButton } from "@/shared/components/common/AddToIdeasButton";
import { useCompany, useCompanyPrices } from "@/features/company/hooks/useCompanies";
import { fetchCompany, fetchCompanyPrices } from "@/features/company/api/companies";
import { PriceChart } from "@/features/company/components/PriceChart";
import { FinancialComparisonTable } from "@/features/company/components/FinancialComparisonTable";
import { ScoreBreakdownPanel } from "@/features/company/components/ScoreBreakdown";
import {
  StickyCompanyHeader,
  useStickySentinel,
} from "@/features/company/components/StickyCompanyHeader";
import { useJournalEntries } from "@/features/journal/hooks/useJournalEntries";
import { JournalEntryForm } from "@/features/journal/components/JournalEntryForm";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { Company, HistoricalPeRange, PriceRange, TrendSignal } from "@/shared/api/types";
import { cn } from "@/shared/utils/utils";

const DEFAULT_PRICE_RANGE: PriceRange = "6M";

type ResearchTab =
  | "overview"
  | "financials"
  | "fundamentals"
  | "valuation"
  | "technicals"
  | "shareholding"
  | "scores";

interface TabItem {
  id: ResearchTab;
  label: string;
  badge?: string;
}

export const Route = createFileRoute("/research/$symbol")({
  loader: async ({ params, context }) => {
    // Prefetch on the server so the first paint has real data, not a skeleton.
    // Errors (e.g. unknown symbol) are swallowed here — the component's
    // useCompany query still runs client-side and surfaces the error state.
    await context.queryClient
      .ensureQueryData({
        queryKey: queryKeys.companies.detail(params.symbol),
        queryFn: () => fetchCompany(params.symbol),
      })
      .catch(() => undefined);

    // Same treatment for the Price History chart — identical query key/fn
    // as useCompanyPrices below, so hydration never mismatches.
    await context.queryClient
      .ensureQueryData({
        queryKey: queryKeys.companies.prices(params.symbol, DEFAULT_PRICE_RANGE),
        queryFn: () => fetchCompanyPrices(params.symbol, DEFAULT_PRICE_RANGE),
      })
      .catch(() => undefined);
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.symbol} — Research | Stock Finder` }],
  }),
  component: ResearchDetail,
});

function ResearchDetail() {
  const { symbol } = Route.useParams();
  console.log("[SSR/Client] symbol:", symbol);
  const { data: c, isPending, isError, error, refetch } = useCompany(symbol);
  console.log("[SSR/Client] c exists:", Boolean(c), "isPending:", isPending);
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const { data: prices, isPending: pricesPending } = useCompanyPrices(symbol, priceRange);
  const { data: journalEntries = [] } = useJournalEntries();
  const existingThesis = journalEntries.find((e) => e.symbol === symbol);
  const [thesisFormOpen, setThesisFormOpen] = useState(false);
  const { sentinelRef, stuck } = useStickySentinel();

  const [activeTab, setActiveTab] = useState<ResearchTab>("overview");

  const latestPrice = prices && prices.length > 0 ? prices[prices.length - 1].close : c?.price;
  const company = c ? (latestPrice != null ? { ...c, price: latestPrice } : c) : undefined;

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "") as ResearchTab;
      if (
        [
          "overview",
          "financials",
          "fundamentals",
          "valuation",
          "technicals",
          "shareholding",
          "scores",
        ].includes(hash)
      ) {
        setActiveTab(hash);
      }
    }
  }, []);

  const handleTabChange = (tabId: ResearchTab) => {
    setActiveTab(tabId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tabId}`);
    }
  };

  const tabs: TabItem[] = c
    ? [
        { id: "overview", label: "Overview" },
        { id: "financials", label: "Financials" },
        { id: "fundamentals", label: "Fundamentals" },
        { id: "valuation", label: "Valuation" },
        { id: "technicals", label: "Technicals" },
        { id: "shareholding", label: "Shareholding" },
        { id: "scores", label: "Score & Analysis", badge: `${c.overallScore.toFixed(0)}/100` },
      ]
    : [];

  return (
    <AppShell>
      <div className="page-container py-8 pb-24">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-ink-subtle hover:text-ink transition-colors"
          >
            <ArrowLeft className="size-3" /> Back to Discover
          </Link>
          {c && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-subtle">
              <span>MARKETS</span>
              <span>/</span>
              <span>SECTOR : {c.sector}</span>
              <span>/</span>
              <span className="text-ink font-semibold">{c.symbol}</span>
            </div>
          )}
        </div>

        {company && <StickyCompanyHeader company={company} visible={stuck} />}

        {isPending && <ResearchDetailSkeleton />}

        {isError && (
          <div className="py-10">
            {(error as { status?: number })?.status === 404 ? (
              <div className="text-center py-14">
                <h1 className="text-heading-xl">Company not in library</h1>
                <p className="mt-2 text-ink-muted">Try searching with ⌘K.</p>
              </div>
            ) : (
              <ErrorState
                description="Couldn't load this company's research."
                onRetry={() => refetch()}
              />
            )}
          </div>
        )}

        {c && company && (
          <>
            {/* Header / Identity Hero */}
            <header className="animate-fade-up">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-[13px] text-ink-subtle">
                    <span className="font-semibold text-ink">
                      {c.exchange}:{c.symbol}
                    </span>
                    <span>·</span>
                    <span>{c.sector}</span>
                    <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-ink-muted ring-1 ring-hairline">
                      {c.riskLevel} Risk
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-positive/10 text-positive ring-1 ring-positive/20">
                      {c.trend}
                    </span>
                  </div>
                  <h1 className="text-company-title text-balance">{c.name}</h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <AddToIdeasButton symbol={c.symbol} size="md" />
                  <button
                    type="button"
                    onClick={() => setThesisFormOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md ring-1 ring-hairline text-sm font-medium hover:bg-secondary transition-colors"
                  >
                    <NotebookPen className="size-3.5" />
                    {existingThesis ? "Edit Thesis" : "Write Thesis"}
                  </button>
                </div>
              </div>

              {/* Price & Snapshot Metrics Row */}
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-6 gap-x-4 hairline-t hairline-b py-6">
                <StatMetric
                  label="Price"
                  value={`₹${company.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  sub={`${company.changePct >= 0 ? "+" : ""}${company.changePct.toFixed(2)}%`}
                  tone={company.changePct >= 0 ? "positive" : "negative"}
                  size="lg"
                />
                <StatMetric label="Market Cap" value={c.marketCap} size="lg" />
                <StatMetric label="P/E" value={c.pe.toFixed(1) + "x"} size="lg" />
                <StatMetric label="RoE" value={c.roe.toFixed(1) + "%"} tone="positive" size="lg" />
                <StatMetric label="Div Yield" value={c.divYield.toFixed(2) + "%"} size="lg" />
                <StatMetric
                  label="Overall Score"
                  value={`${c.overallScore.toFixed(0)}/100`}
                  tone="positive"
                  size="lg"
                  highlight
                />
              </div>

              <div ref={sentinelRef} />
            </header>

            {/* CONSTANT PRICE GRAPH: Kept visible across all tab sections */}
            <div className="mt-8 rounded-xl ring-1 ring-hairline bg-surface/40 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Price History & Chart</h2>
                  <p className="text-[12px] text-ink-subtle">
                    Interactive technical price and volume action
                  </p>
                </div>
                {c.supportResistance?.high52w != null && c.supportResistance?.low52w != null && (
                  <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-ink-subtle">
                    <span>
                      52W L:{" "}
                      <span className="text-negative font-medium">
                        ₹{c.supportResistance.low52w.toLocaleString("en-IN")}
                      </span>
                    </span>
                    <span>
                      52W H:{" "}
                      <span className="text-positive font-medium">
                        ₹{c.supportResistance.high52w.toLocaleString("en-IN")}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <PriceChart
                data={prices ?? []}
                range={priceRange}
                onRangeChange={setPriceRange}
                isLoading={pricesPending}
                symbol={c.symbol}
              />
            </div>

            {/* SECTION TABS (Screenshot 5745 Layout Pattern) */}
            <nav
              role="tablist"
              aria-label="Stock Research Sections"
              className="mt-10 border-b border-hairline sticky top-14 z-20 bg-paper/95 backdrop-blur-md"
            >
              <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`tab-${tab.id}`}
                      aria-controls={`panel-${tab.id}`}
                      aria-selected={isActive}
                      onClick={() => handleTabChange(tab.id)}
                      className={cn(
                        "relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-all rounded-t-lg flex items-center gap-2",
                        isActive
                          ? "text-ink font-semibold"
                          : "text-ink-muted hover:text-ink hover:bg-secondary/40",
                      )}
                    >
                      {isActive && (
                        <span className="size-2 rounded-full bg-positive shrink-0" />
                      )}
                      <span>{tab.label}</span>
                      {tab.badge && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 text-[10px] font-mono rounded-full font-medium",
                            isActive
                              ? "bg-accent/20 text-accent ring-1 ring-accent/30"
                              : "bg-secondary text-ink-subtle ring-1 ring-hairline",
                          )}
                        >
                          {tab.badge}
                        </span>
                      )}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-[0_0_8px_var(--color-accent)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* TAB CONTENTS CONTAINER */}
            <div className="mt-8">
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div
                  id="panel-overview"
                  role="tabpanel"
                  aria-labelledby="tab-overview"
                  className="space-y-12 animate-fade-up"
                >
                  {/* Rationale & Thesis */}
                  <Section label="Company Overview & Rationale">
                    <p className="text-base text-ink-muted leading-relaxed max-w-[75ch] text-pretty">
                      {c.rationale}
                    </p>

                    {existingThesis ? (
                      <div className="mt-6 p-5 rounded-xl ring-1 ring-hairline bg-surface/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-metric-label">Your Thesis</p>
                          <button
                            type="button"
                            onClick={() => setThesisFormOpen(true)}
                            className="text-[12px] text-accent hover:underline"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="text-sm text-ink leading-relaxed line-clamp-3">
                          {existingThesis.title || existingThesis.thesis}
                        </p>
                        <Link
                          to="/journal"
                          className="mt-3 inline-flex items-center gap-1 text-[12px] text-accent hover:underline underline-offset-2"
                        >
                          Open in Journal →
                        </Link>
                      </div>
                    ) : (
                      <div className="mt-6 p-4 rounded-xl ring-1 ring-hairline bg-surface/30 flex items-center justify-between gap-4">
                        <div className="text-sm text-ink-muted">
                          You haven&apos;t written an investment thesis for {c.symbol} yet.
                        </div>
                        <button
                          type="button"
                          onClick={() => setThesisFormOpen(true)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium ring-1 ring-hairline bg-surface hover:bg-secondary transition-colors"
                        >
                          Write Thesis
                        </button>
                      </div>
                    )}
                  </Section>

                  {/* Highlights Snapshot Grid */}
                  <Section label="Snapshot Fundamentals">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-y-6 gap-x-4">
                      <StatMetric label="P/E" value={fmtX(c.pe)} />
                      <StatMetric label="P/B" value={fmtX(c.pb)} />
                      <StatMetric label="RoE" value={fmtPct(c.roe)} tone="positive" />
                      <StatMetric label="ROCE" value={fmtPct(c.roce)} tone="positive" />
                      <StatMetric label="Debt/Eq" value={fmtNum(c.debtToEquity)} />
                      <StatMetric label="EPS" value={fmtRupee(c.eps)} />
                      <StatMetric
                        label="Rev Growth"
                        value={fmtPct(c.salesGrowthPct)}
                        tone={c.salesGrowthPct >= 0 ? "positive" : "negative"}
                      />
                      <StatMetric
                        label="Profit Growth"
                        value={fmtPct(c.profitGrowthPct)}
                        tone={c.profitGrowthPct >= 0 ? "positive" : "negative"}
                      />
                    </div>
                  </Section>

                  {/* Strengths & Risks */}
                  <Section label="Strengths & Risks">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                      <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface/40">
                        <p className="text-metric-label mb-3">Key Strengths</p>
                        <StrengthsList company={c} />
                      </div>
                      <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface/40">
                        <p className="text-metric-label mb-3">Flagged Risks</p>
                        <RisksList company={c} />
                      </div>
                    </div>
                  </Section>

                  {/* Checklist */}
                  <Section label="Due Diligence Checklist">
                    <div className="rounded-xl ring-1 ring-hairline divide-y divide-hairline overflow-hidden bg-surface/30">
                      {c.checklist.map((item) => (
                        <div key={item.label} className="flex items-center gap-4 px-5 py-3.5">
                          <div
                            className={
                              "size-4 rounded-full grid place-items-center " +
                              (item.done
                                ? "bg-positive text-white"
                                : "ring-1 ring-hairline-strong")
                            }
                          >
                            {item.done ? <Check className="size-2.5" strokeWidth={3} /> : null}
                          </div>
                          <span
                            className={"text-sm " + (item.done ? "text-ink" : "text-ink-muted")}
                          >
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* Quick Score Highlight with Navigation Button */}
                  <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface-raised flex flex-wrap items-center justify-between gap-6">
                    <div className="space-y-1">
                      <p className="text-metric-label">Research Score Verdict</p>
                      <h3 className="text-lg font-semibold text-ink">
                        Scored {c.overallScore.toFixed(0)} out of 100
                      </h3>
                      <p className="text-xs text-ink-muted">
                        Fundamental: {c.fundamentalScore.toFixed(0)}/100 · Technical:{" "}
                        {c.technicalScore.toFixed(0)}/100
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTabChange("scores")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md ring-1 ring-accent/30 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                    >
                      View Full Score Breakdown <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: FINANCIALS */}
              {activeTab === "financials" && (
                <div
                  id="panel-financials"
                  role="tabpanel"
                  aria-labelledby="tab-financials"
                  className="space-y-12 animate-fade-up"
                >
                  <div>
                    <h2 className="text-section-heading">Financial Statements & Comparisons</h2>
                    <p className="text-sm text-ink-muted mt-1">
                      Quarterly and annual financial comparisons across revenue, profit, and
                      operating performance.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
                    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <Section label="Quarterly Comparison">
                        <FinancialComparisonTable data={c.quarterlyComparison} />
                      </Section>
                    </div>

                    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <Section label="Annual Comparison">
                        <FinancialComparisonTable data={c.annualComparison} />
                      </Section>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: FUNDAMENTALS */}
              {activeTab === "fundamentals" && (
                <div
                  id="panel-fundamentals"
                  role="tabpanel"
                  aria-labelledby="tab-fundamentals"
                  className="space-y-12 animate-fade-up"
                >
                  <Section label="Fundamental Ratios">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-y-6 gap-x-6 p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <StatMetric label="P/B" value={c.pb.toFixed(2) + "x"} />
                      <StatMetric label="ROCE" value={c.roce.toFixed(1) + "%"} />
                      <StatMetric label="Debt/Equity" value={c.debtToEquity.toFixed(2)} />
                      <StatMetric label="EPS" value={"₹" + c.eps.toFixed(2)} />
                      <StatMetric
                        label="Revenue Growth"
                        value={c.salesGrowthPct.toFixed(1) + "%"}
                        tone={c.salesGrowthPct >= 0 ? "positive" : "negative"}
                      />
                      <StatMetric
                        label="Profit Growth"
                        value={c.profitGrowthPct.toFixed(1) + "%"}
                        tone={c.profitGrowthPct >= 0 ? "positive" : "negative"}
                      />
                      <StatMetric
                        label="Promoter Holding"
                        value={c.promoterHoldingPct.toFixed(1) + "%"}
                      />
                      <StatMetric label="RoE" value={c.roe.toFixed(1) + "%"} tone="positive" />
                    </div>

                    {c.trendSignals.length > 0 &&
                      c.trendSignals.some((s) => s.direction !== "Insufficient") && (
                        <div className="mt-8">
                          <TrendSignals signals={c.trendSignals} />
                        </div>
                      )}
                  </Section>

                  {/* Quick Shareholding Summary Callout */}
                  {c.shareholdingSummary.categories.length > 0 && (
                    <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface/40 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono uppercase tracking-widest text-ink-subtle">
                          Shareholding Structure
                        </p>
                        <p className="text-sm text-ink font-medium mt-0.5">
                          Latest {c.shareholdingSummary.latestQuarter || "quarter"} promoter holding
                          at {c.promoterHoldingPct.toFixed(1)}%
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTabChange("shareholding")}
                        className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
                      >
                        See Full Shareholding Trend →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: VALUATION */}
              {activeTab === "valuation" && (
                <div
                  id="panel-valuation"
                  role="tabpanel"
                  aria-labelledby="tab-valuation"
                  className="space-y-12 animate-fade-up"
                >
                  <Section label="Valuation Multiples">
                    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-6 gap-x-6">
                        <StatMetric label="Market Cap" value={c.valuation.marketCap ?? "N/A"} />
                        <StatMetric
                          label="Enterprise Value"
                          value={fmtCr(c.valuation.enterpriseValueCr)}
                        />
                        <StatMetric label="P/E Ratio" value={fmtX(c.valuation.pe)} />
                        <StatMetric label="Forward P/E" value={fmtX(c.valuation.forwardPe)} />
                        <StatMetric label="PEG Ratio" value={fmtNum(c.valuation.peg)} />
                        <StatMetric label="Price to Book" value={fmtX(c.valuation.pb)} />
                        <StatMetric label="EV/EBITDA" value={fmtX(c.valuation.evEbitda)} />
                        <StatMetric label="Dividend Yield" value={fmtPct(c.valuation.divYield)} />
                        <StatMetric label="Beta" value={fmtNum(c.valuation.beta)} />
                        <StatMetric
                          label="Shares Outstanding"
                          value={fmtShares(c.valuation.sharesOutstanding)}
                        />
                        <StatMetric label="Free Float" value={fmtPct(c.valuation.freeFloatPct)} />
                        <StatMetric
                          label="Book Value / Share"
                          value={fmtRupee(c.valuation.bookValuePerShare)}
                        />
                      </div>
                    </div>

                    {c.historicalPeRange && c.historicalPeRange.pe_min !== null && (
                      <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30 mt-6">
                        <HistoricalPeBand range={c.historicalPeRange} />
                      </div>
                    )}
                  </Section>

                  <Section label="Price Levels & Pivots">
                    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-y-6 gap-x-6">
                        <StatMetric
                          label="Support 1"
                          value={fmtRupee(c.supportResistance.support1)}
                          tone="negative"
                        />
                        <StatMetric
                          label="Support 2"
                          value={fmtRupee(c.supportResistance.support2)}
                          tone="negative"
                        />
                        <StatMetric label="Pivot" value={fmtRupee(c.supportResistance.pivot)} />
                        <StatMetric
                          label="Resistance 1"
                          value={fmtRupee(c.supportResistance.resistance1)}
                          tone="positive"
                        />
                        <StatMetric
                          label="Resistance 2"
                          value={fmtRupee(c.supportResistance.resistance2)}
                          tone="positive"
                        />
                        <StatMetric label="VWAP" value={fmtRupee(c.supportResistance.vwap)} />
                        <StatMetric
                          label="52 Week High"
                          value={fmtRupee(c.supportResistance.high52w)}
                          tone="positive"
                        />
                        <StatMetric
                          label="52 Week Low"
                          value={fmtRupee(c.supportResistance.low52w)}
                          tone="negative"
                        />
                      </div>
                    </div>
                  </Section>
                </div>
              )}

              {/* TAB 5: TECHNICALS */}
              {activeTab === "technicals" && (
                <div
                  id="panel-technicals"
                  role="tabpanel"
                  aria-labelledby="tab-technicals"
                  className="space-y-12 animate-fade-up"
                >
                  <Section label="Technical Indicators">
                    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-6 gap-x-6">
                        <StatMetric label="RSI (14)" value={c.rsi.toFixed(0)} />
                        <StatMetric
                          label="Above 50 DMA"
                          value={c.aboveEma50 ? "Yes" : "No"}
                          tone={c.aboveEma50 ? "positive" : "negative"}
                        />
                        <StatMetric
                          label="Above 200 DMA"
                          value={c.aboveEma200 ? "Yes" : "No"}
                          tone={c.aboveEma200 ? "positive" : "negative"}
                        />
                        <StatMetric
                          label="Golden Cross"
                          value={c.goldenCross ? "Yes" : "No"}
                          tone={c.goldenCross ? "positive" : "neutral"}
                        />
                        <StatMetric
                          label="Volume Breakout"
                          value={c.volumeBreakout ? "Yes" : "No"}
                          tone={c.volumeBreakout ? "positive" : "neutral"}
                        />
                        <StatMetric
                          label="Trend"
                          value={c.trend}
                          tone={
                            c.trend === "Uptrend"
                              ? "positive"
                              : c.trend === "Downtrend"
                                ? "negative"
                                : "neutral"
                          }
                        />
                      </div>
                    </div>
                  </Section>

                  <Section label="Key Price Bands">
                    <div className="p-6 rounded-xl ring-1 ring-hairline bg-surface/30">
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-y-6 gap-x-6">
                        <StatMetric
                          label="Support 1"
                          value={fmtRupee(c.supportResistance.support1)}
                          tone="negative"
                        />
                        <StatMetric
                          label="Support 2"
                          value={fmtRupee(c.supportResistance.support2)}
                          tone="negative"
                        />
                        <StatMetric label="Pivot" value={fmtRupee(c.supportResistance.pivot)} />
                        <StatMetric
                          label="Resistance 1"
                          value={fmtRupee(c.supportResistance.resistance1)}
                          tone="positive"
                        />
                        <StatMetric
                          label="Resistance 2"
                          value={fmtRupee(c.supportResistance.resistance2)}
                          tone="positive"
                        />
                        <StatMetric label="VWAP" value={fmtRupee(c.supportResistance.vwap)} />
                        <StatMetric
                          label="52W High"
                          value={fmtRupee(c.supportResistance.high52w)}
                          tone="positive"
                        />
                        <StatMetric
                          label="52W Low"
                          value={fmtRupee(c.supportResistance.low52w)}
                          tone="negative"
                        />
                      </div>
                    </div>
                  </Section>
                </div>
              )}

              {/* TAB 6: SHAREHOLDING */}
              {activeTab === "shareholding" && (
                <div
                  id="panel-shareholding"
                  role="tabpanel"
                  aria-labelledby="tab-shareholding"
                  className="space-y-10 animate-fade-up"
                >
                  <div>
                    <h2 className="text-section-heading">Shareholding Pattern & Changes</h2>
                    {c.shareholdingSummary.latestQuarter && (
                      <p className="mt-1 text-sm text-ink-muted">
                        Reporting period: {c.shareholdingSummary.latestQuarter}
                        {c.shareholdingSummary.previousQuarter &&
                          ` vs ${c.shareholdingSummary.previousQuarter}`}
                        {c.shareholdingSummary.source === "yfinance_approx" &&
                          " · approximate source"}
                      </p>
                    )}
                  </div>

                  {/* Directional change badges */}
                  {c.shareholdingSummary.categories.some((cat) => cat.changePct != null) && (
                    <div className="flex flex-wrap gap-2.5">
                      {c.shareholdingSummary.categories
                        .filter((cat) => cat.changePct != null && cat.latest != null)
                        .map((cat) => {
                          const change = cat.changePct!;
                          const up = change > 0;
                          const neutral = Math.abs(change) < 0.05;
                          const tone = neutral
                            ? "text-ink-subtle"
                            : up
                              ? "text-positive"
                              : "text-negative";
                          const arrow = neutral ? "→" : up ? "↑" : "↓";
                          const sign = change > 0 ? "+" : "";
                          return (
                            <span
                              key={cat.category}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ring-1 ring-hairline bg-surface/40 ${tone}`}
                            >
                              <span className="text-ink-muted">{cat.category}</span>
                              <span>{arrow}</span>
                              <span className="font-mono tabular-nums font-semibold">
                                {sign}
                                {change.toFixed(2)}pp
                              </span>
                            </span>
                          );
                        })}
                    </div>
                  )}

                  {/* Shareholding Trend Table */}
                  <div className="w-full rounded-xl ring-1 ring-hairline overflow-hidden overflow-x-auto bg-surface/30">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-secondary/50">
                          <th className="text-left font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            Quarter
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            Promoter
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            FII
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            DII
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            Mutual Funds
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            Public
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            Govt
                          </th>
                          <th className="text-right font-medium text-metric-label px-5 py-3.5 whitespace-nowrap">
                            Others
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.shareholdingTrend.map((row) => (
                          <tr key={row.quarter} className="hairline-t hover:bg-secondary/20">
                            <td className="text-left text-table-label text-ink-muted px-5 py-3.5 whitespace-nowrap">
                              {row.quarter}
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5 font-medium">
                              {row.promoter.toFixed(1)}%
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5">
                              {row.fii.toFixed(1)}%
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5">
                              {row.dii.toFixed(1)}%
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5">
                              {row.mutualFunds !== null ? `${row.mutualFunds.toFixed(1)}%` : "N/A"}
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5">
                              {row.public.toFixed(1)}%
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5">
                              {row.government !== null ? `${row.government.toFixed(1)}%` : "N/A"}
                            </td>
                            <td className="text-right text-table-value tabular-nums px-5 py-3.5">
                              {row.others !== null ? `${row.others.toFixed(1)}%` : "N/A"}
                            </td>
                          </tr>
                        ))}
                        {c.shareholdingTrend.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-5 py-6 text-sm text-ink-subtle text-center">
                              No shareholding data available yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 7: SCORES & ANALYSIS */}
              {activeTab === "scores" && (
                <div
                  id="panel-scores"
                  role="tabpanel"
                  aria-labelledby="tab-scores"
                  className="space-y-12 animate-fade-up"
                >
                  <Section label="Overall Score Assessment">
                    <div className="rounded-xl ring-1 ring-hairline bg-surface-raised p-6 sm:p-8">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-6 gap-x-6 pb-6 border-b border-hairline">
                        <StatMetric
                          label="Overall Score"
                          value={c.overallScore.toFixed(0) + "/100"}
                          tone="positive"
                          size="lg"
                          highlight
                        />
                        <StatMetric
                          label="Fundamental Score"
                          value={c.fundamentalScore.toFixed(0) + "/100"}
                          size="lg"
                        />
                        <StatMetric
                          label="Technical Score"
                          value={c.technicalScore.toFixed(0) + "/100"}
                          size="lg"
                        />
                      </div>

                      <div className="pt-6">
                        <ScoreBreakdownPanel company={c} />
                      </div>

                      <div className="mt-8 pt-6 border-t border-hairline flex flex-wrap items-center gap-3">
                        <AddToIdeasButton symbol={c.symbol} size="md" />
                        <button
                          type="button"
                          onClick={() => setThesisFormOpen(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md ring-1 ring-hairline text-sm font-medium hover:bg-secondary transition-colors bg-surface-raised"
                        >
                          <NotebookPen className="size-3.5" />
                          {existingThesis ? "Edit Thesis" : "Write Thesis"}
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section label="Scored Factors: Strengths vs Risks">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                      <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface/40">
                        <p className="text-metric-label mb-3">Passed Indicators</p>
                        <StrengthsList company={c} />
                      </div>
                      <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface/40">
                        <p className="text-metric-label mb-3">Flagged Indicators</p>
                        <RisksList company={c} />
                      </div>
                    </div>
                  </Section>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {c && (
        <JournalEntryForm
          open={thesisFormOpen}
          onOpenChange={setThesisFormOpen}
          entry={existingThesis}
          defaultSymbol={c.symbol}
        />
      )}
    </AppShell>
  );
}

/** Quick-scan strengths list, folded from the same real `scoreBreakdown`
 * the full "Why this score?" panel renders, so nothing here is a second
 * source of truth: a metric is a strength when it passed and has real
 * data. Shown side by side with risks, ahead of the concluding score. */
function StrengthsList({ company: c }: { company: Company }) {
  if (!c.scoreBreakdown) return null;
  const allMetrics = [...c.scoreBreakdown.fundamental, ...c.scoreBreakdown.technical];
  const strengths = allMetrics.filter((m) => m.passed && m.maxScore > 0).slice(0, 5);
  if (strengths.length === 0) return null;

  return (
    <ul className="space-y-2">
      {strengths.map((m) => (
        <li key={m.metric} className="text-sm text-ink flex items-start gap-2.5">
          <Check className="size-4 mt-0.5 shrink-0 text-positive" />
          {m.reason}
        </li>
      ))}
    </ul>
  );
}

/** Same `scoreBreakdown` data, the failed side — a metric is a risk
 * when it didn't pass and has real data. Shown side by side with
 * strengths, ahead of the concluding score. */
function RisksList({ company: c }: { company: Company }) {
  if (!c.scoreBreakdown) {
    return <p className="text-sm text-ink-subtle">No score breakdown available yet.</p>;
  }
  const allMetrics = [...c.scoreBreakdown.fundamental, ...c.scoreBreakdown.technical];
  const risks = allMetrics.filter((m) => !m.passed && m.maxScore > 0);

  if (risks.length === 0) {
    return (
      <p className="text-sm text-ink-subtle">
        No flagged risks — every scored metric passed its threshold.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {risks.map((m) => (
        <li key={m.metric} className="text-sm text-ink-muted flex items-start gap-2.5">
          <AlertTriangle className="size-4 mt-0.5 shrink-0 text-negative" />
          <span>{m.reason}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-section-heading mb-5">{label}</h2>
      {children}
    </section>
  );
}

/** Shared N/A-safe formatters for the Valuation and Support & Resistance
 * StatMetric grids above — every value on `c.valuation`/
 * `c.supportResistance` can be `null` (see shared/api/types.ts), and
 * these render that as "N/A" rather than "₹null" or "NaNx". */
function fmtRupee(value: number | null): string {
  return value === null ? "N/A" : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtCr(value: number | null): string {
  return value === null
    ? "N/A"
    : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}cr`;
}

function fmtX(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(2)}x`;
}

function fmtPct(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(2)}%`;
}

function fmtNum(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(2);
}

function fmtShares(value: number | null): string {
  return value === null
    ? "N/A"
    : `${(value / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
}

function ResearchDetailSkeleton() {
  return (
    <div className="animate-fade-up">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className="h-14 w-3/4 mb-4" />
      <Skeleton className="h-5 w-1/2 mb-10" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 py-6 hairline-t hairline-b">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full mt-8" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend Signals component (R1) — directional trend over the last 4 quarters.
// ---------------------------------------------------------------------------

const DIRECTION_CONFIG = {
  Accelerating: {
    icon: "↑",
    label: "Accelerating",
    className: "text-positive ring-positive/30 bg-positive/5",
  },
  Improving: {
    icon: "↑",
    label: "Improving",
    className: "text-positive/80 ring-positive/20 bg-positive/5",
  },
  Steady: {
    icon: "→",
    label: "Steady",
    className: "text-ink-subtle ring-hairline",
  },
  Decelerating: {
    icon: "↓",
    label: "Decelerating",
    className: "text-[oklch(0.62_0.18_60)] ring-[oklch(0.62_0.18_60)]/25 bg-[oklch(0.62_0.18_60)]/5",
  },
  Contracting: {
    icon: "↓",
    label: "Contracting",
    className: "text-negative ring-negative/25 bg-negative/5",
  },
  Insufficient: {
    icon: "—",
    label: "No data",
    className: "text-ink-subtle ring-hairline opacity-50",
  },
} as const;

function TrendSignals({ signals }: { signals: TrendSignal[] }) {
  const visible = signals.filter((s) => s.direction !== "Insufficient");
  if (visible.length === 0) return null;

  return (
    <div className="mt-8 pt-6 hairline-t">
      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-subtle mb-4">
        4-Quarter Trend
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {visible.map((signal) => {
          const cfg = DIRECTION_CONFIG[signal.direction] ?? DIRECTION_CONFIG.Steady;
          const hasGain = signal.delta !== null;
          const sign = signal.delta !== null && signal.delta > 0 ? "+" : "";
          const deltaStr =
            signal.unit === "%"
              ? `${sign}${signal.delta?.toFixed(1)}pp`
              : signal.delta !== null
                ? `${sign}${
                    Math.abs(signal.delta) >= 1000
                      ? (signal.delta / 1000).toFixed(1) + "K"
                      : signal.delta.toFixed(0)
                  } Cr`
                : null;

          return (
            <div key={signal.metric} className={`rounded-lg p-3.5 ring-1 ${cfg.className}`}>
              <p className="text-[11px] font-medium text-ink-muted mb-1.5">{signal.metric}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-lg leading-none font-semibold">{cfg.icon}</span>
                <span className="text-[13px] font-semibold">{cfg.label}</span>
              </div>
              {hasGain && deltaStr && (
                <p className="mt-1 text-[11px] font-mono tabular-nums text-ink-muted">
                  {deltaStr} over 4Q
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historical P/E Band component (R7)
// ---------------------------------------------------------------------------

function HistoricalPeBand({ range }: { range: HistoricalPeRange }) {
  const { pe_min, pe_max, pe_median, current_pe, percentile, years } = range;
  if (pe_min === null || pe_max === null) return null;

  const span = pe_max - pe_min;

  // Position of a value as a percentage of the min→max range, clamped 0-100.
  const pct = (v: number) =>
    span === 0 ? 50 : Math.max(0, Math.min(100, ((v - pe_min) / span) * 100));

  const verdict =
    percentile === null
      ? null
      : percentile >= 75
        ? { label: "Expensive vs. own history", className: "text-negative" }
        : percentile >= 40
          ? { label: "Fairly valued vs. own history", className: "text-ink-muted" }
          : { label: "Below historical median", className: "text-positive" };

  return (
    <div className="mt-8 pt-6 hairline-t">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[12px] font-medium text-ink-muted">
          Historical P/E Range ({years}Y)
        </p>
        {verdict && (
          <p className={`text-[12px] font-medium ${verdict.className}`}>{verdict.label}</p>
        )}
      </div>

      {/* Range bar */}
      <div className="relative h-2 w-full rounded-full bg-secondary overflow-visible mb-3">
        {/* Median marker */}
        {pe_median !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-px h-4 bg-ink-subtle"
            style={{ left: `${pct(pe_median)}%` }}
            title={`Median: ${pe_median}x`}
          />
        )}
        {/* Filled bar from min to current */}
        {current_pe !== null && (
          <div
            className="absolute top-0 left-0 h-full rounded-full bg-accent/40"
            style={{ width: `${pct(current_pe)}%` }}
          />
        )}
        {/* Current P/E dot */}
        {current_pe !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent ring-2 ring-surface"
            style={{ left: `${pct(current_pe)}%` }}
            title={`Current: ${current_pe}x`}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
        <span className="text-ink-subtle">{pe_min}x</span>
        {pe_median !== null && (
          <span className="text-ink-subtle">
            Med {pe_median}x
          </span>
        )}
        <span className="text-ink-subtle">{pe_max}x</span>
      </div>

      {percentile !== null && current_pe !== null && (
        <p className="mt-2 text-[11px] text-ink-subtle font-mono">
          Current {current_pe}x · {percentile}th percentile of {years}-year range
        </p>
      )}
    </div>
  );
}
