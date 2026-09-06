import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Loader2,
  Search,
  Compass,
  LineChart,
  SlidersHorizontal,
  Layers,
  NotebookPen,
} from "lucide-react";
import { useCompanySearch } from "@/features/company/hooks/useCompanies";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";

type NavCommand = {
  id: string;
  label: string;
  to: string;
  icon: typeof Compass;
  keywords: string;
};

const NAV_COMMANDS: NavCommand[] = [
  {
    id: "discover",
    label: "Go to Discover",
    to: "/",
    icon: Compass,
    keywords: "discover home shortlist",
  },
  {
    id: "research",
    label: "Go to Research",
    to: "/research",
    icon: LineChart,
    keywords: "research library companies",
  },
  {
    id: "screener",
    label: "Go to Screener",
    to: "/screener",
    icon: SlidersHorizontal,
    keywords: "screener filters",
  },
  {
    id: "ideas",
    label: "Go to Ideas",
    to: "/ideas",
    icon: Layers,
    keywords: "ideas pipeline watchlist",
  },
  {
    id: "journal",
    label: "Go to Journal",
    to: "/journal",
    icon: NotebookPen,
    keywords: "journal thesis review",
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const navigate = useNavigate();
  const { data: results = [], isFetching } = useCompanySearch(debouncedQ);

  const matchedCommands = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return NAV_COMMANDS;
    return NAV_COMMANDS.filter((c) => (c.label + " " + c.keywords).toLowerCase().includes(query));
  }, [q]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (typing || open) return;

      // "/" focuses global search (opens the palette, same as Cmd+K).
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
        return;
      }

      // "g" then a second key -- Section 21 nav shortcuts. Tracked via a
      // short-lived flag on `window` so we don't need extra state/effects.
      if (e.key.toLowerCase() === "g") {
        (window as unknown as { __gPressedAt?: number }).__gPressedAt = Date.now();
        return;
      }
      const gAt = (window as unknown as { __gPressedAt?: number }).__gPressedAt;
      if (gAt && Date.now() - gAt < 800) {
        const map: Record<string, string> = {
          d: "/",
          r: "/research",
          s: "/screener",
          i: "/ideas",
          j: "/journal",
        };
        const to = map[e.key.toLowerCase()];
        if (to) {
          e.preventDefault();
          navigate({ to });
        }
        (window as unknown as { __gPressedAt?: number }).__gPressedAt = undefined;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, navigate]);

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
            placeholder="Find a company, or jump to a page…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-subtle"
          />
          {isFetching ? (
            <Loader2 className="size-3.5 text-ink-subtle animate-spin" />
          ) : (
            <kbd className="text-[10px] font-mono text-ink-subtle bg-secondary px-1.5 py-0.5 rounded">
              ESC
            </kbd>
          )}
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {matchedCommands.length > 0 && (
            <div className="mb-1">
              {q.trim().length === 0 && (
                <p className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-widest text-ink-subtle">
                  Navigate
                </p>
              )}
              {matchedCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: cmd.to });
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/60 transition-colors text-left"
                >
                  <cmd.icon className="size-3.5 text-ink-subtle shrink-0" />
                  <span className="text-sm text-ink">{cmd.label}</span>
                </button>
              ))}
            </div>
          )}

          {q.trim().length > 0 && (
            <>
              {results.length > 0 && (
                <p className="px-4 pt-2 pb-1.5 text-[10px] uppercase tracking-widest text-ink-subtle">
                  Companies
                </p>
              )}
              {results.length === 0 && matchedCommands.length === 0 && !isFetching && (
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
                    <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-ink-subtle">
                      {c.sector}
                    </span>
                    <ArrowRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="px-4 py-2 hairline-t flex items-center justify-between text-[10px] text-ink-subtle">
          <span>g then d/r/s/i/j to jump around</span>
          <span>Cmd+K to toggle</span>
        </div>
      </div>
    </div>
  );
}
