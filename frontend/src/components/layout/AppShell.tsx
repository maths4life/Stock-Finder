import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Discover" },
  { to: "/research", label: "Research" },
  { to: "/screener", label: "Screener" },
  { to: "/ideas", label: "Ideas" },
  { to: "/journal", label: "Journal" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-accent/15 selection:text-accent">
      <nav className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md hairline-b">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link to="/" className="flex items-center gap-1.5 font-semibold text-[15px] tracking-tight leading-none text-ink">
              <span className="size-6 rounded-md bg-accent text-accent-foreground grid place-items-center text-[11px] font-bold">
                Q
              </span>
              Quant
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive(n.to) ? "text-ink bg-secondary" : "text-ink-subtle hover:text-ink hover:bg-secondary/60",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md ring-1 ring-hairline bg-secondary/60 hover:bg-secondary transition-colors"
            >
              <Search className="size-3.5 text-ink-subtle" />
              <span className="hidden sm:inline text-xs text-ink-muted">Search companies…</span>
              <kbd className="text-[10px] font-mono text-ink-subtle bg-surface-raised ring-1 ring-hairline rounded px-1">
                ⌘K
              </kbd>
            </button>
            <div className="size-8 rounded-full bg-secondary ring-1 ring-hairline grid place-items-center text-[11px] font-medium text-ink-muted">
              AV
            </div>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="md:hidden flex items-center gap-1 px-4 pb-2.5 overflow-x-auto">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
                isActive(n.to) ? "text-ink bg-secondary" : "text-ink-subtle hover:text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </nav>

      <main>{children}</main>

      <CommandPalette />
    </div>
  );
}
