import { useDataFreshness } from "@/features/market/hooks/useDiscover";
import { cn } from "@/shared/utils/utils";

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return `${datePart} · ${timePart} IST`;
}

/**
 * Reusable "Updated ... · Fresh/Stale" indicator, backed by the real
 * `GET /meta/freshness` timestamp (newest row across `scores` /
 * `technical_snapshot`) — never a hardcoded date. Renders nothing while
 * loading or on error rather than a layout-shifting skeleton, since this
 * is a small supporting element, not primary content.
 */
export function DataFreshness({ className }: { className?: string }) {
  const { data, isPending, isError } = useDataFreshness();

  if (isPending || isError || !data) return null;

  return (
    <div className={cn("flex items-center gap-2 text-[11px] font-mono text-ink-subtle", className)}>
      {data.updatedAt ? (
        <span>Updated {formatUpdatedAt(data.updatedAt)}</span>
      ) : (
        <span>No data ingested yet</span>
      )}
      {data.status !== "unknown" && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 uppercase tracking-wider",
            data.status === "fresh" ? "text-positive" : "text-negative",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              data.status === "fresh" ? "bg-positive" : "bg-negative",
            )}
          />
          {data.status === "fresh" ? "Fresh" : "Stale"}
        </span>
      )}
    </div>
  );
}
