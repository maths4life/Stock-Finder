import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Sparkline } from "@/components/Sparkline";
import { getCompany } from "@/lib/mock-data";
import { ArrowLeft, Check, TriangleAlert, Sparkles } from "lucide-react";

export const Route = createFileRoute("/research/$symbol")({
  loader: ({ params }) => {
    const company = getCompany(params.symbol);
    if (!company) throw notFound();
    return { company };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.company.name} — Research | Quant Terminal` },
          { name: "description", content: loaderData.company.rationale },
        ]
      : [{ title: "Company not found" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: () => (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="font-serif text-4xl">Company not in library</h1>
        <p className="mt-2 text-ink-muted">Try searching with ⌘K.</p>
      </div>
    </AppShell>
  ),
  component: ResearchDetail,
});

function ResearchDetail() {
  const { company: c } = Route.useLoaderData();
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-10 pb-32">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-ink-subtle hover:text-ink transition-colors mb-10">
          <ArrowLeft className="size-3" /> Back to Discover
        </Link>

        {/* Hero */}
        <header className="animate-fade-up">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">{c.exchange}:{c.symbol}</span>
            <span className="text-ink-subtle">·</span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">{c.sector}</span>
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-[0.98] text-balance">{c.name}</h1>
          <p className="mt-5 font-serif italic text-xl text-ink-muted leading-snug max-w-[52ch] text-pretty">
            {c.rationale}
          </p>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-5 gap-y-6 hairline-t hairline-b py-6">
            <Metric label="Price" value={`₹${c.price.toLocaleString("en-IN")}`} sub={`${c.changePct >= 0 ? "+" : ""}${c.changePct.toFixed(2)}%`} tone={c.changePct >= 0 ? "positive" : "negative"} />
            <Metric label="Market Cap" value={c.marketCap} />
            <Metric label="P/E" value={c.pe.toFixed(1) + "x"} />
            <Metric label="RoE" value={c.roe.toFixed(1) + "%"} tone="positive" />
            <Metric label="Div Yield" value={c.divYield.toFixed(2) + "%"} />
          </div>

          <div className="grid grid-cols-3 gap-y-6 py-6 hairline-b">
            <Metric label="Overall Score" value={c.overallScore.toFixed(0) + "/100"} tone="positive" />
            <Metric label="Fundamental Score" value={c.fundamentalScore.toFixed(0) + "/100"} />
            <Metric label="Technical Score" value={c.technicalScore.toFixed(0) + "/100"} />
          </div>

          <div className="mt-8">
            <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} fill width={800} height={80} className="w-full h-20" />
          </div>
        </header>

        {/* Sections */}
        <div className="mt-16 space-y-14">
          <Section label="Verdict">
            <div className="rounded-xl ring-1 ring-hairline bg-secondary/40 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-3.5 text-accent" />
                <span className="text-[11px] uppercase tracking-widest font-medium text-accent">{c.verdict}</span>
              </div>
              <p className="font-serif text-2xl leading-snug text-ink text-pretty">
                A durable business at a fair price, moving into a favourable operating window.
                Best held for 3–4 quarters through the next earnings cycle.
              </p>
            </div>
          </Section>

          <Section label="Business">
            <p className="font-serif text-lg leading-relaxed text-ink text-pretty">
              {c.name} operates across {c.sector.toLowerCase()}, with a market position built on scale, distribution
              and disciplined capital allocation. Recent commentary suggests operating leverage is accelerating
              as raw material costs normalise and volume growth compounds.
            </p>
          </Section>

          <Section label="Quarterly Financials">
            <div className="grid grid-cols-3 gap-6 hairline-t pt-6">
              {c.quarterlyFinancials.map((q) => (
                <div key={q.quarter}>
                  <p className="text-[11px] uppercase tracking-widest text-ink-subtle">{q.quarter}</p>
                  <p className="font-serif text-2xl mt-1">₹{q.revenueCr.toLocaleString("en-IN")}cr</p>
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
              {[
                ["OCF > Net Income (3-yr avg)", true],
                ["Promoter pledge < 5%", true],
                ["Debt-to-Equity < 0.5x", false],
                ["Sector tailwind acknowledged in commentary", true],
                ["Reasonable valuation vs 5-yr median", false],
              ].map(([label, done]) => (
                <div key={label as string} className="flex items-center gap-4 px-5 py-3.5">
                  <div className={"size-4 rounded-full grid place-items-center " + (done ? "bg-positive text-white" : "ring-1 ring-hairline-strong")}>
                    {done ? <Check className="size-2.5" strokeWidth={3} /> : null}
                  </div>
                  <span className={"text-sm " + (done ? "text-ink" : "text-ink-muted")}>{label as string}</span>
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
      </div>
    </AppShell>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">{label}</p>
      <p className="font-serif text-2xl mt-1 leading-none tabular-nums">{value}</p>
      {sub && (
        <p className={"text-[11px] font-mono mt-1 " + (tone === "positive" ? "text-positive" : "text-negative")}>{sub}</p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[140px_1fr] gap-10">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-2">{label}</div>
      <div>{children}</div>
    </section>
  );
}
