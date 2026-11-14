import { Link } from "@tanstack/react-router";
import type { PeerComparisonItem } from "@/shared/api/types";
import { cn } from "@/shared/utils/utils";
import { ArrowUpRight, TrendingUp, TrendingDown, Award } from "lucide-react";

interface PeerComparisonTableProps {
  peers: PeerComparisonItem[];
  sector?: string;
  currentSymbol?: string;
}

export function PeerComparisonTable({
  peers,
  sector,
  currentSymbol,
}: PeerComparisonTableProps) {
  if (!peers || peers.length === 0) {
    return (
      <div className="p-8 rounded-xl ring-1 ring-hairline bg-surface/30 text-center text-sm text-ink-muted">
        No sector peer data available for this company.
      </div>
    );
  }

  // Calculate sector medians for instant benchmarking
  const validPes = peers.map((p) => p.pe).filter((v) => v > 0);
  const medianPe =
    validPes.length > 0
      ? validPes.sort((a, b) => a - b)[Math.floor(validPes.length / 2)]
      : null;

  const validRoes = peers.map((p) => p.roe).filter((v) => v != null);
  const avgRoe =
    validRoes.length > 0
      ? validRoes.reduce((acc, v) => acc + v, 0) / validRoes.length
      : null;

  return (
    <div className="space-y-4">
      {/* Sector Benchmark Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl ring-1 ring-hairline bg-surface/40">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-ink-subtle">
            Industry Benchmark
          </span>
          <h3 className="text-sm font-semibold text-ink">
            {sector || "Sector"} Peers Comparison
          </h3>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          {medianPe != null && (
            <div className="flex items-center gap-1.5 text-ink-muted">
              <span>Peer Median P/E:</span>
              <span className="font-semibold text-ink">{medianPe.toFixed(1)}x</span>
            </div>
          )}
          {avgRoe != null && (
            <div className="flex items-center gap-1.5 text-ink-muted">
              <span>Peer Avg ROE:</span>
              <span className="font-semibold text-positive">{avgRoe.toFixed(1)}%</span>
            </div>
          )}
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-secondary text-ink-subtle ring-1 ring-hairline">
            {peers.length} Leaders
          </span>
        </div>
      </div>

      {/* Main Peer Table */}
      <div className="w-full rounded-xl ring-1 ring-hairline overflow-x-auto bg-card">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-secondary/40 border-b border-hairline text-metric-label">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-3 py-3 font-medium text-right">Price</th>
              <th className="px-3 py-3 font-medium text-right">Change</th>
              <th className="px-3 py-3 font-medium text-right">P/E</th>
              <th className="px-3 py-3 font-medium text-right">P/B</th>
              <th className="px-3 py-3 font-medium text-right">ROE</th>
              <th className="px-3 py-3 font-medium text-right">ROCE</th>
              <th className="px-3 py-3 font-medium text-right">D/E</th>
              <th className="px-4 py-3 font-medium text-right">Market Cap</th>
              <th className="px-4 py-3 font-medium text-center">Score</th>
              <th className="px-4 py-3 font-medium text-center">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {peers.map((peer, idx) => {
              const isCurrent =
                peer.isCurrent ||
                (currentSymbol && peer.symbol.toUpperCase() === currentSymbol.toUpperCase());

              return (
                <tr
                  key={peer.symbol}
                  className={cn(
                    "transition-colors hover:bg-secondary/30 group",
                    isCurrent && "bg-accent/10 font-medium ring-1 ring-inset ring-accent/30"
                  )}
                >
                  {/* Company Name & Symbol */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link
                      to="/research/$symbol"
                      params={{ symbol: peer.symbol }}
                      className="flex items-center gap-2 group-hover:text-accent transition-colors"
                    >
                      <span className="text-[11px] font-mono text-ink-subtle w-4">
                        {idx + 1}.
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold text-ink">
                          <span>{peer.symbol}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 text-[9px] font-mono uppercase rounded bg-accent/20 text-accent ring-1 ring-accent/40">
                              Active
                            </span>
                          )}
                          <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity text-accent" />
                        </div>
                        <div className="text-[11px] text-ink-muted truncate max-w-[150px] sm:max-w-[200px]">
                          {peer.name}
                        </div>
                      </div>
                    </Link>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-3.5 text-right font-mono text-ink whitespace-nowrap">
                    ₹{peer.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>

                  {/* Change % */}
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5",
                        peer.changePct >= 0 ? "text-positive" : "text-negative"
                      )}
                    >
                      {peer.changePct >= 0 ? (
                        <TrendingUp className="size-3" />
                      ) : (
                        <TrendingDown className="size-3" />
                      )}
                      {peer.changePct >= 0 ? "+" : ""}
                      {peer.changePct.toFixed(2)}%
                    </span>
                  </td>

                  {/* P/E */}
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                    <span
                      className={cn(
                        peer.pe > 0 && medianPe && peer.pe < medianPe
                          ? "text-positive font-semibold"
                          : "text-ink"
                      )}
                    >
                      {peer.pe > 0 ? `${peer.pe.toFixed(1)}x` : "—"}
                    </span>
                  </td>

                  {/* P/B */}
                  <td className="px-3 py-3.5 text-right font-mono text-ink whitespace-nowrap">
                    {peer.pb > 0 ? `${peer.pb.toFixed(1)}x` : "—"}
                  </td>

                  {/* ROE */}
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                    <span
                      className={cn(
                        peer.roe >= 15 ? "text-positive font-semibold" : "text-ink"
                      )}
                    >
                      {peer.roe != null && peer.roe !== 0 ? `${peer.roe.toFixed(1)}%` : "—"}
                    </span>
                  </td>

                  {/* ROCE */}
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                    <span
                      className={cn(
                        peer.roce >= 18 ? "text-positive font-semibold" : "text-ink"
                      )}
                    >
                      {peer.roce != null && peer.roce !== 0 ? `${peer.roce.toFixed(1)}%` : "—"}
                    </span>
                  </td>

                  {/* D/E */}
                  <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                    <span
                      className={cn(
                        peer.debtToEquity <= 0.3
                          ? "text-positive font-medium"
                          : peer.debtToEquity > 1.0
                          ? "text-negative font-medium"
                          : "text-ink"
                      )}
                    >
                      {peer.debtToEquity != null ? peer.debtToEquity.toFixed(2) : "—"}
                    </span>
                  </td>

                  {/* Market Cap */}
                  <td className="px-4 py-3.5 text-right font-mono text-ink whitespace-nowrap">
                    {peer.marketCap}
                  </td>

                  {/* Overall Score */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold",
                        peer.overallScore >= 75
                          ? "bg-positive/15 text-positive ring-1 ring-positive/30"
                          : peer.overallScore >= 60
                          ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                          : "bg-secondary text-ink-muted ring-1 ring-hairline"
                      )}
                    >
                      {peer.overallScore >= 75 && <Award className="size-3" />}
                      {peer.overallScore.toFixed(0)}/100
                    </span>
                  </td>

                  {/* Verdict */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-[11px] px-2 py-0.5 rounded text-ink-subtle bg-secondary/80 ring-1 ring-hairline">
                      {peer.verdict}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
