import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, Check, Building2, TrendingUp, TrendingDown } from "lucide-react";
import { useAllCompanies } from "@/features/company/hooks/useCompanies";
import type { Company } from "@/shared/api/types";
import { cn } from "@/shared/utils/utils";

interface CompanySearchSelectProps {
  value: string;
  onChange: (symbol: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  onCompanySelected?: (company: Company) => void;
}

const DEFAULT_POPULAR_SYMBOLS = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "TRENT",
  "LENSKART",
  "APOLLOHOSP",
  "ICICIBANK",
];

export function CompanySearchSelect({
  value,
  onChange,
  disabled = false,
  error,
  placeholder = "Search by symbol or company name (e.g. TCS, Lenskart, Trent)...",
  onCompanySelected,
}: CompanySearchSelectProps) {
  const { data: companies = [], isPending } = useAllCompanies();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Map of companies by symbol for quick lookup
  const companyBySymbol = useMemo(() => {
    const map = new Map<string, Company>();
    for (const c of companies) {
      map.set(c.symbol.toUpperCase(), c);
    }
    return map;
  }, [companies]);

  const selectedCompany = useMemo(() => {
    if (!value) return null;
    return companyBySymbol.get(value.toUpperCase()) || null;
  }, [value, companyBySymbol]);

  // Filter companies based on query
  const filteredCompanies = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) {
      // Return popular or top companies when query is empty
      const popular = DEFAULT_POPULAR_SYMBOLS.map((s) => companyBySymbol.get(s)).filter(
        Boolean,
      ) as Company[];
      if (popular.length >= 6) return popular;
      return companies.slice(0, 8);
    }

    const exactSymbolMatches: Company[] = [];
    const startsWithSymbolMatches: Company[] = [];
    const containsSymbolMatches: Company[] = [];
    const nameMatches: Company[] = [];

    for (const c of companies) {
      const sym = c.symbol.toUpperCase();
      const name = c.name.toUpperCase();

      if (sym === q) {
        exactSymbolMatches.push(c);
      } else if (sym.startsWith(q)) {
        startsWithSymbolMatches.push(c);
      } else if (sym.includes(q)) {
        containsSymbolMatches.push(c);
      } else if (name.includes(q)) {
        nameMatches.push(c);
      }
    }

    return [
      ...exactSymbolMatches,
      ...startsWithSymbolMatches,
      ...containsSymbolMatches,
      ...nameMatches,
    ].slice(0, 10);
  }, [query, companies, companyBySymbol]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(company: Company) {
    onChange(company.symbol);
    onCompanySelected?.(company);
    setIsOpen(false);
    setQuery("");
  }

  function handleClear() {
    if (disabled) return;
    onChange("");
    setQuery("");
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredCompanies.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(
        (prev) => (prev - 1 + filteredCompanies.length) % Math.max(1, filteredCompanies.length),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCompanies[highlightedIndex]) {
        handleSelect(filteredCompanies[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* State A: Selected Company Card */}
      {selectedCompany ? (
        <div
          className={cn(
            "p-3 rounded-lg ring-1 transition-all flex items-center justify-between gap-3 bg-surface-raised",
            error ? "ring-negative" : "ring-hairline",
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-md bg-accent/10 text-accent ring-1 ring-accent/20 flex items-center justify-center font-mono font-bold text-xs shrink-0">
              {selectedCompany.symbol.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-ink">
                  {selectedCompany.symbol}
                </span>
                <span className="text-[11px] text-ink-subtle font-mono">
                  {selectedCompany.exchange}
                </span>
                {selectedCompany.industry && (
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-ink-muted ring-1 ring-hairline">
                    {selectedCompany.industry}
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted truncate mt-0.5 font-medium">
                {selectedCompany.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {selectedCompany.price > 0 && (
              <div className="text-right hidden sm:block">
                <p className="font-mono font-semibold text-xs text-ink">
                  ₹{selectedCompany.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
                {selectedCompany.changePct != null && (
                  <p
                    className={cn(
                      "text-[10px] font-mono flex items-center justify-end gap-0.5",
                      selectedCompany.changePct >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {selectedCompany.changePct >= 0 ? (
                      <TrendingUp className="size-2.5" />
                    ) : (
                      <TrendingDown className="size-2.5" />
                    )}
                    {selectedCompany.changePct >= 0 ? "+" : ""}
                    {selectedCompany.changePct.toFixed(2)}%
                  </p>
                )}
              </div>
            )}

            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1 text-xs font-medium text-ink-subtle hover:text-ink hover:bg-secondary rounded-md ring-1 ring-hairline transition-colors"
                title="Change selected company"
              >
                Change
              </button>
            )}
          </div>
        </div>
      ) : (
        /* State B: Search Input Box */
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-subtle pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "w-full pl-9 pr-9 py-2.5 rounded-lg text-sm bg-surface ring-1 placeholder:text-ink-subtle outline-none transition-all",
              error
                ? "ring-negative focus:ring-negative"
                : "ring-hairline focus:ring-hairline-strong focus:bg-surface-raised",
              disabled && "opacity-60 cursor-not-allowed bg-secondary/30",
            )}
          />
          {query && !disabled && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink transition-colors"
              aria-label="Clear query"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* Dropdown Suggestions Menu */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-72 overflow-y-auto rounded-lg ring-1 ring-hairline-strong bg-surface-raised shadow-xl p-1.5 space-y-1 animate-fade-in">
          <div className="px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-subtle flex items-center justify-between border-b border-hairline mb-1">
            <span>{query ? "Matching Companies" : "Popular / Large-Cap Stocks"}</span>
            <span>{filteredCompanies.length} results</span>
          </div>

          {filteredCompanies.length === 0 ? (
            <div className="p-4 text-center text-xs text-ink-muted">
              {isPending ? "Loading universe..." : `No companies found for "${query}"`}
            </div>
          ) : (
            filteredCompanies.map((c, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = value?.toUpperCase() === c.symbol.toUpperCase();

              return (
                <button
                  key={c.symbol}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelect(c)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-md flex items-center justify-between gap-3 text-xs transition-colors",
                    isHighlighted ? "bg-accent/10 text-ink" : "text-ink hover:bg-secondary/60",
                    isSelected && "font-semibold bg-accent/15",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono font-bold text-xs bg-secondary px-1.5 py-0.5 rounded ring-1 ring-hairline text-ink shrink-0">
                      {c.symbol}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate text-ink">{c.name}</p>
                      <p className="text-[11px] text-ink-subtle truncate mt-0.5">
                        {c.industry || c.sector} · {c.exchange}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2">
                    {c.price > 0 && (
                      <span className="font-mono text-ink font-semibold">
                        ₹{c.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                    {isSelected && <Check className="size-3.5 text-accent" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

