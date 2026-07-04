import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Sparkline } from "@/components/Sparkline";
import { listCompanies, type Company, type RiskLevel } from "@/lib/mock-data";
import { useMemo, useState } from "react";
import { Sparkles, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/screener")({
  head: () => ({
    meta: [
      { title: "Screener — Quant Terminal" },
      { name: "description", content: "Filter on fundamentals and technicals. See only what qualifies." },
    ],
  }),
  component: Screener,
});

type FilterState = {
  sector: string;
  minRoe: number;
  minRoce: number;
  minEpsGrowth: number;
  minSalesGrowth: number;
  maxPe: number;
  maxDebtToEquity: number;
  minPromoterHolding: number;
  aboveEma200: boolean;
  aboveEma50: boolean;
  volumeBreakout: boolean;
  riskLevel: RiskLevel | "Any";
  horizon: "Any" | "≤ 6 months" | "6–12 months" | "12+ months";
};

const DEFAULT_FILTERS: FilterState = {
  sector: "All",
  minRoe: 0,
  minRoce: 0,
  minEpsGrowth: 0,
  minSalesGrowth: 0,
  maxPe: 200,
  maxDebtToEquity: 3,
  minPromoterHolding: 0,
  aboveEma200: false,
  aboveEma50: false,
  volumeBreakout: false,
  riskLevel: "Any",
  horizon: "Any",
};

function horizonMatches(months: number, horizon: FilterState["horizon"]) {
  if (horizon === "Any") return true;
  if (horizon === "≤ 6 months") return months <= 6;
  if (horizon === "6–12 months") return months > 6 && months <= 12;
  return months > 12;
}

function matchesFilters(c: Company, f: FilterState) {
  return (
    (f.sector === "All" || c.sector === f.sector) &&
    c.roe >= f.minRoe &&
    c.roce >= f.minRoce &&
    c.epsGrowthPct >= f.minEpsGrowth &&
    c.salesGrowthPct >= f.minSalesGrowth &&
    c.pe <= f.maxPe &&
    c.debtToEquity <= f.maxDebtToEquity &&
    c.promoterHoldingPct >= f.minPromoterHolding &&
    (!f.aboveEma200 || c.aboveEma200) &&
    (!f.aboveEma50 || c.aboveEma50) &&
    (!f.volumeBreakout || c.volumeBreakout) &&
    (f.riskLevel === "Any" || c.riskLevel === f.riskLevel) &&
    horizonMatches(c.investmentHorizonMonths, f.horizon)
  );
}

function whySelected(c: Company): string {
  const reasons: string[] = [];
  if (c.roe >= 20) reasons.push(`ROE of ${c.roe.toFixed(1)}%`);
  if (c.profitGrowthPct >= 20) reasons.push(`profit growth of ${c.profitGrowthPct.toFixed(1)}%`);
  if (c.aboveEma200) reasons.push("trading above its 200-day average");
  if (c.volumeBreakout) reasons.push("breaking out on volume");
  if (reasons.length === 0) return c.rationale;
  return `Qualified on ${reasons.join(", ")}.`;
}

function Screener() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const allCompanies = useMemo(() => listCompanies(), []);
  const sectors = useMemo(() => ["All", ...new Set(allCompanies.map((c) => c.sector))], [allCompanies]);

  const results = useMemo(() => {
    return allCompanies
      .filter((c) => matchesFilters(c, applied))
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 20);
  }, [allCompanies, applied]);

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-6 py-12 pb-32">
        <header className="mb-10 animate-fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-3">
            AI Stock Discovery
          </p>
          <h1 className="font-serif text-5xl md:text-6xl leading-[0.98] text-balance max-w-[24ch]">
            Set your criteria. See only what qualifies.
          </h1>
          <p className="mt-5 text-base text-ink-muted max-w-xl leading-relaxed">
            No lists of hundreds. Twenty highest-conviction names, ranked by a transparent score —
            not a black box.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-10">
          {/* Filter panel */}
          <aside className="col-span-12 lg:col-span-4">
            <div className="rounded-xl ring-1 ring-hairline bg-surface-raised p-6 lg:sticky lg:top-20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-3.5 text-ink-subtle" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                    Filters
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="flex items-center gap-1 text-[11px] text-ink-subtle hover:text-ink transition-colors"
                >
                  <RotateCcw className="size-3" /> Reset
                </button>
              </div>

              <div className="space-y-7">
                {/* Sector */}
                <div>
                  <FieldLabel>Sector</FieldLabel>
                  <Select value={filters.sector} onValueChange={(v) => update("sector", v)}>
                    <SelectTrigger className="w-full mt-2">
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

                <FieldGroup label="Fundamentals">
                  <SliderField label="Minimum ROE" value={filters.minRoe} max={40} unit="%" onChange={(v) => update("minRoe", v)} />
                  <SliderField label="Minimum ROCE" value={filters.minRoce} max={45} unit="%" onChange={(v) => update("minRoce", v)} />
                  <SliderField label="Minimum EPS growth" value={filters.minEpsGrowth} max={60} unit="%" onChange={(v) => update("minEpsGrowth", v)} />
                  <SliderField label="Minimum sales growth" value={filters.minSalesGrowth} max={60} unit="%" onChange={(v) => update("minSalesGrowth", v)} />
                  <SliderField label="Maximum P/E" value={filters.maxPe} max={200} unit="x" onChange={(v) => update("maxPe", v)} />
                  <SliderField label="Maximum Debt/Equity" value={filters.maxDebtToEquity} max={3} step={0.1} unit="x" onChange={(v) => update("maxDebtToEquity", v)} />
                  <SliderField label="Minimum promoter holding" value={filters.minPromoterHolding} max={80} unit="%" onChange={(v) => update("minPromoterHolding", v)} />
                </FieldGroup>

                <FieldGroup label="Technicals">
                  <CheckField label="Above 200-day average" checked={filters.aboveEma200} onChange={(v) => update("aboveEma200", v)} />
                  <CheckField label="Above 50-day average" checked={filters.aboveEma50} onChange={(v) => update("aboveEma50", v)} />
                  <CheckField label="Volume breakout" checked={filters.volumeBreakout} onChange={(v) => update("volumeBreakout", v)} />
                </FieldGroup>

                <FieldGroup label="Investment profile">
                  <div>
                    <FieldLabel>Risk level</FieldLabel>
                    <Select value={filters.riskLevel} onValueChange={(v) => update("riskLevel", v as FilterState["riskLevel"])}>
                      <SelectTrigger className="w-full mt-2">
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
                  <div>
                    <FieldLabel>Investment horizon</FieldLabel>
                    <Select value={filters.horizon} onValueChange={(v) => update("horizon", v as FilterState["horizon"])}>
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Any", "≤ 6 months", "6–12 months", "12+ months"].map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </FieldGroup>
              </div>

              <button
                onClick={() => setApplied(filters)}
                className="mt-8 w-full py-2.5 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:brightness-110 transition-all"
              >
                Find Stocks
              </button>
            </div>
          </aside>

          {/* Results */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-baseline gap-3 mb-6 hairline-b pb-3">
              <span className="font-serif text-3xl">{results.length}</span>
              <span className="text-sm text-ink-muted">
                {results.length === 1 ? "company matches" : "companies match"} — ranked by overall score
              </span>
            </div>

            <div className="space-y-4">
              {results.map((c) => (
                <ResultCard key={c.symbol} company={c} />
              ))}
              {results.length === 0 && (
                <div className="py-16 text-center text-sm text-ink-muted font-serif italic">
                  No matches. Loosen a filter and try again.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ResultCard({ company: c }: { company: Company }) {
  return (
    <Link
      to="/research/$symbol"
      params={{ symbol: c.symbol }}
      className="block p-5 rounded-xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong hover:shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.08)] transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-[15px]">{c.name}</p>
            <VerdictPill verdict={c.verdict} />
          </div>
          <p className="font-mono text-[10px] text-ink-subtle">
            {c.exchange}:{c.symbol} · {c.sector}
          </p>
          <p className="mt-3 text-[13.5px] text-ink-muted leading-relaxed text-pretty flex items-start gap-1.5">
            <Sparkles className="size-3.5 text-accent shrink-0 mt-0.5" />
            <span>{whySelected(c)}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm">₹{c.price.toLocaleString("en-IN")}</div>
          <div className={"text-[11px] font-mono " + (c.changePct >= 0 ? "text-positive" : "text-negative")}>
            {c.changePct >= 0 ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </div>
          <Sparkline data={c.spark} tone={c.changePct >= 0 ? "positive" : "negative"} width={90} height={28} className="mt-2 ml-auto" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-4 hairline-t pt-4">
        <ScoreMetric label="Overall" value={c.overallScore} highlight />
        <ScoreMetric label="Fundamental" value={c.fundamentalScore} />
        <ScoreMetric label="Technical" value={c.technicalScore} />
        <TextMetric label="Risk" value={c.riskLevel} />
        <TextMetric label="Expected Return" value={`${c.expectedReturnPct}%`} />
        <TextMetric label="Horizon" value={`${c.investmentHorizonMonths}mo`} />
      </div>
    </Link>
  );
}

function ScoreMetric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-ink-subtle">{label}</p>
      <p className={"font-serif text-lg mt-0.5 tabular-nums " + (highlight ? "text-accent" : "text-ink")}>
        {value.toFixed(0)}
      </p>
    </div>
  );
}

function TextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-ink-subtle">{label}</p>
      <p className="text-sm mt-0.5 text-ink">{value}</p>
    </div>
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
    <span className={"px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider " + (map[verdict] ?? map["Watch"])}>
      {verdict}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-ink-muted">{children}</p>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hairline-t pt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-subtle mb-4">{label}</p>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function SliderField({
  label,
  value,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-xs text-ink tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <Slider value={[value]} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}
