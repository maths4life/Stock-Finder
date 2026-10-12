import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { Search } from "lucide-react";
import { cn } from "@/shared/utils/utils";
import { ThemeToggle } from "@/shared/components/common/ThemeToggle";

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
    <div className="min-h-screen bg-paper text-ink selection:bg-accent/20 selection:text-accent font-sans">
      {/* ── Trading Terminal Status Bar ── */}
      <div className="bg-surface/90 border-b border-hairline py-1 px-4 text-[11px] font-mono flex items-center justify-between text-ink-subtle">
        <div className="flex items-center gap-4 overflow-hidden text-nowrap">
          <span className="flex items-center gap-1.5 text-positive font-medium">
            <span className="size-1.5 rounded-full bg-positive animate-pulse" />
            NSE · NIFTY 500
          </span>
          <span className="hidden sm:inline text-hairline">|</span>
          <span className="hidden sm:inline">SATURDAY CADENCE: 02:00 AM IST</span>
          <span className="hidden md:inline text-hairline">|</span>
          <span className="hidden md:inline text-ink-muted">INTELLIGENCE: THE ECONOMIC TIMES</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-ink-muted ring-1 ring-hairline">
            TERMINAL v2.4
          </span>
        </div>
      </div>

      <nav className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md hairline-b">
        <div className="page-container h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="flex items-center gap-2.5 font-semibold text-[15px] tracking-tight leading-none text-ink group"
            >
              <div className="size-7 rounded-lg bg-accent/15 ring-1 ring-accent/30 grid place-items-center text-accent group-hover:scale-105 transition-transform">
                <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
                  <path
                    d="M3 17L9 11L13 15L21 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M16 7H21V12"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight">Stock Finder</span>
                <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/10 text-accent ring-1 ring-accent/30 font-bold">
                  PRO
                </span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 font-mono",
                    isActive(n.to)
                      ? "text-accent bg-accent/10 ring-1 ring-accent/30 font-semibold shadow-[0_0_12px_rgba(56,189,248,0.08)]"
                      : "text-ink-muted hover:text-ink hover:bg-secondary/70",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
              }
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-md ring-1 ring-hairline bg-surface-raised hover:ring-accent/40 hover:bg-secondary transition-all"
            >
              <Search className="size-3.5 text-accent" />
              <span className="hidden sm:inline text-xs text-ink-muted font-mono">Search ticker…</span>
              <kbd className="text-[10px] font-mono text-ink-subtle bg-surface ring-1 ring-hairline rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle />
            <div className="size-8 rounded-md bg-secondary ring-1 ring-hairline grid place-items-center text-[11px] font-mono font-medium text-accent">
              IN
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
