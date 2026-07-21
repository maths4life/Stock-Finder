import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { Sparkline } from "@/shared/components/common/Sparkline";
import { StatMetric } from "@/shared/components/common/StatMetric";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCompany, useCompanyPrices } from "@/features/company/hooks/useCompanies";
import { fetchCompany, fetchCompanyPrices } from "@/features/company/api/companies";
import { PriceChart } from "@/features/company/components/PriceChart";
import { FinancialComparisonTable } from "@/features/company/components/FinancialComparisonTable";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { PriceRange } from "@/shared/api/types";

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
    meta: [{ title: `${params.symbol} — Research | Quant` }],
  }),
  component: ResearchDetail,
});

function ResearchDetail() {
  const { symbol } = Route.useParams();
  const { data: c, isPending, isError, error, refetch } = useCompany(symbol);
  const [priceRange, setPriceRange] = useState<PriceRange>(DEFAULT_PRICE_RANGE);
  const { data: prices, isPending: pricesPending } = useCompanyPrices(symbol, priceRange);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-10 pb-24">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-ink-subtle hover:text-ink transition-colors mb-10"
        >
          <ArrowLeft className="size-3" /> Back to Discover
        </Link>

        {isPending && <ResearchDetailSkeleton />}

        {isError && (
          <div className="py-10">
            {(error as { status?: number })?.status === 404 ? (
              <div className="text-center py-14">
                <h1 className="text-heading-xl">Company not in library</h1>
                <p className="mt-2 text-ink-muted">Try searching with ⌘K.</p>
              </div>
            ) : (
              <ErrorState description="Couldn't load this company's research." onRetry={() => refetch()} />
            )}
          </div>
        )}

        {c && (
          <>
            {/* Hero */}
            <header className="animate-fade-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">
                  {c.exchange}:{c.symbol}
                </span>
                <span className="text-ink-subtle">·</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">{c.sector}</span>
              </div>
              <h1 className="text-display md:text-display-lg text-balance">{c.name}</h1>
              <p className="mt-5 text-lg text-ink-muted leading-snug max-w-[52ch] text-pretty">{c.rationale}</p>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-6 gap-y-6 hairline-t hairline-b py-6">
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

              <div className="grid grid-cols-3 gap-y-6 py-6 hairline-b">
                <StatMetric label="Overall Score" value={c.overallScore.toFixed(0) + "/100"} tone="positive" size="lg" highlight />
                <StatMetric label="Fundamental Score" value={c.fundamentalScore.toFixed(0) + "/100"} size="lg" />
                <StatMetric label="Technical Score" value={c.technicalScore.toFixed(0) + "/100"} size="lg" />
              </div>
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

            {/* Sections */}
            <div className="mt-14 space-y-14">
              <Section label="Valuation">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 hairline-t pt-6">
                  <StatMetric label="Market Cap" value={c.valuation.marketCap ?? "N/A"} />
                  <StatMetric label="Enterprise Value" value={fmtCr(c.valuation.enterpriseValueCr)} />
                  <StatMetric label="P/E Ratio" value={fmtX(c.valuation.pe)} />
                  <StatMetric label="Forward P/E" value={fmtX(c.valuation.forwardPe)} />
                  <StatMetric label="PEG Ratio" value={fmtNum(c.valuation.peg)} />
                  <StatMetric label="Price to Book" value={fmtX(c.valuation.pb)} />
                  <StatMetric label="EV/EBITDA" value={fmtX(c.valuation.evEbitda)} />
                  <StatMetric label="Dividend Yield" value={fmtPct(c.valuation.divYield)} />
                  <StatMetric label="Beta" value={fmtNum(c.valuation.beta)} />
                  <StatMetric label="Shares Outstanding" value={fmtShares(c.valuation.sharesOutstanding)} />
                  <StatMetric label="Free Float" value={fmtPct(c.valuation.freeFloatPct)} />
                  <StatMetric label="Book Value / Share" value={fmtRupee(c.valuation.bookValuePerShare)} />
                </div>
              </Section>

              <Section label="Quarterly Comparison">
                <FinancialComparisonTable data={c.quarterlyComparison} />
              </Section>

              <Section label="Annual Comparison">
                <FinancialComparisonTable data={c.annualComparison} />
              </Section>

              <Section label="Support & Resistance">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 hairline-t pt-6">
                  <StatMetric label="Support 1" value={fmtRupee(c.supportResistance.support1)} tone="negative" />
                  <StatMetric label="Support 2" value={fmtRupee(c.supportResistance.support2)} tone="negative" />
                  <StatMetric label="Pivot" value={fmtRupee(c.supportResistance.pivot)} />
                  <StatMetric label="Resistance 1" value={fmtRupee(c.supportResistance.resistance1)} tone="positive" />
                  <StatMetric label="Resistance 2" value={fmtRupee(c.supportResistance.resistance2)} tone="positive" />
                  <StatMetric label="VWAP" value={fmtRupee(c.supportResistance.vwap)} />
                  <StatMetric label="52 Week High" value={fmtRupee(c.supportResistance.high52w)} tone="positive" />
                  <StatMetric label="52 Week Low" value={fmtRupee(c.supportResistance.low52w)} tone="negative" />
                </div>
              </Section>

              <Section label="Fundamentals">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 hairline-t pt-6">
                  <StatMetric label="P/B" value={c.pb.toFixed(2) + "x"} />
                  <StatMetric label="ROCE" value={c.roce.toFixed(1) + "%"} />
                  <StatMetric label="Debt/Equity" value={c.debtToEquity.toFixed(2)} />
                  <StatMetric label="EPS" value={"₹" + c.eps.toFixed(2)} />
                  <StatMetric label="Revenue Growth" value={c.salesGrowthPct.toFixed(1) + "%"} tone={c.salesGrowthPct >= 0 ? "positive" : "negative"} />
                  <StatMetric label="Profit Growth" value={c.profitGrowthPct.toFixed(1) + "%"} tone={c.profitGrowthPct >= 0 ? "positive" : "negative"} />
                  <StatMetric label="Promoter Holding" value={c.promoterHoldingPct.toFixed(1) + "%"} />
                </div>
              </Section>

              <Section label="Technicals">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 hairline-t pt-6">
                  <StatMetric label="RSI (14)" value={c.rsi.toFixed(0)} />
                  <StatMetric label="Above 50 DMA" value={c.aboveEma50 ? "Yes" : "No"} tone={c.aboveEma50 ? "positive" : "negative"} />
                  <StatMetric label="Above 200 DMA" value={c.aboveEma200 ? "Yes" : "No"} tone={c.aboveEma200 ? "positive" : "negative"} />
                  <StatMetric label="Golden Cross" value={c.goldenCross ? "Yes" : "No"} tone={c.goldenCross ? "positive" : "neutral"} />
                  <StatMetric label="Volume Breakout" value={c.volumeBreakout ? "Yes" : "No"} tone={c.volumeBreakout ? "positive" : "neutral"} />
                  <StatMetric label="Trend" value={c.trend} tone={c.trend === "Uptrend" ? "positive" : c.trend === "Downtrend" ? "negative" : "neutral"} />
                </div>
              </Section>

              <Section label="Quarterly Financials">
                <div className="grid grid-cols-3 gap-6 hairline-t pt-6">
                  {c.quarterlyFinancials.map((q) => (
                    <div key={q.quarter}>
                      <p className="text-[11px] uppercase tracking-widest text-ink-subtle">{q.quarter}</p>
                      <p className="text-heading-lg mt-1 tabular-nums">₹{q.revenueCr.toLocaleString("en-IN")}cr</p>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        Revenue · Net Profit ₹{q.netProfitCr.toLocaleString("en-IN")}cr
                        {q.ebitdaMarginPct > 0 && ` · EBITDA ${q.ebitdaMarginPct.toFixed(1)}%`}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section label="Shareholding">
                <div className="rounded-xl ring-1 ring-hairline overflow-hidden">
                  <div className="grid grid-cols-5 px-5 py-2.5 bg-secondary/50 text-[10px] uppercase tracking-widest text-ink-subtle">
                    <span>Quarter</span>
                    <span className="text-right">Promoter</span>
                    <span className="text-right">FII</span>
                    <span className="text-right">DII</span>
                    <span className="text-right">Public</span>
                  </div>
                  {c.shareholdingTrend.map((row) => (
                    <div key={row.quarter} className="grid grid-cols-5 px-5 py-3 text-sm hairline-t">
                      <span className="text-ink-muted">{row.quarter}</span>
                      <span className="text-right font-mono tabular-nums">{row.promoter.toFixed(1)}%</span>
                      <span className="text-right font-mono tabular-nums">{row.fii.toFixed(1)}%</span>
                      <span className="text-right font-mono tabular-nums">{row.dii.toFixed(1)}%</span>
                      <span className="text-right font-mono tabular-nums">{row.public.toFixed(1)}%</span>
                    </div>
                  ))}
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
                      <span className={"text-sm " + (item.done ? "text-ink" : "text-ink-muted")}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </Section>

            </div>

            <div className="mt-14 flex items-center gap-3">
              <Link to="/ideas" className="px-4 py-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:brightness-110">
                Add to Pipeline
              </Link>
              <Link to="/journal" className="px-4 py-2 rounded-md ring-1 ring-hairline text-sm font-medium hover:bg-secondary">
                Start Thesis
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-10">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-2">{label}</div>
      <div>{children}</div>
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
  return value === null ? "N/A" : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}cr`;
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
  return value === null ? "N/A" : `${(value / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
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
