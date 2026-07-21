import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createPipelineItem,
  deletePipelineItem,
  movePipelineItemStage,
  updatePipelineItem,
} from "@/features/pipeline/api/pipeline";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { PipelineColumn, PipelineItemInput, PipelineStage } from "@/shared/api/types";

/**
 * Mutations for the new per-item pipeline endpoints (Milestone 3). The
 * `/ideas` page reads via the existing grouped `usePipeline()` hook
 * (`features/market/hooks/useDiscover.ts`, backed by `GET /pipeline`,
 * unchanged) — every mutation here invalidates that query key too, so
 * the board reflects writes without a manual refetch.
 */

export function useCreatePipelineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PipelineItemInput) => createPipelineItem(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipeline });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineItems });
      toast.success("Added to your pipeline.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't add that company. Try again.");
    },
  });
}

export function useUpdatePipelineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PipelineItemInput }) => updatePipelineItem(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipeline });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineItems });
      toast.success("Pipeline item updated.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update that item. Try again.");
    },
  });
}

/** Moves a card to a new column. Optimistic: since the grouped
 * `GET /pipeline` cache is columns-of-items, moving a card means pulling
 * it out of its old column and pushing it into the new one client-side,
 * purely for instant visual feedback — the server result (via onSettled's
 * invalidation) is always the source of truth actually persisted. */
export function useMovePipelineItemStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) => movePipelineItemStage(id, stage),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.pipeline });
      const previous = queryClient.getQueryData<PipelineColumn[]>(queryKeys.pipeline);

      if (previous) {
        let moving: PipelineColumn["items"][number] | undefined;
        const withoutItem = previous.map((col) => {
          const found = col.items.find((item) => item.id === id);
          if (found) moving = found;
          return { ...col, items: col.items.filter((item) => item.id !== id) };
        });

        const next = moving
          ? withoutItem.map((col) =>
              col.stage === stage ? { ...col, items: [{ ...moving! }, ...col.items] } : col
            )
          : withoutItem;

        queryClient.setQueryData(queryKeys.pipeline, next);
      }

      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.pipeline, context.previous);
      }
      toast.error(error.message || "Couldn't move that item. Try again.");
    },
    onSuccess: () => {
      toast.success("Moved.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipeline });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineItems });
    },
  });
}

export function useDeletePipelineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePipelineItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipeline });
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelineItems });
      toast.success("Removed from your pipeline.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't remove that item. Try again.");
    },
  });
}
