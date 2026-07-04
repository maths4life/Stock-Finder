import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { listCompanies } from "@/lib/mock-data";
import { Sparkline } from "@/components/Sparkline";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research — Quant Terminal" },
      { name: "description", content: "Deep, calm research briefings on Indian companies." },
    ],
  }),
  component: ResearchLayout,
});

function ResearchLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/research") return <ResearchIndex />;
  return <Outlet />;
}

function ResearchIndex() {
  const companies = listCompanies();
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-32">
        <header className="mb-12 animate-fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-3">Research library</p>
          <h1 className="font-serif text-5xl leading-none text-balance max-w-[24ch]">
            Every company, understood in a minute.
          </h1>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {companies.map((c) => (
            <Link
              key={c.symbol}
              to="/research/$symbol"
              params={{ symbol: c.symbol }}
              className="group grid grid-cols-[1fr_auto] gap-6 py-5 hairline-b hover:bg-secondary/40 -mx-3 px-3 rounded-md transition-colors"
            >
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-2xl text-ink group-hover:text-accent transition-colors">{c.name}</span>
                  <span className="font-mono text-[11px] text-ink-subtle">{c.symbol}</span>
                </div>
                <p className="text-sm text-ink-muted mt-1 line-clamp-2 leading-snug">{c.rationale}</p>
                <p className="text-[11px] text-ink-subtle mt-2 uppercase tracking-widest">{c.sector}</p>
              </div>
              <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} width={80} height={40} />
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
