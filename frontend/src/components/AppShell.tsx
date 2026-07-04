import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { Plus } from "lucide-react";

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
            <Link to="/" className="font-serif italic text-xl tracking-tight leading-none">
              Quant<span className="text-accent">.</span>
            </Link>
            <div className="hidden md:flex items-center gap-7">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "text-sm font-medium transition-colors " +
                    (isActive(n.to) ? "text-ink" : "text-ink-subtle hover:text-ink")
                  }
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
              <kbd className="text-[10px] font-mono text-ink-subtle">⌘K</kbd>
              <span className="text-xs text-ink-muted">Search companies…</span>
            </button>
            <div className="size-8 rounded-full bg-secondary ring-1 ring-hairline grid place-items-center text-[11px] font-medium text-ink-muted">
              AV
            </div>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 p-1 bg-ink/95 rounded-full shadow-2xl ring-1 ring-white/10">
        <FooterLink to="/" active={pathname === "/"}>Today</FooterLink>
        <FooterLink to="/screener" active={pathname.startsWith("/screener")}>Screen</FooterLink>
        <FooterLink to="/ideas" active={pathname.startsWith("/ideas")}>Ideas</FooterLink>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <Link
          to="/journal"
          className="pl-2 pr-3 py-2 flex items-center gap-2 rounded-full text-xs font-medium text-zinc-300 hover:text-white transition-colors"
        >
          <span className="size-4 bg-accent rounded-full grid place-items-center">
            <Plus className="size-2.5 text-accent-foreground" />
          </span>
          New Thesis
        </Link>
      </footer>

      <CommandPalette />
    </div>
  );
}

function FooterLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={
        "px-4 py-2 rounded-full text-xs font-medium transition-colors " +
        (active ? "text-white bg-white/10" : "text-zinc-400 hover:text-white")
      }
    >
      {children}
    </Link>
  );
}
