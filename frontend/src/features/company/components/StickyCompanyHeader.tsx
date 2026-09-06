import { useEffect, useRef, useState } from "react";
import type { Company } from "@/shared/api/types";
import { AddToIdeasButton } from "@/shared/components/common/AddToIdeasButton";
import { cn } from "@/shared/utils/utils";

/**
 * Compact identity bar that appears once the full hero has scrolled past —
 * Section 14. `sentinelRef` should be attached to an element near the
 * bottom of the hero; an IntersectionObserver flips this bar on/off, no
 * scroll-position math or extra scroll listeners.
 */
export function useStickySentinel() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, stuck };
}

export function StickyCompanyHeader({
  company: c,
  visible,
}: {
  company: Company;
  visible: boolean;
}) {
  const positive = c.changePct >= 0;
  return (
    <div
      className={cn(
        "sticky top-14 z-30 py-2.5 bg-paper/95 backdrop-blur-md hairline-b transition-all duration-150",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <p className="font-semibold text-sm text-ink truncate">{c.name}</p>
          <span className="font-mono text-[11px] text-ink-subtle shrink-0">{c.symbol}</span>
          <span className="font-mono text-sm tabular-nums shrink-0">
            ₹{c.price.toLocaleString("en-IN")}
          </span>
          <span
            className={cn(
              "text-[11px] font-mono tabular-nums shrink-0",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {positive ? "+" : ""}
            {c.changePct.toFixed(2)}%
          </span>
          <span className="hidden sm:flex items-center gap-1 shrink-0">
            <span className="font-mono text-sm font-semibold text-ink">
              {c.overallScore.toFixed(0)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-ink-subtle">score</span>
          </span>
        </div>
        <AddToIdeasButton symbol={c.symbol} className="shrink-0" />
      </div>
    </div>
  );
}
