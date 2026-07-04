import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { getCompany } from "@/lib/mock-data";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Journal — Quant Terminal" },
      { name: "description", content: "Record every thesis. Review, learn, compound." },
    ],
  }),
  component: Journal,
});

const entries = [
  {
    symbol: "TRENT",
    title: "Westside is the real business, Zudio is the option value",
    date: "12 Oct",
    thesis:
      "SSSG has stayed above 20% for three quarters. Zudio economics look genuinely different from Reliance Retail. Willing to hold through one bad quarter.",
    catalysts: ["Q3 SSSG print", "Zudio store adds > 200", "Inventory turns holding"],
    risks: ["Valuation leaves no room for a miss", "Cotton price shock"],
    conviction: 4,
    targetPrice: 5200,
    expectedReturnPct: 30,
    horizonMonths: 12,
    sellTrigger: "SSSG drops below 10% for two consecutive quarters, or Zudio store adds stall.",
    reviewDue: "12 Oct next year",
  },
  {
    symbol: "HAL",
    title: "Defence CAPEX cycle is early, not late",
    date: "28 Sep",
    thesis:
      "Order backlog visibility to FY30. The multiple looks expensive, but consensus is still under-estimating execution rate on Tejas and LCH.",
    catalysts: ["Tejas Mk1A delivery ramp", "Multi-role helicopter order"],
    risks: ["Execution slippage", "Export orders slower than expected"],
    conviction: 5,
    targetPrice: 6000,
    expectedReturnPct: 28,
    horizonMonths: 12,
    sellTrigger: "Order backlog growth stalls, or a major delivery is delayed beyond two quarters.",
    reviewDue: "28 Sep next year",
  },
];

function JournalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-ink-subtle">{label}</p>
      <p className="font-serif text-xl mt-0.5 text-ink tabular-nums">{value}</p>
    </div>
  );
}

function Journal() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-12 pb-32">
        <header className="mb-14 animate-fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-3">Research journal</p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[0.98] text-balance max-w-[22ch]">
            Write down what you believe, and why.
          </h1>
          <p className="mt-5 text-base text-ink-muted max-w-xl leading-relaxed">
            The most under-rated tool in investing. Six months from now, you'll be glad you did.
          </p>
        </header>

        <div className="space-y-14">
          {entries.map((e) => {
            const c = getCompany(e.symbol)!;
            return (
              <article key={e.symbol} className="hairline-b pb-14 last:border-b-0 animate-fade-up">
                <div className="flex items-baseline justify-between mb-3">
                  <Link
                    to="/research/$symbol"
                    params={{ symbol: e.symbol }}
                    className="text-[11px] uppercase tracking-widest text-accent hover:underline underline-offset-2"
                  >
                    {c.name} · {c.exchange}:{c.symbol}
                  </Link>
                  <span className="text-[11px] font-mono text-ink-subtle">{e.date}</span>
                </div>
                <h2 className="font-serif text-3xl leading-tight text-balance">{e.title}</h2>

                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6 hairline-b pb-6">
                  <JournalMetric label="Conviction" value={`${e.conviction}/5`} />
                  <JournalMetric label="Target Price" value={`₹${e.targetPrice.toLocaleString("en-IN")}`} />
                  <JournalMetric label="Expected Return" value={`${e.expectedReturnPct}%`} />
                  <JournalMetric label="Horizon" value={`${e.horizonMonths} months`} />
                </div>

                <div className="mt-8 grid grid-cols-[120px_1fr] gap-8">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Thesis</p>
                  <p className="font-serif text-lg leading-relaxed text-ink text-pretty">{e.thesis}</p>
                </div>

                <div className="mt-6 grid grid-cols-[120px_1fr] gap-8">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Catalysts</p>
                  <ul className="space-y-1.5">
                    {e.catalysts.map((c) => (
                      <li key={c} className="text-[15px] text-ink flex gap-3">
                        <span className="text-accent">→</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 grid grid-cols-[120px_1fr] gap-8">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">Risks</p>
                  <ul className="space-y-1.5">
                    {e.risks.map((r) => (
                      <li key={r} className="text-[15px] text-ink-muted flex gap-3">
                        <span className="text-negative">×</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 grid grid-cols-[120px_1fr] gap-8">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-ink-subtle pt-1">What would make you sell</p>
                  <p className="text-[15px] text-ink-muted leading-relaxed text-pretty">{e.sellTrigger}</p>
                </div>

                <div className="mt-6 flex items-center gap-2 text-[11px] text-ink-subtle">
                  <span className="size-1.5 rounded-full bg-accent" />
                  Review reopens {e.reviewDue}
                </div>
              </article>
            );
          })}

          <button className="w-full py-6 rounded-xl border border-dashed border-hairline-strong text-sm text-ink-subtle hover:text-ink hover:border-accent transition-colors font-serif italic">
            + Start a new thesis
          </button>
        </div>
      </div>
    </AppShell>
  );
}
