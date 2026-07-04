import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { getCompany, pipeline } from "@/lib/mock-data";
import { Sparkline } from "@/components/Sparkline";

export const Route = createFileRoute("/ideas")({
  head: () => ({
    meta: [
      { title: "Ideas Pipeline — Quant Terminal" },
      { name: "description", content: "Watching, researching, conviction. Every idea in one board." },
    ],
  }),
  component: Ideas,
});

const stageMeta = {
  Watching: { hint: "Something caught your attention", color: "bg-hairline-strong" },
  Researching: { hint: "Building the thesis", color: "bg-[oklch(0.65_0.14_75)]" },
  Conviction: { hint: "Ready to hold for 6–12 months", color: "bg-positive" },
} as const;

function Ideas() {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-32">
        <header className="mb-12 animate-fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-3">Ideas board</p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[0.98] text-balance max-w-[22ch]">
            Every idea in one place, moving forward.
          </h1>
          <p className="mt-4 text-sm text-ink-muted max-w-lg">
            Watchlist and journal, merged. Track meaningful change, not price ticks.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {pipeline.map((col) => {
            const meta = stageMeta[col.stage as keyof typeof stageMeta];
            return (
              <div key={col.stage} className="animate-fade-up">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={"size-1.5 rounded-full " + meta.color} />
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">{col.stage}</h2>
                    <span className="text-[11px] font-mono text-ink-subtle">{col.items.length}</span>
                  </div>
                </div>
                <p className="text-xs font-serif italic text-ink-subtle mb-4">{meta.hint}</p>

                <div className="space-y-3">
                  {col.items.map((item) => {
                    const c = getCompany(item.symbol);
                    if (!c) return null;
                    return (
                      <Link
                        key={item.symbol}
                        to="/research/$symbol"
                        params={{ symbol: item.symbol }}
                        className="block p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-serif text-xl leading-tight group-hover:text-accent transition-colors">{c.name}</p>
                            <p className="font-mono text-[10px] text-ink-subtle mt-1">{c.exchange}:{c.symbol}</p>
                          </div>
                          <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} width={60} height={24} />
                        </div>
                        <p className="text-xs text-ink-muted leading-snug italic font-serif mb-3">"{item.note}"</p>
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-ink-subtle">
                          <span>{item.ago}</span>
                          <span className={c.changePct >= 0 ? "text-positive" : "text-negative"}>
                            {c.changePct >= 0 ? "▲" : "▼"} {Math.abs(c.changePct).toFixed(2)}%
                          </span>
                        </div>
                      </Link>
                    );
                  })}

                  <button className="w-full py-3 rounded-xl border border-dashed border-hairline-strong text-xs text-ink-subtle hover:text-ink hover:border-accent transition-colors">
                    + Add company
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
