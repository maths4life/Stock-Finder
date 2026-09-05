import { Check, Loader2, Plus } from "lucide-react";
import { usePipeline } from "@/features/market/hooks/useDiscover";
import { useCreatePipelineItem } from "@/features/pipeline/hooks/usePipelineItems";
import { cn } from "@/shared/utils/utils";

/**
 * "+ Add to Ideas" CTA reused on Discover, Research, and the company
 * research page. Reads the same `usePipeline()` cache the Ideas board
 * itself uses (react-query dedupes the request, so this doesn't add an
 * extra round trip per card) to find out whether the symbol is already
 * in the pipeline, and writes through the real `/pipeline-items` CRUD —
 * no frontend-only state, no way to add the same symbol twice.
 */
export function AddToIdeasButton({
  symbol,
  className,
  size = "sm",
}: {
  symbol: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { data: columns } = usePipeline();
  const createMutation = useCreatePipelineItem();

  const existingStage = columns
    ?.find((col) => col.items.some((item) => item.symbol === symbol))
    ?.stage;

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (existingStage || createMutation.isPending) return;
    createMutation.mutate({ symbol, stage: "Watching" });
  }

  if (existingStage) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium bg-positive-soft text-positive whitespace-nowrap",
          className,
        )}
      >
        <Check className="size-3" />
        In Ideas · {existingStage}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={createMutation.isPending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md ring-1 ring-hairline bg-surface-raised hover:bg-secondary text-ink transition-colors whitespace-nowrap disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1 text-[11px] font-medium" : "px-4 py-2 text-sm font-medium",
        className,
      )}
    >
      {createMutation.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Plus className="size-3" />
      )}
      Add to Ideas
    </button>
  );
}
