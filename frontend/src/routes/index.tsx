import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Sparkline } from "@/components/Sparkline";
import { companies, discoverGroups, marketContext, pipeline, getCompany, sectorPulse } from "@/lib/mock-data";
import { ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Morning Intelligence — Quant Terminal" },
      {
        name: "description",
        content: "Today's most researchable Indian companies, grouped by why they matter.",
      },
      { property: "og:title", content: "Morning Intelligence — Quant Terminal" },
      {
        property: "og:description",
        content: "A calm briefing on the Indian companies worth your attention today.",
      },
    ],
  }),
  component: Discover,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatToday() {
  const d = new Date();
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function Discover() {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-32">
        {/* Header */}
        <header className="mb-14 animate-fade-up">
          <p className="text-sm font-medium text-accent mb-2 tracking-wide">{formatToday()}</p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[0.98] text-balance max-w-[22ch]">
            Which companies deserve your attention today?
          </h1>
          <p className="mt-5 text-base text-ink-muted max-w-xl leading-relaxed">
            Eight companies surfaced across four narratives. Take twenty minutes.
            Add one to your pipeline, or move on.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-x-12 gap-y-16">
          {/* Feed */}
          <div className="col-span-12 lg:col-span-8 space-y-16">
            {discoverGroups.map((group, gi) => (
              <section key={group.id} className="animate-fade-up" style={{ animationDelay: `${gi * 60}ms` }}>
                <div className="flex items-end justify-between hairline-b pb-3 mb-6">
                  <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                      {group.label}
                    </h2>
                    <p className="mt-1.5 text-sm text-ink-muted font-serif italic">{group.tagline}</p>
                  </div>
                  <span className="text-[11px] font-mono text-ink-subtle">{group.symbols.length} names</span>
                </div>

                {group.id === "technicals" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {group.symbols.map((sym) => {
                      const c = getCompany(sym)!;
                      return (
                        <Link
                          key={sym}
                          to="/research/$symbol"
                          params={{ symbol: sym }}
                          className="group p-5 rounded-lg ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.08)] transition-all"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-semibold text-base">{c.symbol}</p>
                              <p className="text-xs text-ink-subtle">{c.exchange} · {c.sector}</p>
                            </div>
                            <VerdictPill verdict={c.verdict} />
                          </div>
                          <p className="text-sm text-ink-muted leading-relaxed text-pretty mb-4">
                            {c.rationale}
                          </p>
                          <div className="flex items-end justify-between">
                            <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} fill width={140} height={36} />
                            <div className="text-right">
                              <div className="font-mono text-sm">₹{c.price.toLocaleString("en-IN")}</div>
                              <div className={"text-[11px] font-mono " + (c.changePct >= 0 ? "text-positive" : "text-negative")}>
                                {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    {group.symbols.map((sym) => {
                      const c = getCompany(sym)!;
                      return (
                        <Link
                          key={sym}
                          to="/research/$symbol"
                          params={{ symbol: sym }}
                          className="group grid grid-cols-12 gap-6 py-5 hairline-b last:border-b-0 hover:bg-secondary/40 transition-colors -mx-3 px-3 rounded-md"
                        >
                          <div className="col-span-3">
                            <p className="font-semibold text-[15px] text-ink">{c.name}</p>
                            <p className="font-mono text-[11px] text-ink-subtle mt-0.5">{c.exchange}:{c.symbol}</p>
                          </div>
                          <div className="col-span-6">
                            <p className="text-[13.5px] leading-relaxed text-ink-muted text-pretty">
                              {c.rationale}
                            </p>
                          </div>
                          <div className="col-span-3 flex flex-col items-end justify-between">
                            <div className="flex items-center gap-1.5">
                              {c.changePct >= 0 ? (
                                <TrendingUp className="size-3 text-positive" />
                              ) : (
                                <TrendingDown className="size-3 text-negative" />
                              )}
                              <span className={"text-sm font-medium " + (c.changePct >= 0 ? "text-positive" : "text-negative")}>
                                {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
                              </span>
                            </div>
                            <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} width={90} height={24} />
                            <p className="text-[11px] text-ink-subtle italic font-serif">{c.marketCap}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Sidebar */}
          <aside className="col-span-12 lg:col-span-4 space-y-8">
            <div className="p-6 rounded-xl ring-1 ring-hairline bg-secondary/40 border-t-2 border-accent animate-fade-up">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                  Active Pipeline
                </h3>
                <Link to="/ideas" className="text-[11px] text-accent hover:underline underline-offset-2">
                  Full board
                </Link>
              </div>
              <div className="space-y-5">
                {pipeline.flatMap((stage) =>
                  stage.items.map((item) => {
                    const c = companies[item.symbol];
                    if (!c) return null;
                    const barColor =
                      stage.color === "positive"
                        ? "bg-positive"
                        : stage.color === "amber"
                        ? "bg-[oklch(0.65_0.14_75)]"
                        : "bg-hairline-strong";
                    return (
                      <Link
                        key={item.symbol + stage.stage}
                        to="/research/$symbol"
                        params={{ symbol: item.symbol }}
                        className="flex gap-4 group"
                      >
                        <div className={"w-1 rounded-full shrink-0 " + barColor} />
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-widest text-ink-subtle font-medium">{stage.stage}</p>
                          <p className="text-sm font-medium mt-0.5 group-hover:text-accent transition-colors">{c.name}</p>
                          <p className="text-[11px] text-ink-subtle mt-1">{item.note} · {item.ago}</p>
                        </div>
                      </Link>
                    );
                  }),
                )}
              </div>
              <Link
                to="/ideas"
                className="mt-6 w-full py-2 px-3 flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:brightness-110 transition-all"
              >
                Open Pipeline
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-3">
                Top Sectors
              </h3>
              <div className="space-y-4">
                {sectorPulse.map((s) => (
                  <div key={s.sector}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{s.sector}</span>
                      <SentimentPill sentiment={s.sentiment} />
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted leading-snug text-pretty">{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-3">
                Market Context
              </h3>
              <div className="divide-y divide-hairline">
                {marketContext.map((m) => (
                  <div key={m.label} className="flex justify-between items-baseline py-2.5">
                    <span className="text-sm text-ink-muted">{m.label}</span>
                    <div className="text-right">
                      <span className="font-mono text-sm text-ink tabular-nums">{m.value}</span>
                      <span
                        className={
                          "ml-2 text-[11px] font-mono " +
                          (m.tone === "positive" ? "text-positive" : "text-ink-subtle")
                        }
                      >
                        {m.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-xl ring-1 ring-hairline">
              <p className="font-serif italic text-lg leading-snug text-ink">
                "The stock market is a device for transferring money from the impatient to the patient."
              </p>
              <p className="mt-3 text-[11px] uppercase tracking-widest text-ink-subtle">— Warren Buffett</p>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SentimentPill({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    Bullish: "bg-positive-soft text-positive",
    Positive: "bg-positive-soft text-positive",
    Neutral: "bg-neutral-soft text-neutral",
    Bearish: "bg-negative-soft text-negative",
  };
  return (
    <span className={"px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider " + (map[sentiment] ?? map["Neutral"])}>
      {sentiment}
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    "Strong Conviction": "bg-positive-soft text-positive",
    Watch: "bg-neutral-soft text-neutral",
    "Under Review": "bg-[oklch(0.96_0.03_75)] text-[oklch(0.45_0.11_65)]",
    Pass: "bg-secondary text-ink-subtle",
  };
  return (
    <span className={"px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider " + (map[verdict] ?? map["Watch"])}>
      {verdict}
    </span>
  );
}
