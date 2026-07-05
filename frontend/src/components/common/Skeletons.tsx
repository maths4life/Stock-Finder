import { Skeleton } from "@/components/ui/skeleton";

/** Matches the footprint of CompanyCard, so lists don't jump when data resolves. */
export function CompanyCardSkeleton() {
  return (
    <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface-raised">
      <div className="flex justify-between items-start mb-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-4/5 mb-4" />
      <div className="flex items-end justify-between">
        <Skeleton className="h-9 w-32" />
        <div className="space-y-1.5 text-right">
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
      </div>
    </div>
  );
}

/** Matches the footprint of a screener/research row. */
export function CompanyRowSkeleton() {
  return (
    <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface-raised">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3/4 mt-2" />
        </div>
        <div className="space-y-1.5 text-right shrink-0">
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-4 hairline-t pt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompanyCardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <CompanyCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CompanyRowListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CompanyRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function TextLineSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={"space-y-4 " + (className ?? "")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex justify-between items-baseline py-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
