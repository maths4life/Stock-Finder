import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, TriangleAlert, Sparkles } from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { Sparkline } from "@/shared/components/common/Sparkline";
import { StatMetric } from "@/shared/components/common/StatMetric";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useCompany, useCompanyAnalysis, useCompanyPrices, useWeeklyMarketIntelligence } from "@/features/company/hooks/useCompanies";
import { fetchCompany, fetchCompanyAnalysis, fetchCompanyPrices, fetchWeeklyMarketIntelligence } from "@/features/company/api/companies";
import { PriceChart } from "@/features/company/components/PriceChart";
import { AIResearchReport } from "@/features/company/components/AIResearchReport";
import { WeeklyMarketIntelligence } from "@/features/company/components/WeeklyMarketIntelligence";
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

    // Module 6 AI Research Report — identical query key/fn as
    // useCompanyAnalysis below, same hydration-safety reasoning.
    await context.queryClient
      .ensureQueryData({
        queryKey: queryKeys.companies.analysis(params.symbol),
        queryFn: () => fetchCompanyAnalysis(params.symbol),
      })
      .catch(() => undefined);

    // Module 7 Weekly Market Intelligence — identical query key/fn as
    // useWeeklyMarketIntelligence below, same hydration-safety reasoning.
    await context.queryClient
      .ensureQueryData({
        queryKey: queryKeys.companies.weeklyMarketIntelligence(params.symbol),
        queryFn: () => fetchWeeklyMarketIntelligence(params.symbol),
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
  const {
    data: analysis,
    isPending: analysisPending,
    isError: analysisError,
    refetch: refetchAnalysis,
  } = useCompanyAnalysis(symbol);
  const {
    data: weeklyIntel,
    isPending: weeklyIntelPending,
    isError: weeklyIntelError,
    refetch: refetchWeeklyIntel,
  } = useWeeklyMarketIntelligence(symbol);

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

              <div className="mt-10 grid grid-cols-2 md:grid-cols-5 gap-y-6 hairline-t hairline-b py-6">
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
              </div>

              <div className="grid grid-cols-3 gap-y-6 py-6 hairline-b">
                <StatMetric label="Overall Score" value={c.overallScore.toFixed(0) + "/100"} tone="positive" size="lg" highlight />
                <StatMetric label="Fundamental Score" value={c.fundamentalScore.toFixed(0) + "/100"} size="lg" />
                <StatMetric label="Technical Score" value={c.technicalScore.toFixed(0) + "/100"} size="lg" />
              </div>

              <div className="grid grid-cols-3 gap-y-6 py-6 hairline-b">
                <StatMetric label="Risk Level" value={c.riskLevel} size="lg" />
                <StatMetric label="Expected Return" value={c.expectedReturnPct.toFixed(1) + "%"} tone="positive" size="lg" />
                <StatMetric label="Investment Horizon" value={`${c.investmentHorizonMonths}mo`} size="lg" />
              </div>

              <div className="mt-8">
                <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} fill width={800} height={80} className="w-full h-20" />
              </div>
            </header>

            {/* Sections */}
            <div className="mt-16 space-y-14">
              <Section label="AI Research">
                {analysisPending && <AIResearchSkeleton />}
                {analysisError && (
                  <ErrorState
                    title="Couldn't load the AI research report"
                    description="The rest of the page loaded fine — just this section failed."
                    onRetry={() => refetchAnalysis()}
                  />
                )}
                {analysis && <AIResearchReport analysis={analysis} />}
              </Section>

              <Section label="Price History">
                <PriceChart data={prices ?? []} range={priceRange} onRangeChange={setPriceRange} isLoading={pricesPending} />
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

              <Section label="Verdict">
                <div className="rounded-xl ring-1 ring-hairline bg-secondary/40 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="size-3.5 text-accent" />
                    <span className="text-[11px] uppercase tracking-widest font-medium text-accent">{c.verdict}</span>
                  </div>
                  <p className="text-heading-lg leading-snug text-ink text-pretty">{c.verdictSummary}</p>
                </div>
              </Section>

              <Section label="Business">
                <p className="text-[15px] leading-relaxed text-ink text-pretty">{c.businessSummary}</p>
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

              <Section label="Why AI Selected">
                <div className="rounded-xl ring-1 ring-hairline bg-secondary/40 p-6 flex items-start gap-3">
                  <Sparkles className="size-4 text-accent mt-0.5 shrink-0" />
                  <p className="text-[15px] leading-relaxed text-ink text-pretty">{c.rationale}</p>
                </div>
              </Section>

              <Section label="Pros">
                <ul className="space-y-3">
                  {c.pros.map((s) => (
                    <li key={s} className="flex items-start gap-3 text-[15px] text-ink">
                      <Check className="size-4 text-positive mt-1 shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section label="Cons">
                <ul className="space-y-3">
                  {c.cons.map((s) => (
                    <li key={s} className="flex items-start gap-3 text-[15px] text-ink">
                      <TriangleAlert className="size-4 text-[oklch(0.6_0.15_60)] mt-1 shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
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

              <Section label="Weekly Market Intelligence">
                {weeklyIntelPending && <AIResearchSkeleton />}
                {weeklyIntelError && (
                  <ErrorState
                    title="Couldn't load weekly market intelligence"
                    description="The rest of the page loaded fine — just this section failed."
                    onRetry={() => refetchWeeklyIntel()}
                  />
                )}
                {weeklyIntel && <WeeklyMarketIntelligence data={weeklyIntel} />}
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

function AIResearchSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid md:grid-cols-2 gap-8">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
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
