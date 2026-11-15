import { useState, useMemo, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Pencil,
  Trash2,
  NotebookPen,
  Search,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  ShieldAlert,
  Clock,
  Star,
  Compass,
  ChevronRight,
  ArrowUpRight,
  SlidersHorizontal,
  LayoutGrid,
  Columns2,
  Calendar,
  AlertCircle,
  Plus,
} from "lucide-react";
import { AppShell } from "@/shared/components/layout/AppShell";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { ErrorState } from "@/shared/components/common/ErrorState";
import { EmptyState } from "@/shared/components/common/EmptyState";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  useJournalEntries,
  useDeleteJournalEntry,
} from "@/features/journal/hooks/useJournalEntries";
import { useJournalReviews } from "@/features/journal/hooks/useJournalReviews";
import { useCompaniesForSymbols } from "@/features/company/hooks/useCompaniesForSymbols";
import { fetchJournalEntries } from "@/features/journal/api/journal";
import { fetchJournalReviews } from "@/features/journal/api/journalReviews";
import { JournalEntryForm } from "@/features/journal/components/JournalEntryForm";
import { JournalReviewList } from "@/features/journal/components/JournalReviewList";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { JournalEntry, Company } from "@/shared/api/types";
import { cn } from "@/shared/utils/utils";

export const Route = createFileRoute("/journal")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.journalEntries,
        queryFn: fetchJournalEntries,
      }),
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.journalReviews,
        queryFn: fetchJournalReviews,
      }),
    ]).catch(() => null),
  head: () => ({
    meta: [
      { title: "Journal — Stock Finder" },
      { name: "description", content: "Record every thesis. Review, learn, compound." },
    ],
  }),
  component: Journal,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)));
}

type FilterTab = "all" | "due" | "high_conviction" | "target_set";
type SortOption = "recent" | "due_soon" | "conviction" | "upside" | "symbol";
type ViewMode = "split" | "grid";

function Journal() {
  const { data: entries = [], isPending, isError, refetch } = useJournalEntries();
  const { data: reviews = [] } = useJournalReviews();
  const { data: companies = [] } = useCompaniesForSymbols(entries.map((e) => e.symbol));
  const deleteMutation = useDeleteJournalEntry();

  const companyBySymbol = useMemo(() => {
    return new Map<string, Company>(companies.map((c) => [c.symbol.toUpperCase(), c]));
  }, [companies]);

  const reviewsByEntryId = useMemo(() => {
    const map = new Map<string, typeof reviews>();
    for (const r of reviews) {
      map.set(r.entryId, [...(map.get(r.entryId) ?? []), r]);
    }
    return map;
  }, [reviews]);

  const now = Date.now();
  const dueEntries = useMemo(() => {
    return entries.filter((e) => e.reviewDueAt && new Date(e.reviewDueAt).getTime() <= now);
  }, [entries, now]);

  // Form & Delete States
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>(undefined);
  const [createPreselectSymbol, setCreatePreselectSymbol] = useState<string | undefined>(undefined);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Collect unique sectors from entries
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const c = companyBySymbol.get(e.symbol.toUpperCase());
      if (c?.sector) set.add(c.sector);
    }
    return Array.from(set).sort();
  }, [entries, companyBySymbol]);

  // Calculate Executive Stats
  const stats = useMemo(() => {
    const totalCount = entries.length;
    const dueCount = dueEntries.length;
    
    // Average conviction
    const rated = entries.filter((e) => e.confidenceLevel != null);
    const avgConviction = rated.length > 0
      ? (rated.reduce((sum, e) => sum + (e.confidenceLevel || 0), 0) / rated.length).toFixed(1)
      : null;

    // Average target upside
    const targetsWithPrice = entries.filter((e) => {
      const c = companyBySymbol.get(e.symbol.toUpperCase());
      return e.targetPrice && c?.price && c.price > 0;
    });

    let avgUpside: string | null = null;
    if (targetsWithPrice.length > 0) {
      const totalUpside = targetsWithPrice.reduce((sum, e) => {
        const c = companyBySymbol.get(e.symbol.toUpperCase())!;
        return sum + ((e.targetPrice! - c.price) / c.price) * 100;
      }, 0);
      avgUpside = (totalUpside / targetsWithPrice.length).toFixed(1);
    }

    // Actual Profit or Loss right now:
    // Calculated using the price at the day of writing thesis vs the latest price
    const entriesWithPerformance = entries.filter((e) => {
      const c = companyBySymbol.get(e.symbol.toUpperCase());
      const basePrice = e.entryPrice || (c?.price && c.price > 0 ? c.price : null);
      return basePrice && basePrice > 0 && c?.price && c.price > 0;
    });

    let avgActualPnl: string | null = null;
    let avgActualPnlNumeric: number | null = null;
    if (entriesWithPerformance.length > 0) {
      const totalActualPnl = entriesWithPerformance.reduce((sum, e) => {
        const c = companyBySymbol.get(e.symbol.toUpperCase())!;
        const basePrice = e.entryPrice || c.price;
        return sum + ((c.price - basePrice) / basePrice) * 100;
      }, 0);
      avgActualPnlNumeric = totalActualPnl / entriesWithPerformance.length;
      avgActualPnl = (avgActualPnlNumeric >= 0 ? "+" : "") + avgActualPnlNumeric.toFixed(1) + "%";
    }

    return { totalCount, dueCount, avgConviction, avgUpside, avgActualPnl, avgActualPnlNumeric };
  }, [entries, dueEntries, companyBySymbol]);

  // Filtered & Sorted Entries
  const filteredEntries = useMemo(() => {
    let result = [...entries];

    // 1. Text Search (symbol, name, sector, title, thesis, sell triggers, reasons)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((e) => {
        const c = companyBySymbol.get(e.symbol.toUpperCase());
        const sym = e.symbol.toLowerCase();
        const name = (c?.name || "").toLowerCase();
        const sector = (c?.sector || "").toLowerCase();
        const industry = (c?.industry || "").toLowerCase();
        const title = (e.title || "").toLowerCase();
        const thesis = (e.thesis || "").toLowerCase();
        const sellTrigger = (e.sellTrigger || "").toLowerCase();
        const fundamental = (e.fundamentalReasons || "").toLowerCase();
        const technical = (e.technicalReasons || "").toLowerCase();
        const macro = (e.macroReasons || "").toLowerCase();

        return (
          sym.includes(q) ||
          name.includes(q) ||
          sector.includes(q) ||
          industry.includes(q) ||
          title.includes(q) ||
          thesis.includes(q) ||
          sellTrigger.includes(q) ||
          fundamental.includes(q) ||
          technical.includes(q) ||
          macro.includes(q)
        );
      });
    }

    // 2. Filter Tabs
    if (filterTab === "due") {
      result = result.filter((e) => e.reviewDueAt && new Date(e.reviewDueAt).getTime() <= now);
    } else if (filterTab === "high_conviction") {
      result = result.filter((e) => (e.confidenceLevel || 0) >= 4);
    } else if (filterTab === "target_set") {
      result = result.filter((e) => e.targetPrice != null && e.targetPrice > 0);
    }

    // 3. Sector Filter
    if (selectedSector !== "all") {
      result = result.filter((e) => {
        const c = companyBySymbol.get(e.symbol.toUpperCase());
        return c?.sector === selectedSector;
      });
    }

    // 4. Sorting
    result.sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "due_soon") {
        const aDue = a.reviewDueAt ? new Date(a.reviewDueAt).getTime() : Infinity;
        const bDue = b.reviewDueAt ? new Date(b.reviewDueAt).getTime() : Infinity;
        return aDue - bDue;
      }
      if (sortBy === "conviction") {
        return (b.confidenceLevel || 0) - (a.confidenceLevel || 0);
      }
      if (sortBy === "upside") {
        const getUpside = (e: JournalEntry) => {
          const c = companyBySymbol.get(e.symbol.toUpperCase());
          if (e.targetPrice && c?.price && c.price > 0) {
            return ((e.targetPrice - c.price) / c.price) * 100;
          }
          return e.expectedReturnPct || -999;
        };
        return getUpside(b) - getUpside(a);
      }
      if (sortBy === "symbol") {
        return a.symbol.localeCompare(b.symbol);
      }
      return 0;
    });

    return result;
  }, [entries, searchQuery, filterTab, selectedSector, sortBy, companyBySymbol, now]);

  // Keep selectedEntryId in sync with filtered items
  useEffect(() => {
    if (filteredEntries.length > 0) {
      if (!selectedEntryId || !filteredEntries.some((e) => e.id === selectedEntryId)) {
        setSelectedEntryId(filteredEntries[0].id);
      }
    } else {
      setSelectedEntryId(null);
    }
  }, [filteredEntries, selectedEntryId]);

  const activeEntry = useMemo(() => {
    if (!selectedEntryId) return filteredEntries[0] || null;
    return entries.find((e) => e.id === selectedEntryId) || filteredEntries[0] || null;
  }, [selectedEntryId, entries, filteredEntries]);

  function openCreate(preselectSymbol?: string) {
    setEditingEntry(undefined);
    setCreatePreselectSymbol(preselectSymbol);
    setFormOpen(true);
  }

  function openEdit(entry: JournalEntry) {
    setEditingEntry(entry);
    setCreatePreselectSymbol(undefined);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId);
      setPendingDeleteId(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
        {/* 1. HERO HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-hairline">
          <div>
            <div className="flex items-center gap-2 text-accent text-xs font-mono font-semibold uppercase tracking-wider mb-2">
              <Compass className="size-3.5" />
              <span>Investment Thesis Journal</span>
            </div>
            <h1 className="text-display-sm sm:text-display-md font-bold text-ink tracking-tight">
              Document your edge. Review & compound.
            </h1>
            <p className="text-sm text-ink-muted mt-2 max-w-2xl leading-relaxed">
              Track your hypotheses, target valuations, and pre-mortems. When market noise tests your discipline, reviewing your original thesis keeps you rational.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              onClick={() => openCreate()}
              className="font-semibold text-xs px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <Plus className="size-4" />
              <span>Write New Thesis</span>
            </Button>
          </div>
        </div>

        {/* 2. EXECUTIVE METRICS KPI BAR */}
        {!isPending && !isError && entries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
            {/* Card 1: Covered Stocks */}
            <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface-raised flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-ink-subtle uppercase tracking-wider">
                  Active Theses
                </p>
                <p className="text-2xl font-bold text-ink mt-0.5">
                  {stats.totalCount} <span className="text-xs font-normal text-ink-muted">stocks</span>
                </p>
                <p className="text-[11px] text-ink-subtle mt-1 font-mono">
                  Across {availableSectors.length} sectors
                </p>
              </div>
              <div className="size-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                <NotebookPen className="size-5" />
              </div>
            </div>

            {/* Card 2: Reviews Due */}
            <div
              onClick={() => stats.dueCount > 0 && setFilterTab("due")}
              className={cn(
                "p-4 rounded-xl ring-1 transition-all flex items-center justify-between",
                stats.dueCount > 0
                  ? "ring-accent/40 bg-accent/5 cursor-pointer hover:ring-accent"
                  : "ring-hairline bg-surface-raised",
              )}
            >
              <div>
                <p className="text-[11px] font-mono text-ink-subtle uppercase tracking-wider flex items-center gap-1.5">
                  Reviews Due
                  {stats.dueCount > 0 && (
                    <span className="size-2 rounded-full bg-accent animate-pulse" />
                  )}
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold mt-0.5",
                    stats.dueCount > 0 ? "text-accent" : "text-ink",
                  )}
                >
                  {stats.dueCount} <span className="text-xs font-normal text-ink-muted">ready</span>
                </p>
                <p className="text-[11px] text-ink-subtle mt-1 font-mono">
                  {stats.dueCount > 0 ? "Click to view due theses" : "All reviews up to date"}
                </p>
              </div>
              <div
                className={cn(
                  "size-10 rounded-lg flex items-center justify-center",
                  stats.dueCount > 0 ? "bg-accent/20 text-accent" : "bg-secondary text-ink-subtle",
                )}
              >
                <Calendar className="size-5" />
              </div>
            </div>

            {/* Card 3: Actual P&L Right Now (Price on day of writing thesis vs latest price) */}
            <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface-raised flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-ink-subtle uppercase tracking-wider">
                  Actual P&L Right Now
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold mt-0.5 font-mono",
                    (stats.avgActualPnlNumeric ?? 0) >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {stats.avgActualPnl ?? "0.0%"}
                </p>
                <p className="text-[11px] text-ink-subtle mt-1 font-mono">
                  Price then vs latest CMP
                </p>
              </div>
              <div
                className={cn(
                  "size-10 rounded-lg flex items-center justify-center",
                  (stats.avgActualPnlNumeric ?? 0) >= 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
                )}
              >
                {(stats.avgActualPnlNumeric ?? 0) >= 0 ? (
                  <TrendingUp className="size-5" />
                ) : (
                  <TrendingDown className="size-5" />
                )}
              </div>
            </div>

            {/* Card 4: Avg Target Upside */}
            <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface-raised flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-ink-subtle uppercase tracking-wider">
                  Avg Target Upside
                </p>
                <p className="text-2xl font-bold text-positive mt-0.5 font-mono">
                  {stats.avgUpside ? `+${stats.avgUpside}%` : "—"}
                </p>
                <p className="text-[11px] text-ink-subtle mt-1 font-mono">
                  Based on target vs CMP
                </p>
              </div>
              <div className="size-10 rounded-lg bg-positive/10 text-positive flex items-center justify-center">
                <Target className="size-5" />
              </div>
            </div>

            {/* Card 5: Avg Conviction */}
            <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface-raised flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-ink-subtle uppercase tracking-wider">
                  Avg Conviction
                </p>
                <p className="text-2xl font-bold text-ink mt-0.5 flex items-baseline gap-1">
                  {stats.avgConviction ?? "—"}{" "}
                  <span className="text-xs font-normal text-ink-muted">/ 5.0</span>
                </p>
                <div className="flex items-center gap-0.5 text-accent mt-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <Star
                      key={lvl}
                      className={cn(
                        "size-3",
                        stats.avgConviction && Number(stats.avgConviction) >= lvl
                          ? "fill-accent text-accent"
                          : "text-hairline-strong",
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="size-10 rounded-lg bg-secondary text-ink flex items-center justify-center">
                <Star className="size-5 text-accent" />
              </div>
            </div>
          </div>
        )}

        {/* 3. SEARCH & INTERACTIVE CONTROLS TOOLBAR */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Instant Search Bar */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-subtle pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search theses by symbol, company name, keywords, sell triggers... (Press '/' to focus)"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm bg-surface ring-1 ring-hairline placeholder:text-ink-subtle focus:ring-hairline-strong focus:bg-surface-raised outline-none transition-all"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition-colors"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex absolute right-3.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-ink-subtle ring-1 ring-hairline">
                  /
                </kbd>
              )}
            </div>

            {/* Filter Pills, Sector & Sort Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Sector Dropdown */}
              {availableSectors.length > 0 && (
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-surface ring-1 ring-hairline text-ink outline-none hover:ring-hairline-strong transition-colors cursor-pointer"
                >
                  <option value="all">All Sectors ({availableSectors.length})</option>
                  {availableSectors.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-surface ring-1 ring-hairline text-ink outline-none hover:ring-hairline-strong transition-colors cursor-pointer"
              >
                <option value="recent">Sort: Newest First</option>
                <option value="due_soon">Sort: Review Due Soon</option>
                <option value="conviction">Sort: Highest Conviction</option>
                <option value="upside">Sort: Highest Upside %</option>
                <option value="symbol">Sort: Symbol (A-Z)</option>
              </select>

              {/* View Mode Switcher */}
              <div className="hidden lg:flex items-center rounded-lg ring-1 ring-hairline p-0.5 bg-surface">
                <button
                  type="button"
                  onClick={() => setViewMode("split")}
                  className={cn(
                    "p-1.5 rounded-md text-xs transition-colors flex items-center gap-1",
                    viewMode === "split"
                      ? "bg-secondary text-ink font-semibold shadow-sm"
                      : "text-ink-subtle hover:text-ink",
                  )}
                  title="Split view: Roster on left, full thesis on right"
                >
                  <Columns2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md text-xs transition-colors flex items-center gap-1",
                    viewMode === "grid"
                      ? "bg-secondary text-ink font-semibold shadow-sm"
                      : "text-ink-subtle hover:text-ink",
                  )}
                  title="Grid view: Multi-column cards"
                >
                  <LayoutGrid className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Tab Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-b border-hairline pb-3">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                filterTab === "all"
                  ? "bg-ink text-background font-semibold"
                  : "bg-surface ring-1 ring-hairline text-ink-muted hover:text-ink",
              )}
            >
              <span>All Theses</span>
              <span className="font-mono text-[10px] opacity-80">({entries.length})</span>
            </button>

            {dueEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("due")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                  filterTab === "due"
                    ? "bg-accent text-white font-semibold"
                    : "bg-accent/10 ring-1 ring-accent/30 text-accent hover:bg-accent/20",
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
                <span>Reviews Due</span>
                <span className="font-mono text-[10px]">({dueEntries.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFilterTab("high_conviction")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                filterTab === "high_conviction"
                  ? "bg-ink text-background font-semibold"
                  : "bg-surface ring-1 ring-hairline text-ink-muted hover:text-ink",
              )}
            >
              <Star className="size-3 fill-current" />
              <span>High Conviction (4-5★)</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab("target_set")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                filterTab === "target_set"
                  ? "bg-ink text-background font-semibold"
                  : "bg-surface ring-1 ring-hairline text-ink-muted hover:text-ink",
              )}
            >
              <Target className="size-3" />
              <span>With Target Price</span>
            </button>

            {searchQuery && (
              <span className="text-xs text-ink-subtle ml-auto font-mono">
                Showing {filteredEntries.length} of {entries.length} theses
              </span>
            )}
          </div>
        </div>

        {/* 4. LOADING STATE */}
        {isPending && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-6 rounded-xl ring-1 ring-hairline bg-surface space-y-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* 5. ERROR STATE */}
        {isError && (
          <ErrorState
            description="Couldn't load your investment journal."
            onRetry={() => refetch()}
          />
        )}

        {/* 6. ZERO ENTRIES STATE */}
        {!isPending && !isError && entries.length === 0 && (
          <div className="py-16 text-center max-w-xl mx-auto space-y-6 animate-fade-in">
            <div className="size-16 rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/20 mx-auto flex items-center justify-center">
              <NotebookPen className="size-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-ink">Your Journal is Empty</h2>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                Start logging your investment hypotheses before you enter a position. Record target valuations, key drivers, and sell conditions to eliminate cognitive biases.
              </p>
            </div>

            <Button
              onClick={() => openCreate()}
              className="font-semibold text-sm px-6 py-3 rounded-lg shadow-sm"
            >
              + Document Your First Thesis
            </Button>
          </div>
        )}

        {/* 7. NO SEARCH RESULTS STATE */}
        {!isPending && !isError && entries.length > 0 && filteredEntries.length === 0 && (
          <div className="py-14 text-center max-w-md mx-auto space-y-4 animate-fade-in">
            <AlertCircle className="size-10 text-ink-subtle mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-ink">No theses match your filters</h3>
              <p className="text-xs text-ink-muted mt-1">
                {searchQuery
                  ? `No journal entries found for "${searchQuery}".`
                  : "Try clearing your filters or selecting a different sector."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setFilterTab("all");
                  setSelectedSector("all");
                }}
              >
                Clear All Filters
              </Button>
              {searchQuery && (
                <Button size="sm" onClick={() => openCreate(searchQuery.toUpperCase())}>
                  + Write Thesis for "{searchQuery.toUpperCase()}"
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 8. MAIN CONTENT: SPLIT VIEW (MASTER-DETAIL) */}
        {!isPending && !isError && filteredEntries.length > 0 && viewMode === "split" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Roster List (4 cols) */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-subtle px-1 flex items-center justify-between">
                <span>Theses ({filteredEntries.length})</span>
                <span>Click to view</span>
              </div>

              {filteredEntries.map((e) => {
                const c = companyBySymbol.get(e.symbol.toUpperCase());
                const isSelected = activeEntry?.id === e.id;
                const isDue = e.reviewDueAt && new Date(e.reviewDueAt).getTime() <= now;

                // Actual P&L calculation: price then vs latest CMP
                const basePrice = e.entryPrice || (c?.price && c.price > 0 ? c.price : null);
                let actualPnlPct: number | null = null;
                if (basePrice && c?.price && c.price > 0 && basePrice > 0) {
                  actualPnlPct = Number((((c.price - basePrice) / basePrice) * 100).toFixed(1));
                }

                // Upside calculation
                let upsidePct: number | null = null;
                if (e.targetPrice && c?.price && c.price > 0) {
                  upsidePct = Number((((e.targetPrice - c.price) / c.price) * 100).toFixed(1));
                } else if (e.expectedReturnPct != null) {
                  upsidePct = e.expectedReturnPct;
                }

                return (
                  <div
                    key={e.id}
                    onClick={() => setSelectedEntryId(e.id)}
                    className={cn(
                      "p-4 rounded-xl ring-1 transition-all cursor-pointer text-left relative",
                      isSelected
                        ? "ring-2 ring-accent bg-surface-raised shadow-md"
                        : "ring-hairline bg-surface hover:ring-hairline-strong hover:bg-surface-raised/70",
                    )}
                  >
                    {/* Top Row: Symbol, Exchange & Date */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-secondary text-ink ring-1 ring-hairline">
                          {e.symbol}
                        </span>
                        <span className="text-xs font-semibold text-ink truncate">
                          {c ? c.name : e.symbol}
                        </span>
                      </div>

                      {isDue && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent ring-1 ring-accent/30 flex items-center gap-1">
                          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                          Review Due
                        </span>
                      )}
                    </div>

                    {/* Price, Actual P&L & Target Upside */}
                    <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-hairline/60">
                      <div className="font-mono text-ink-muted text-[11px]">
                        {c?.price ? (
                          <>
                            CMP:{" "}
                            <span className="text-ink font-semibold">
                              ₹{c.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                            </span>
                          </>
                        ) : (
                          c?.sector || "Tracked Stock"
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        {actualPnlPct != null && (
                          <span
                            className={cn(
                              "font-semibold flex items-center gap-0.5",
                              actualPnlPct >= 0 ? "text-positive" : "text-negative",
                            )}
                            title={e.entryPrice ? `Entry: ₹${e.entryPrice} → CMP: ₹${c?.price}` : undefined}
                          >
                            {actualPnlPct >= 0 ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
                            {actualPnlPct >= 0 ? `+${actualPnlPct}%` : `${actualPnlPct}%`} P&L
                          </span>
                        )}
                        {upsidePct != null && (
                          <span className="text-ink-subtle hidden sm:inline">
                            ({upsidePct >= 0 ? `+${upsidePct}%` : `${upsidePct}%`} target)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Thesis Excerpt */}
                    <p className="text-xs text-ink-muted line-clamp-2 mt-2 leading-relaxed">
                      {e.thesis}
                    </p>

                    {/* Bottom Metadata: Conviction & Horizon */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-ink-subtle mt-2.5 pt-2 border-t border-hairline/40">
                      <div className="flex items-center gap-1">
                        {e.confidenceLevel ? (
                          <span className="flex items-center gap-0.5 text-accent font-semibold">
                            <Star className="size-3 fill-accent" />
                            {e.confidenceLevel}/5
                          </span>
                        ) : (
                          <span>Unrated</span>
                        )}
                        <span>·</span>
                        <span>{e.horizonMonths ? `${e.horizonMonths}M` : "12M"}</span>
                      </div>

                      <span>{formatDate(e.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Active Detail Pane (8 cols) */}
            <div className="lg:col-span-7 xl:col-span-8 sticky top-6">
              {activeEntry ? (
                <article className="p-6 sm:p-8 rounded-2xl ring-1 ring-hairline bg-surface-raised space-y-8 animate-fade-in">
                  {/* Top Header of Active Thesis */}
                  {(() => {
                    const c = companyBySymbol.get(activeEntry.symbol.toUpperCase());
                    const isDue =
                      activeEntry.reviewDueAt &&
                      new Date(activeEntry.reviewDueAt).getTime() <= now;

                    // Actual P&L calculation: price then vs latest CMP
                    const basePrice = activeEntry.entryPrice || (c?.price && c.price > 0 ? c.price : null);
                    let actualPnlPct: number | null = null;
                    if (basePrice && c?.price && c.price > 0 && basePrice > 0) {
                      actualPnlPct = Number((((c.price - basePrice) / basePrice) * 100).toFixed(1));
                    }

                    let upsidePct: number | null = null;
                    if (activeEntry.targetPrice && c?.price && c.price > 0) {
                      upsidePct = Number(
                        (((activeEntry.targetPrice - c.price) / c.price) * 100).toFixed(1),
                      );
                    } else if (activeEntry.expectedReturnPct != null) {
                      upsidePct = activeEntry.expectedReturnPct;
                    }

                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-hairline">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-accent/10 text-accent ring-1 ring-accent/30">
                                {activeEntry.symbol}
                              </span>
                              <span className="text-xs font-mono text-ink-subtle">
                                {c?.exchange || "NSE"}
                              </span>
                              {c?.industry && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-ink-muted ring-1 ring-hairline">
                                  {c.industry}
                                </span>
                              )}
                            </div>
                            <h2 className="text-xl sm:text-2xl font-bold text-ink">
                              {c?.name || activeEntry.symbol}
                            </h2>
                            {activeEntry.title && (
                              <p className="text-sm font-medium text-ink-muted mt-1">
                                {activeEntry.title}
                              </p>
                            )}
                          </div>

                          {/* Top Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Link
                              to="/research/$symbol"
                              params={{ symbol: activeEntry.symbol }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent/10 ring-1 ring-accent/30 transition-colors inline-flex items-center gap-1"
                            >
                              <span>Research</span>
                              <ArrowUpRight className="size-3.5" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => openEdit(activeEntry)}
                              className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-secondary ring-1 ring-hairline transition-colors"
                              title="Edit thesis"
                            >
                              <Pencil className="size-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(activeEntry.id)}
                              className="p-2 rounded-lg text-ink-subtle hover:text-negative hover:bg-negative/10 ring-1 ring-hairline transition-colors"
                              title="Delete entry"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Metric Strip: Current Price, Entry Price, Actual P&L, Target, Conviction */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4 rounded-xl ring-1 ring-hairline bg-surface/50">
                          <div>
                            <p className="text-[11px] font-mono text-ink-subtle uppercase">
                              Current CMP
                            </p>
                            <p className="font-mono text-base font-bold text-ink mt-0.5">
                              {c?.price
                                ? `₹${c.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`
                                : "—"}
                            </p>
                            {c?.changePct != null && (
                              <p
                                className={cn(
                                  "text-[10px] font-mono flex items-center gap-0.5",
                                  c.changePct >= 0 ? "text-positive" : "text-negative",
                                )}
                              >
                                {c.changePct >= 0 ? "+" : ""}
                                {c.changePct.toFixed(2)}% today
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-[11px] font-mono text-ink-subtle uppercase">
                              Price When Written
                            </p>
                            <p className="font-mono text-base font-bold text-ink mt-0.5">
                              {basePrice
                                ? `₹${basePrice.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`
                                : "—"}
                            </p>
                            <p className="text-[10px] text-ink-subtle font-mono">
                              Logged {formatDate(activeEntry.createdAt)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[11px] font-mono text-ink-subtle uppercase">
                              Actual P&L
                            </p>
                            <p
                              className={cn(
                                "font-mono text-base font-bold mt-0.5 flex items-center gap-1",
                                (actualPnlPct ?? 0) >= 0 ? "text-positive" : "text-negative",
                              )}
                            >
                              {(actualPnlPct ?? 0) >= 0 ? (
                                <TrendingUp className="size-4" />
                              ) : (
                                <TrendingDown className="size-4" />
                              )}
                              <span>
                                {actualPnlPct != null
                                  ? `${actualPnlPct >= 0 ? "+" : ""}${actualPnlPct}%`
                                  : "0.0%"}
                              </span>
                            </p>
                            <p className="text-[10px] text-ink-subtle font-mono">
                              Since thesis date
                            </p>
                          </div>

                          <div>
                            <p className="text-[11px] font-mono text-ink-subtle uppercase">
                              Target Valuation
                            </p>
                            <p className="font-mono text-base font-bold text-ink mt-0.5">
                              {activeEntry.targetPrice
                                ? `₹${activeEntry.targetPrice.toLocaleString("en-IN")}`
                                : "—"}
                            </p>
                            {upsidePct != null && (
                              <p
                                className={cn(
                                  "text-[10px] font-mono font-semibold",
                                  upsidePct >= 0 ? "text-positive" : "text-negative",
                                )}
                              >
                                {upsidePct >= 0 ? `+${upsidePct}%` : `${upsidePct}%`} target
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-[11px] font-mono text-ink-subtle uppercase">
                              Conviction
                            </p>
                            <p className="text-base font-bold text-ink mt-0.5 flex items-center gap-1">
                              <Star className="size-4 fill-accent text-accent" />
                              <span>{activeEntry.confidenceLevel ?? "—"}</span>
                              <span className="text-xs text-ink-subtle font-normal">/ 5</span>
                            </p>
                            <p className="text-[10px] text-ink-subtle font-mono">
                              {activeEntry.horizonMonths ? `${activeEntry.horizonMonths}M horizon` : "12M horizon"}
                            </p>
                          </div>
                        </div>

                        {/* Core Thesis Block */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-mono uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
                            <Sparkles className="size-3.5" />
                            Core Investment Thesis
                          </p>
                          <div className="p-5 rounded-xl ring-1 ring-hairline bg-surface border-l-4 border-l-accent">
                            <p className="text-[15px] leading-relaxed text-ink whitespace-pre-line">
                              {activeEntry.thesis}
                            </p>
                          </div>
                        </div>

                        {/* Reasons / Catalysts Grid */}
                        {(activeEntry.fundamentalReasons ||
                          activeEntry.technicalReasons ||
                          activeEntry.sectorReasons ||
                          activeEntry.macroReasons) && (
                          <div className="space-y-3">
                            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-subtle font-semibold">
                              Investment Pillars & Catalysts
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {activeEntry.fundamentalReasons && (
                                <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface space-y-1">
                                  <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                                    <span className="size-1.5 rounded-full bg-accent" />
                                    Fundamental Catalysts
                                  </p>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    {activeEntry.fundamentalReasons}
                                  </p>
                                </div>
                              )}
                              {activeEntry.technicalReasons && (
                                <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface space-y-1">
                                  <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                                    <span className="size-1.5 rounded-full bg-accent" />
                                    Technical Setup
                                  </p>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    {activeEntry.technicalReasons}
                                  </p>
                                </div>
                              )}
                              {activeEntry.sectorReasons && (
                                <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface space-y-1">
                                  <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                                    <span className="size-1.5 rounded-full bg-accent" />
                                    Sector / Competitive Context
                                  </p>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    {activeEntry.sectorReasons}
                                  </p>
                                </div>
                              )}
                              {activeEntry.macroReasons && (
                                <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface space-y-1">
                                  <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                                    <span className="size-1.5 rounded-full bg-accent" />
                                    Macro Environment
                                  </p>
                                  <p className="text-xs text-ink-muted leading-relaxed">
                                    {activeEntry.macroReasons}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Pre-Mortem & Sell Triggers */}
                        {(activeEntry.sellTrigger ||
                          activeEntry.assumptions ||
                          activeEntry.risksAccepted ||
                          activeEntry.personalNotes) && (
                          <div className="space-y-3">
                            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-subtle font-semibold flex items-center gap-1.5">
                              <ShieldAlert className="size-3.5 text-accent" />
                              Pre-Mortem & Discipline Rules
                            </p>
                            <div className="p-5 rounded-xl ring-1 ring-accent/30 bg-accent/5 space-y-4">
                              {activeEntry.sellTrigger && (
                                <div>
                                  <p className="text-xs font-bold text-accent uppercase tracking-wider">
                                    What would make you sell:
                                  </p>
                                  <p className="text-sm font-medium text-ink mt-0.5 leading-relaxed">
                                    {activeEntry.sellTrigger}
                                  </p>
                                </div>
                              )}

                              {activeEntry.assumptions && (
                                <div className="pt-2 border-t border-hairline/60">
                                  <p className="text-xs font-semibold text-ink-muted">
                                    Key Assumptions:
                                  </p>
                                  <p className="text-xs text-ink mt-0.5 leading-relaxed">
                                    {activeEntry.assumptions}
                                  </p>
                                </div>
                              )}

                              {activeEntry.risksAccepted && (
                                <div className="pt-2 border-t border-hairline/60">
                                  <p className="text-xs font-semibold text-ink-muted">
                                    Risks Accepted:
                                  </p>
                                  <p className="text-xs text-ink mt-0.5 leading-relaxed">
                                    {activeEntry.risksAccepted}
                                  </p>
                                </div>
                              )}

                              {activeEntry.personalNotes && (
                                <div className="pt-2 border-t border-hairline/60">
                                  <p className="text-xs font-semibold text-ink-muted">
                                    Personal Notes:
                                  </p>
                                  <p className="text-xs text-ink mt-0.5 leading-relaxed">
                                    {activeEntry.personalNotes}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Reviews & Retrospectives Timeline */}
                        <div className="pt-4 border-t border-hairline">
                          <JournalReviewList
                            entryId={activeEntry.id}
                            reviews={reviewsByEntryId.get(activeEntry.id) ?? []}
                            reviewDueAt={activeEntry.reviewDueAt}
                          />
                        </div>
                      </>
                    );
                  })()}
                </article>
              ) : (
                <div className="p-12 text-center rounded-2xl ring-1 ring-hairline bg-surface text-ink-muted text-sm">
                  Select a company from the left roster to view its thesis details.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 9. MAIN CONTENT: GRID VIEW */}
        {!isPending && !isError && filteredEntries.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {filteredEntries.map((e) => {
              const c = companyBySymbol.get(e.symbol.toUpperCase());
              const isDue = e.reviewDueAt && new Date(e.reviewDueAt).getTime() <= now;

              // Actual P&L calculation: price then vs latest CMP
              const basePrice = e.entryPrice || (c?.price && c.price > 0 ? c.price : null);
              let actualPnlPct: number | null = null;
              if (basePrice && c?.price && c.price > 0 && basePrice > 0) {
                actualPnlPct = Number((((c.price - basePrice) / basePrice) * 100).toFixed(1));
              }

              let upsidePct: number | null = null;
              if (e.targetPrice && c?.price && c.price > 0) {
                upsidePct = Number((((e.targetPrice - c.price) / c.price) * 100).toFixed(1));
              } else if (e.expectedReturnPct != null) {
                upsidePct = e.expectedReturnPct;
              }

              return (
                <article
                  key={e.id}
                  className="p-5 rounded-2xl ring-1 ring-hairline bg-surface-raised hover:ring-hairline-strong transition-all flex flex-col justify-between space-y-4"
                >
                  <div>
                    {/* Header: Symbol & Actions */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-accent/10 text-accent ring-1 ring-accent/30">
                            {e.symbol}
                          </span>
                          <span className="text-[11px] font-mono text-ink-subtle">
                            {c?.exchange || "NSE"}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-ink mt-1 truncate">
                          {c?.name || e.symbol}
                        </h3>
                        {e.title && (
                          <p className="text-xs text-ink-muted line-clamp-1 mt-0.5">{e.title}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          className="p-1.5 rounded-md text-ink-subtle hover:text-ink hover:bg-secondary transition-colors"
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(e.id)}
                          className="p-1.5 rounded-md text-ink-subtle hover:text-negative hover:bg-negative/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Price, Actual P&L & Target Bar */}
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface ring-1 ring-hairline text-xs font-mono mb-3">
                      <div>
                        <span className="text-ink-subtle text-[10px]">CMP: </span>
                        <span className="font-semibold text-ink">
                          {c?.price
                            ? `₹${c.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {actualPnlPct != null && (
                          <span
                            className={cn(
                              "font-semibold flex items-center gap-0.5",
                              actualPnlPct >= 0 ? "text-positive" : "text-negative",
                            )}
                            title={e.entryPrice ? `Entry: ₹${e.entryPrice} → CMP: ₹${c?.price}` : undefined}
                          >
                            {actualPnlPct >= 0 ? "+" : ""}
                            {actualPnlPct}% P&L
                          </span>
                        )}
                        {upsidePct != null && (
                          <span className="text-ink-subtle">
                            ({upsidePct >= 0 ? `+${upsidePct}%` : `${upsidePct}%`} target)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Thesis Excerpt */}
                    <p className="text-xs text-ink-muted line-clamp-3 leading-relaxed">
                      {e.thesis}
                    </p>

                    {/* Pre-Mortem Highlight */}
                    {e.sellTrigger && (
                      <div className="mt-3 p-2.5 rounded-lg bg-accent/5 ring-1 ring-accent/20 text-xs">
                        <p className="text-[10px] font-bold text-accent uppercase">Exit Rule:</p>
                        <p className="text-[11px] text-ink line-clamp-1 font-medium mt-0.5">
                          {e.sellTrigger}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-hairline flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 font-mono text-[11px] text-ink-subtle">
                      <Star className="size-3 fill-accent text-accent" />
                      <span className="font-semibold text-ink">{e.confidenceLevel ?? "—"}/5</span>
                      <span>·</span>
                      <span>{e.horizonMonths ?? "12"}M</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isDue && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-white">
                          Due
                        </span>
                      )}
                      <Link
                        to="/research/$symbol"
                        params={{ symbol: e.symbol }}
                        className="text-xs font-medium text-accent hover:underline flex items-center gap-0.5"
                      >
                        Research →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT DIALOG */}
      <JournalEntryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editingEntry}
        defaultSymbol={createPreselectSymbol}
      />

      {/* DELETE CONFIRMATION DIALOG */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this thesis entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the thesis and associated reviews from your journal. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
