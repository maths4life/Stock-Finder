import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { useCompanySearch } from "@/features/company/hooks/useCompanies";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const navigate = useNavigate();
  const { data: results = [], isFetching } = useCompanySearch(debouncedQ);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/20 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-surface-raised rounded-xl ring-1 ring-hairline-strong shadow-popover overflow-hidden animate-fade-up"
      >
        <div className="flex items-center gap-3 px-4 py-3 hairline-b">
          <Search className="size-4 text-ink-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a company, thesis, screen…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-subtle"
          />
          {isFetching ? (
            <Loader2 className="size-3.5 text-ink-subtle animate-spin" />
          ) : (
            <kbd className="text-[10px] font-mono text-ink-subtle bg-secondary px-1.5 py-0.5 rounded">ESC</kbd>
          )}
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {q.trim().length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">Start typing to search companies</div>
          )}
          {q.trim().length > 0 && results.length === 0 && !isFetching && (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">No matches</div>
          )}
          {results.map((c) => (
            <button
              key={c.symbol}
              onClick={() => {
                setOpen(false);
                navigate({ to: "/research/$symbol", params: { symbol: c.symbol } });
              }}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/60 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs w-20 shrink-0 text-ink">{c.symbol}</span>
                <span className="text-sm text-ink-muted truncate">{c.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-ink-subtle">{c.sector}</span>
                <ArrowRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 hairline-t flex items-center justify-between text-[10px] text-ink-subtle">
          <span>Navigate ↑↓</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
