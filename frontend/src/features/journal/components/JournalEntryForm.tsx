import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { useAllCompanies } from "@/features/company/hooks/useCompanies";
import { useCreateJournalEntry, useUpdateJournalEntry } from "@/features/journal/hooks/useJournalEntries";
import type { JournalEntry } from "@/shared/api/types";

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

function entryToFormValues(entry?: JournalEntry): FormValues {
  return {
    symbol: entry?.symbol ?? "",
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
    horizonMonths: entry?.horizonMonths != null ? String(entry.horizonMonths) : "",
    confidenceLevel: entry?.confidenceLevel != null ? String(entry.confidenceLevel) : "",
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
}

export function JournalEntryForm({ open, onOpenChange, entry }: JournalEntryFormProps) {
  const { data: companies = [] } = useAllCompanies();
  const createMutation = useCreateJournalEntry();
  const updateMutation = useUpdateJournalEntry();
  const isEditing = Boolean(entry);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: entryToFormValues(entry),
  });

  useEffect(() => {
    if (open) {
      form.reset(entryToFormValues(entry));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit thesis" : "Start a new thesis"}</DialogTitle>
          <DialogDescription>
            Write down what you believe, and why. Only the company and thesis are required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isEditing}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a company" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.symbol} value={c.symbol}>
                            {c.name} ({c.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Short headline for this thesis" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="thesis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thesis</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="What do you believe, and why?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fundamentalReasons"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fundamental reasons</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
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
                    <FormLabel>Technical reasons</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
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
                    <FormLabel>Sector reasons</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
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
                    <FormLabel>Macro reasons</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sellTrigger"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What would make you sell?</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="assumptions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assumptions</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
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
                    <FormLabel>Risks accepted</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
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
                  <FormLabel>Personal notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="targetPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target price</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="₹" {...field} />
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
                    <FormLabel>Expected return %</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="horizonMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horizon (months)</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confidenceLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confidence (1-5)</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : isEditing ? "Save changes" : "Save thesis"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
