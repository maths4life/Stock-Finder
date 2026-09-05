import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, NotebookPen } from "lucide-react";
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
import type { Company, PriceRange } from "@/shared/api/types";

const DEFAULT_PRICE_RANGE: PriceRange = "6M";

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
  const { data: c, isPending, isError, error, refetch } = useCompany(symbol);
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const { data: prices, isPending: pricesPending } = useCompanyPrices(symbol, priceRange);
  const { data: journalEntries = [] } = useJournalEntries();
  const existingThesis = journalEntries.find((e) => e.symbol === symbol);
  const [thesisFormOpen, setThesisFormOpen] = useState(false);
  const { sentinelRef, stuck } = useStickySentinel();

  return (
    <AppShell>
      <div className="page-container py-10 pb-24">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-ink-subtle hover:text-ink transition-colors mb-10"
        >
          <ArrowLeft className="size-3" /> Back to Discover
        </Link>

        {c && <StickyCompanyHeader company={c} visible={stuck} />}

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

        {c && (
          <>
            {/* Hero — Company header, full width */}
            <header className="animate-fade-up">
              <div className="flex items-center gap-2.5 mb-3 text-[13px] text-ink-subtle">
                <span className="font-medium">
                  {c.exchange}:{c.symbol}
                </span>
                <span>·</span>
                <span>{c.sector}</span>
              </div>
              <h1 className="text-company-title text-balance">{c.name}</h1>
              <p className="mt-4 text-base text-ink-muted leading-relaxed max-w-[70ch] text-pretty">
                {c.rationale}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
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

              {existingThesis && (
                <div className="mt-6 p-5 rounded-xl ring-1 ring-hairline bg-secondary/40">
                  <p className="text-metric-label mb-2">Your thesis</p>
                  <p className="text-sm text-ink leading-relaxed line-clamp-3">
                    {existingThesis.title || existingThesis.thesis}
                  </p>
                  <Link
                    to="/journal"
                    className="mt-3 inline-flex items-center gap-1 text-[12px] text-accent hover:underline underline-offset-2"
                  >
                    Open Journal →
                  </Link>
                </div>
              )}

              {/* Score summary, full width */}
              <div className="mt-10 grid grid-cols-2 md:grid-cols-6 gap-y-7 gap-x-4 hairline-t hairline-b py-7">
                <StatMetric
                  label="Price"
                  value={`₹${c.price.toLocaleString("en-IN")}`}
                  sub={`${c.changePct >= 0 ? "+" : ""}${c.changePct.toFixed(2)}%`}
                  tone={c.changePct >= 0 ? "positive" : "negative"}
                  size="lg"
                />
                <StatMetric label="Market Cap" value={c.marketCap} size="lg" />
                <StatMetric label="P/E" value={c.pe.toFixed(1) + "x"} size="lg" />
                <StatMetric label="RoE" value={c.roe.toFixed(1) + "%"} tone="positive" size="lg" />
                <StatMetric label="Div Yield" value={c.divYield.toFixed(2) + "%"} size="lg" />
                <StatMetric label="Risk Level" value={c.riskLevel} size="lg" />
              </div>

              <div className="grid grid-cols-3 gap-y-6 gap-x-4 py-7 hairline-b">
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

              <div ref={sentinelRef} />
            </header>

            {/* Price chart — the dominant visual on the page, so it breaks out of the
                label-sidebar grid the other sections use and takes the full content width. */}
            <div className="mt-16">
              <PriceChart
                data={prices ?? []}
                range={priceRange}
                onRangeChange={setPriceRange}
                isLoading={pricesPending}
                symbol={c.symbol}
              />
            </div>

            {/* Two-column research grid — Fundamentals paired with the
                score explanation, Technicals paired with Risks, per the
                desktop layout spec. Stacks to one column below lg. */}
            <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-14">
              <Section label="Fundamentals">
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
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
                </div>
              </Section>

              <Section label="Why This Score">
                <StrengthsList company={c} />
                <ScoreBreakdownPanel company={c} />
              </Section>

              <Section label="Technicals">
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
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
              </Section>

              <Section label="Risks">
                <RisksList company={c} />
              </Section>
            </div>

            {/* Full-width sections and tables */}
            <div className="mt-16 space-y-16">
              <Section label="Support & Resistance">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
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
              </Section>

              <Section label="Valuation">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
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
              </Section>

              <Section label="Quarterly Comparison">
                <FinancialComparisonTable data={c.quarterlyComparison} />
              </Section>

              <Section label="Annual Comparison">
                <FinancialComparisonTable data={c.annualComparison} />
              </Section>

              <Section label="Shareholding">
                {c.shareholdingSummary.latestQuarter && (
                  <p className="text-[13px] text-ink-subtle mb-3">
                    {c.shareholdingSummary.latestQuarter}
                    {c.shareholdingSummary.previousQuarter &&
                      ` vs ${c.shareholdingSummary.previousQuarter}`}
                    {c.shareholdingSummary.source === "yfinance_approx" &&
                      " · approximate (see note)"}
                  </p>
                )}
                <div className="w-full rounded-lg ring-1 ring-hairline overflow-hidden overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-secondary/50">
                        <th className="text-left font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          Quarter
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          Promoter
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          FII
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          DII
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          Mutual Funds
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          Public
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          Govt
                        </th>
                        <th className="text-right font-medium text-metric-label px-5 py-3 whitespace-nowrap">
                          Others
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.shareholdingTrend.map((row) => (
                        <tr key={row.quarter} className="hairline-t">
                          <td className="text-left text-table-label text-ink-muted px-5 py-3.5 whitespace-nowrap">
                            {row.quarter}
                          </td>
                          <td className="text-right text-table-value tabular-nums px-5 py-3.5">
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
                          <td colSpan={8} className="px-5 py-3.5 text-sm text-ink-subtle">
                            No shareholding data available yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section label="Checklist">
                <div className="rounded-xl ring-1 ring-hairline divide-y divide-hairline overflow-hidden">
                  {c.checklist.map((item) => (
                    <div key={item.label} className="flex items-center gap-4 px-5 py-3.5">
                      <div
                        className={
                          "size-4 rounded-full grid place-items-center " +
                          (item.done ? "bg-positive text-white" : "ring-1 ring-hairline-strong")
                        }
                      >
                        {item.done ? <Check className="size-2.5" strokeWidth={3} /> : null}
                      </div>
                      <span className={"text-sm " + (item.done ? "text-ink" : "text-ink-muted")}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            <div className="mt-14 flex items-center gap-3">
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
 * data. Paired with the Fundamentals column. */
function StrengthsList({ company: c }: { company: Company }) {
  if (!c.scoreBreakdown) return null;
  const allMetrics = [...c.scoreBreakdown.fundamental, ...c.scoreBreakdown.technical];
  const strengths = allMetrics.filter((m) => m.passed && m.maxScore > 0).slice(0, 5);
  if (strengths.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-metric-label mb-2.5">Strengths</p>
      <ul className="space-y-2">
        {strengths.map((m) => (
          <li key={m.metric} className="text-sm text-ink flex items-start gap-2.5">
            <Check className="size-4 mt-0.5 shrink-0 text-positive" />
            {m.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Same `scoreBreakdown` data, the failed side — a metric is a risk
 * when it didn't pass and has real data. Paired with the Technicals
 * column so the two-column desktop layout reads as "what's working /
 * what to watch" side by side. */
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
