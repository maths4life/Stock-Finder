/**
 * A tiny stand-in for a real HTTP client (e.g. a Supabase client or fetch
 * wrapper). Every function in `lib/api/*` funnels through `resolveMock` so
 * that:
 *
 *   1. Every "endpoint" is async, matching what a real network call looks
 *      like — components and hooks never assume synchronous data.
 *   2. Loading and error states can be exercised and designed for today,
 *      before a backend exists.
 *   3. Swapping the implementation later is a one-line change per function:
 *      replace `resolveMock(() => ...)` with `await supabase.from(...)`.
 *
 * None of this should leak into components — they only ever see
 * `Promise<T>` via the hooks in `src/hooks`.
 */

const SIMULATED_LATENCY_MS = 380;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Wraps a synchronous mock computation in an async, network-shaped call.
 * Set `NEXT_PUBLIC_MOCK_FAILURE_RATE`-style behaviour via `failureRate` when
 * a screen needs to be tested against error states.
 */
export function resolveMock<T>(compute: () => T, opts?: { latencyMs?: number; failureRate?: number }): Promise<T> {
  const latency = opts?.latencyMs ?? SIMULATED_LATENCY_MS;
  const failureRate = opts?.failureRate ?? 0;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (failureRate > 0 && Math.random() < failureRate) {
        reject(new ApiError("The request could not be completed. Please try again."));
        return;
      }
      try {
        resolve(compute());
      } catch (err) {
        reject(err instanceof Error ? err : new ApiError("Unknown error"));
      }
    }, latency);
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}
