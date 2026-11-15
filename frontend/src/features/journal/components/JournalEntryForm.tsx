import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  TrendingUp,
  Target,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Star,
  Clock,
  Compass,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { CompanySearchSelect } from "@/features/company/components/CompanySearchSelect";
import { useAllCompanies } from "@/features/company/hooks/useCompanies";
import {
  useCreateJournalEntry,
  useUpdateJournalEntry,
} from "@/features/journal/hooks/useJournalEntries";
import type { JournalEntry } from "@/shared/api/types";
import { cn } from "@/shared/utils/utils";

const formSchema = z.object({
  symbol: z.string().min(1, "Pick a company"),
  title: z.string().optional(),
  thesis: z.string().min(1, "Write down what you believe"),
  fundamentalReasons: z.string().optional(),
  technicalReasons: z.string().optional(),
  sectorReasons: z.string().optional(),
  macroReasons: z.string().optional(),
  personalNotes: z.string().optional(),
  sellTrigger: z.string().optional(),
  assumptions: z.string().optional(),
  risksAccepted: z.string().optional(),
  targetPrice: z.string().optional(),
  expectedReturnPct: z.string().optional(),
  horizonMonths: z.string().optional(),
  confidenceLevel: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const HORIZON_SHORTCUTS = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M (1Y)", months: 12 },
  { label: "24M (2Y)", months: 24 },
  { label: "36M (3Y)", months: 36 },
];

function entryToFormValues(entry?: JournalEntry, defaultSymbol?: string): FormValues {
  return {
    symbol: entry?.symbol ?? defaultSymbol ?? "",
    title: entry?.title ?? "",
    thesis: entry?.thesis ?? "",
    fundamentalReasons: entry?.fundamentalReasons ?? "",
    technicalReasons: entry?.technicalReasons ?? "",
    sectorReasons: entry?.sectorReasons ?? "",
    macroReasons: entry?.macroReasons ?? "",
    personalNotes: entry?.personalNotes ?? "",
    sellTrigger: entry?.sellTrigger ?? "",
    assumptions: entry?.assumptions ?? "",
    risksAccepted: entry?.risksAccepted ?? "",
    targetPrice: entry?.targetPrice != null ? String(entry.targetPrice) : "",
    expectedReturnPct: entry?.expectedReturnPct != null ? String(entry.expectedReturnPct) : "",
    horizonMonths: entry?.horizonMonths != null ? String(entry.horizonMonths) : "12",
    confidenceLevel: entry?.confidenceLevel != null ? String(entry.confidenceLevel) : "3",
  };
}

function toNullableString(v?: string) {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

function toNullableNumber(v?: string) {
  const trimmed = v?.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toNullableInt(v?: string) {
  const trimmed = v?.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

interface JournalEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing entry; absent when creating. */
  entry?: JournalEntry;
  /** When creating (no `entry`), pre-selects this symbol — used by the
   * "Write Thesis" CTA on the company research page. */
  defaultSymbol?: string;
}

export function JournalEntryForm({
  open,
  onOpenChange,
  entry,
  defaultSymbol,
}: JournalEntryFormProps) {
  const { data: companies = [] } = useAllCompanies();
  const createMutation = useCreateJournalEntry();
  const updateMutation = useUpdateJournalEntry();
  const isEditing = Boolean(entry);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const [showPillars, setShowPillars] = useState(
    Boolean(
      entry?.fundamentalReasons ||
        entry?.technicalReasons ||
        entry?.sectorReasons ||
        entry?.macroReasons,
    ),
  );
  const [showPreMortem, setShowPreMortem] = useState(
    Boolean(
      entry?.sellTrigger ||
        entry?.assumptions ||
        entry?.risksAccepted ||
        entry?.personalNotes,
    ),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: entryToFormValues(entry, defaultSymbol),
  });

  const currentSymbol = form.watch("symbol");
  const targetPriceValue = form.watch("targetPrice");

  // Lookup the selected company
  const selectedCompany = useMemo(() => {
    if (!currentSymbol) return null;
    return companies.find((c) => c.symbol.toUpperCase() === currentSymbol.toUpperCase()) || null;
  }, [currentSymbol, companies]);

  // Implied upside calculation
  const impliedReturn = useMemo(() => {
    if (!selectedCompany?.price || !targetPriceValue) return null;
    const target = Number(targetPriceValue);
    if (!Number.isFinite(target) || target <= 0) return null;
    const upside = ((target - selectedCompany.price) / selectedCompany.price) * 100;
    return Number(upside.toFixed(1));
  }, [selectedCompany?.price, targetPriceValue]);

  useEffect(() => {
    if (open) {
      form.reset(entryToFormValues(entry, defaultSymbol));
      setShowPillars(
        Boolean(
          entry?.fundamentalReasons ||
            entry?.technicalReasons ||
            entry?.sectorReasons ||
            entry?.macroReasons,
        ),
      );
      setShowPreMortem(
        Boolean(
          entry?.sellTrigger ||
            entry?.assumptions ||
            entry?.risksAccepted ||
            entry?.personalNotes,
        ),
      );
    }
  }, [open, entry, defaultSymbol, form]);

  function onSubmit(values: FormValues) {
    const input = {
      symbol: values.symbol,
      title: toNullableString(values.title),
      thesis: values.thesis,
      fundamentalReasons: toNullableString(values.fundamentalReasons),
      technicalReasons: toNullableString(values.technicalReasons),
      sectorReasons: toNullableString(values.sectorReasons),
      macroReasons: toNullableString(values.macroReasons),
      personalNotes: toNullableString(values.personalNotes),
      sellTrigger: toNullableString(values.sellTrigger),
      assumptions: toNullableString(values.assumptions),
      risksAccepted: toNullableString(values.risksAccepted),
      targetPrice: toNullableNumber(values.targetPrice),
      expectedReturnPct: toNullableNumber(values.expectedReturnPct),
      entryPrice: isEditing ? (entry?.entryPrice ?? null) : (selectedCompany?.price || null),
      horizonMonths: toNullableInt(values.horizonMonths),
      confidenceLevel: toNullableInt(values.confidenceLevel),
    };

    const promise =
      isEditing && entry
        ? updateMutation.mutateAsync({ id: entry.id, input })
        : createMutation.mutateAsync(input);

    promise.then(() => {
      onOpenChange(false);
      form.reset(entryToFormValues(undefined));
    });
  }

  function applyImpliedReturn() {
    if (impliedReturn != null) {
      form.setValue("expectedReturnPct", String(impliedReturn), { shouldValidate: true });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl p-0 gap-0 border-hairline bg-surface">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-hairline bg-surface-raised/40">
          <DialogHeader>
            <div className="flex items-center gap-2 text-accent text-xs font-mono font-medium uppercase tracking-wider mb-1">
              <Compass className="size-3.5" />
              <span>Investment Thesis Journal</span>
            </div>
            <DialogTitle className="text-xl font-bold text-ink">
              {isEditing ? "Edit Investment Thesis" : "Document New Thesis"}
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Record your hypothesis, target valuation, and exit conditions.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* 1. COMPANY SELECTOR */}
            <FormField
              control={form.control}
              name="symbol"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-ink">
                    Company / Stock *
                  </FormLabel>
                  <FormControl>
                    <CompanySearchSelect
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isEditing}
                      error={fieldState.error?.message}
                      placeholder="Type symbol or company name..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 2. HEADLINE TITLE */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-ink">
                    Thesis Headline <span className="text-ink-subtle font-normal">(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder=""
                      className="bg-surface ring-1 ring-hairline text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 3. CORE THESIS */}
            <FormField
              control={form.control}
              name="thesis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-ink">
                    Core Thesis *
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder=""
                      className="bg-surface ring-1 ring-hairline text-sm leading-relaxed"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 4. CONVICTION & HORIZON BAR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 rounded-xl ring-1 ring-hairline bg-surface-raised/40">
              {/* Conviction Level */}
              <FormField
                control={form.control}
                name="confidenceLevel"
                render={({ field }) => {
                  const currentLevel = Number(field.value) || 3;
                  return (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-ink flex items-center justify-between">
                        <span>Conviction Level</span>
                        <span className="text-accent font-mono text-[11px]">
                          {currentLevel}/5
                        </span>
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-1.5 pt-1">
                          {[1, 2, 3, 4, 5].map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              onClick={() => field.onChange(String(lvl))}
                              className={cn(
                                "flex-1 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1 ring-1",
                                currentLevel >= lvl
                                  ? "bg-accent text-white ring-accent shadow-sm"
                                  : "bg-surface text-ink-subtle ring-hairline hover:text-ink",
                              )}
                            >
                              <Star className="size-3 fill-current" />
                              <span>{lvl}</span>
                            </button>
                          ))}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Investment Horizon */}
              <FormField
                control={form.control}
                name="horizonMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-ink flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-ink-subtle" /> Horizon
                      </span>
                      <span className="text-ink-subtle font-mono text-[11px]">
                        {field.value ? `${field.value} Months` : "Flexible"}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-1.5 pt-1">
                        {HORIZON_SHORTCUTS.map((item) => (
                          <button
                            key={item.months}
                            type="button"
                            onClick={() => field.onChange(String(item.months))}
                            className={cn(
                              "flex-1 py-1.5 rounded-md text-[11px] font-mono font-medium transition-all ring-1",
                              field.value === String(item.months)
                                ? "bg-accent text-white ring-accent"
                                : "bg-surface text-ink-muted ring-hairline hover:text-ink",
                            )}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 5. VALUATION & TARGETS */}
            <div className="p-4 rounded-xl ring-1 ring-hairline bg-surface-raised/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Target className="size-3.5 text-accent" /> Valuation Targets
                </span>
                {selectedCompany?.price ? (
                  <span className="text-[11px] font-mono text-ink-subtle">
                    CMP:{" "}
                    <strong className="text-ink">
                      ₹{selectedCompany.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </strong>
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="targetPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-ink-muted">Target Price (₹)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder=""
                          className="bg-surface ring-1 ring-hairline text-sm font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expectedReturnPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-ink-muted">Expected Return (%)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder=""
                          className="bg-surface ring-1 ring-hairline text-sm font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Implied Return Helper */}
              {impliedReturn != null && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-accent/10 border border-accent/20 text-xs text-ink">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="size-3.5 text-accent" />
                    Target implies{" "}
                    <strong className="text-accent font-mono font-bold">
                      {impliedReturn >= 0 ? `+${impliedReturn}%` : `${impliedReturn}%`}
                    </strong>{" "}
                    upside from CMP
                  </span>
                  <button
                    type="button"
                    onClick={applyImpliedReturn}
                    className="text-[11px] font-medium text-accent hover:underline underline-offset-2"
                  >
                    Sync to Expected Return →
                  </button>
                </div>
              )}
            </div>

            {/* 6. PILLARS (FUNDAMENTAL, TECHNICAL, SECTOR, MACRO) */}
            <div className="border border-hairline rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPillars((prev) => !prev)}
                className="w-full p-3.5 flex items-center justify-between text-left bg-surface-raised/60 hover:bg-surface-raised transition-colors text-xs font-semibold text-ink"
              >
                <span>Analysis Pillars (Fundamental, Technical, Sector, Macro)</span>
                {showPillars ? (
                  <ChevronUp className="size-4 text-ink-subtle" />
                ) : (
                  <ChevronDown className="size-4 text-ink-subtle" />
                )}
              </button>

              {showPillars && (
                <div className="p-4 space-y-4 bg-surface border-t border-hairline animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="fundamentalReasons"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-ink-muted">Fundamental Reasons</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder=""
                              className="bg-surface ring-1 ring-hairline text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="technicalReasons"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-ink-muted">Technical Reasons</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder=""
                              className="bg-surface ring-1 ring-hairline text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sectorReasons"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-ink-muted">Sector Reasons</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder=""
                              className="bg-surface ring-1 ring-hairline text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="macroReasons"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-ink-muted">Macro Reasons</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder=""
                              className="bg-surface ring-1 ring-hairline text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 7. PRE-MORTEM & SELL RULES */}
            <div className="border border-hairline rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPreMortem((prev) => !prev)}
                className="w-full p-3.5 flex items-center justify-between text-left bg-surface-raised/60 hover:bg-surface-raised transition-colors text-xs font-semibold text-ink"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5 text-accent" />
                  Pre-Mortem & Sell Triggers
                </span>
                {showPreMortem ? (
                  <ChevronUp className="size-4 text-ink-subtle" />
                ) : (
                  <ChevronDown className="size-4 text-ink-subtle" />
                )}
              </button>

              {showPreMortem && (
                <div className="p-4 space-y-4 bg-surface border-t border-hairline animate-fade-in">
                  <FormField
                    control={form.control}
                    name="sellTrigger"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-ink">
                          What would make you sell?
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder=""
                            className="bg-surface ring-1 ring-hairline text-xs"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="assumptions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-ink-muted">Key Assumptions</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder=""
                              className="bg-surface ring-1 ring-hairline text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="risksAccepted"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-ink-muted">Risks Accepted</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder=""
                              className="bg-surface ring-1 ring-hairline text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="personalNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-ink-muted">Personal Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder=""
                            className="bg-surface ring-1 ring-hairline text-xs"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <DialogFooter className="pt-2 border-t border-hairline flex items-center justify-between gap-3 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="text-xs font-semibold px-6">
                {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Save Thesis"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
