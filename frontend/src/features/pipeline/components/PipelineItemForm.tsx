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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { useAllCompanies } from "@/features/company/hooks/useCompanies";
import { useCreatePipelineItem, useUpdatePipelineItem } from "@/features/pipeline/hooks/usePipelineItems";
import type { PipelineItem, PipelineStage } from "@/shared/api/types";

// Fixed to the three stages already used by pipeline_items.stage — see
// CURRENT_MILESTONE.md. Not introducing new stages in this milestone.
const STAGES: PipelineStage[] = ["Watching", "Researching", "Conviction"];

const formSchema = z.object({
  symbol: z.string().min(1, "Pick a company"),
  stage: z.enum(["Watching", "Researching", "Conviction"]),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function toFormValues(item?: PipelineItem, defaultStage?: PipelineStage): FormValues {
  return {
    symbol: item?.symbol ?? "",
    stage: defaultStage ?? "Watching",
    note: item?.note ?? "",
  };
}

function toNullableString(v?: string) {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

interface PipelineItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing item; absent when creating. */
  item?: PipelineItem;
  /** id of the item being edited — the grouped GET /pipeline response
   * doesn't nest stage inside PipelineItem, so the caller passes it
   * alongside the item along with which column it lives in. */
  itemId?: string;
  /** Column the item currently lives in (edit) or should be created into
   * (create, e.g. from a column's "+ Add company" button). */
  stage?: PipelineStage;
}

export function PipelineItemForm({ open, onOpenChange, item, itemId, stage }: PipelineItemFormProps) {
  const { data: companies = [] } = useAllCompanies();
  const createMutation = useCreatePipelineItem();
  const updateMutation = useUpdatePipelineItem();
  const isEditing = Boolean(item && itemId);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(item, stage),
  });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(item, stage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.symbol, stage]);

  function onSubmit(values: FormValues) {
    const input = {
      symbol: values.symbol,
      stage: values.stage,
      note: toNullableString(values.note),
    };

    const promise =
      isEditing && itemId
        ? updateMutation.mutateAsync({ id: itemId, input })
        : createMutation.mutateAsync(input);

    promise.then(() => {
      onOpenChange(false);
      form.reset(toFormValues(undefined, "Watching"));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit pipeline item" : "Add to pipeline"}</DialogTitle>
          <DialogDescription>
            Track a company through your research workflow — watch it, build a thesis, or mark it high conviction.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
              name="stage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stage</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
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
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Why is this here?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isEditing ? "Save changes" : "Add to pipeline"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
