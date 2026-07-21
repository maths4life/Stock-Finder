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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  useCreateJournalReview,
  useUpdateJournalReview,
} from "@/features/journal/hooks/useJournalReviews";
import type { JournalReview } from "@/shared/api/types";

const formSchema = z.object({
  thesisPlayedOut: z.string().optional(),
  whatActuallyHappened: z.string().optional(),
  mistakes: z.string().optional(),
  lessons: z.string().optional(),
  wouldBuyAgain: z.string().optional(),
  aiComparisonSummary: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function reviewToFormValues(review?: JournalReview): FormValues {
  return {
    thesisPlayedOut: review?.thesisPlayedOut ?? "",
    whatActuallyHappened: review?.whatActuallyHappened ?? "",
    mistakes: review?.mistakes ?? "",
    lessons: review?.lessons ?? "",
    wouldBuyAgain: review?.wouldBuyAgain == null ? "" : review.wouldBuyAgain ? "yes" : "no",
    aiComparisonSummary: review?.aiComparisonSummary ?? "",
  };
}

function toNullableString(v?: string) {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

interface JournalReviewFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Entry this review belongs to. Required to create a new review;
   * ignored (the existing review's entryId is immutable) when editing. */
  entryId: string;
  /** Present when editing an existing review; absent when creating. */
  review?: JournalReview;
}

export function JournalReviewForm({ open, onOpenChange, entryId, review }: JournalReviewFormProps) {
  const createMutation = useCreateJournalReview();
  const updateMutation = useUpdateJournalReview();
  const isEditing = Boolean(review);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: reviewToFormValues(review),
  });

  useEffect(() => {
    if (open) {
      form.reset(reviewToFormValues(review));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, review?.id]);

  function onSubmit(values: FormValues) {
    const content = {
      thesisPlayedOut:
        values.thesisPlayedOut === "yes" ||
        values.thesisPlayedOut === "partially" ||
        values.thesisPlayedOut === "no"
          ? values.thesisPlayedOut
          : null,
      whatActuallyHappened: toNullableString(values.whatActuallyHappened),
      mistakes: toNullableString(values.mistakes),
      lessons: toNullableString(values.lessons),
      wouldBuyAgain:
        values.wouldBuyAgain === "yes" ? true : values.wouldBuyAgain === "no" ? false : null,
      aiComparisonSummary: toNullableString(values.aiComparisonSummary),
    } as const;

    const promise =
      isEditing && review
        ? updateMutation.mutateAsync({ id: review.id, input: content })
        : createMutation.mutateAsync({ entryId, ...content });

    promise.then(() => {
      onOpenChange(false);
      form.reset(reviewToFormValues(undefined));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit review" : "Review this thesis"}</DialogTitle>
          <DialogDescription>
            Look back at what you wrote. Did it play out the way you thought? What would you do
            differently?
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="thesisPlayedOut"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Did the thesis play out?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex gap-6"
                    >
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="yes" />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">Yes</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="partially" />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">Partially</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="no" />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">No</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="whatActuallyHappened"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What actually happened</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="mistakes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mistakes</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lessons"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lessons</FormLabel>
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
              name="wouldBuyAgain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Would you buy again, knowing what you know now?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex gap-6"
                    >
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="yes" />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">Yes</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="no" />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">No</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="aiComparisonSummary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes comparing thesis vs. outcome</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Optional — your own comparison notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : isEditing ? "Save changes" : "Save review"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
