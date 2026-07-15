import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
};

/** Consistent error state for any failed query. Every data-driven view should render this on `isError`. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this data. Please try again.",
  onRetry,
  className,
}: Props) {
  return (
    <div className={"flex flex-col items-center justify-center text-center py-16 px-6 " + (className ?? "")}>
      <div className="size-10 rounded-full bg-negative-soft grid place-items-center mb-4">
        <AlertTriangle className="size-4.5 text-negative" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1.5 text-sm text-ink-muted max-w-sm">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md ring-1 ring-hairline text-sm font-medium text-ink hover:bg-secondary transition-colors"
        >
          <RotateCcw className="size-3.5" /> Try again
        </button>
      )}
    </div>
  );
}
