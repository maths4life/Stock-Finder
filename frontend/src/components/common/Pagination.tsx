import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/** Drop-in pagination for any list backed by a `Paginated<T>` response shape. */
export function Pagination({ page, totalPages, total, pageSize, onPageChange, className }: Props) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className={"flex items-center justify-between gap-4 " + (className ?? "")}>
      <p className="text-xs text-ink-subtle">
        Showing <span className="text-ink font-medium">{start}–{end}</span> of{" "}
        <span className="text-ink font-medium">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="size-8 grid place-items-center rounded-md ring-1 ring-hairline text-ink-muted hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs text-ink-muted px-2 tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="size-8 grid place-items-center rounded-md ring-1 ring-hairline text-ink-muted hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
