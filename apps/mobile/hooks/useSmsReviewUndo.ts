import { useCallback, useMemo, useRef, useState } from "react";

import {
  discardOneSmsReviewDraft,
  undoSmsReviewDraftDiscard,
} from "@/services/sms-review-draft-command-service";
import type { VolatileSmsReviewUndoItem } from "@/services/sms-review-draft-repository";

export interface UseSmsReviewUndoResult {
  readonly undoItem: VolatileSmsReviewUndoItem | null;
  readonly discardedName: string | null;
  readonly discard: (
    draftId: string,
    userId: string,
    optimisticItem?: VolatileSmsReviewUndoItem
  ) => Promise<void>;
  readonly undo: () => Promise<boolean>;
  readonly close: () => void;
}

function getDiscardedName(
  item: VolatileSmsReviewUndoItem | null
): string | null {
  if (!item) return null;
  return (
    [
      item.transaction.merchant,
      item.transaction.counterparty,
      item.transaction.originLabel,
    ]
      .map((name) => name?.trim())
      .find((name): name is string => Boolean(name)) ?? null
  );
}

export function useSmsReviewUndo(): UseSmsReviewUndoResult {
  const [undoItem, setUndoItem] = useState<VolatileSmsReviewUndoItem | null>(
    null
  );
  const undoItemRef = useRef<VolatileSmsReviewUndoItem | null>(null);
  const discardSequenceRef = useRef(0);
  const activeDiscardRequestRef = useRef(0);
  const latestSuccessfulDiscardRef = useRef<{
    readonly requestId: number;
    readonly item: VolatileSmsReviewUndoItem;
  } | null>(null);
  const pendingDiscardsRef = useRef(
    new Map<string, Promise<VolatileSmsReviewUndoItem>>()
  );
  const pendingDiscardRequestIdsRef = useRef(new Map<string, number>());
  const discardedItemsRef = useRef(
    new Map<
      string,
      { readonly requestId: number; readonly item: VolatileSmsReviewUndoItem }
    >()
  );
  const suppressedDraftIdsRef = useRef(new Set<string>());
  const pendingUndoRef = useRef<Promise<boolean> | null>(null);

  const publishUndoItem = useCallback(
    (item: VolatileSmsReviewUndoItem | null): void => {
      undoItemRef.current = item;
      setUndoItem(item);
    },
    []
  );

  const discard = useCallback(
    (
      draftId: string,
      userId: string,
      optimisticItem?: VolatileSmsReviewUndoItem
    ): Promise<void> => {
      const requestKey = `${userId}:${draftId}`;
      const existingRequest = pendingDiscardsRef.current.get(requestKey);
      if (existingRequest) return existingRequest.then(() => undefined);

      const requestId = discardSequenceRef.current + 1;
      discardSequenceRef.current = requestId;
      activeDiscardRequestRef.current = requestId;
      suppressedDraftIdsRef.current.delete(draftId);
      publishUndoItem(optimisticItem ?? null);

      const request = discardOneSmsReviewDraft(draftId, userId)
        .then((discarded) => {
          const resolvedItem = optimisticItem
            ? {
                ...discarded,
                selectionOverride: optimisticItem.selectionOverride,
              }
            : discarded;
          discardedItemsRef.current.set(draftId, {
            requestId,
            item: resolvedItem,
          });
          const isSuppressed = suppressedDraftIdsRef.current.has(draftId);
          const latestSuccessful = latestSuccessfulDiscardRef.current;
          if (
            !isSuppressed &&
            (!latestSuccessful || requestId > latestSuccessful.requestId)
          ) {
            latestSuccessfulDiscardRef.current = {
              requestId,
              item: resolvedItem,
            };
          }
          if (
            activeDiscardRequestRef.current === requestId &&
            !isSuppressed
          ) {
            publishUndoItem(resolvedItem);
          }
          return resolvedItem;
        })
        .catch((error: unknown) => {
          if (activeDiscardRequestRef.current === requestId) {
            const fallbackRequestId = Math.max(
              latestSuccessfulDiscardRef.current?.requestId ?? 0,
              ...[...pendingDiscardRequestIdsRef.current.entries()]
                .filter(([key]) => key !== requestKey)
                .map(([, pendingRequestId]) => pendingRequestId)
            );
            activeDiscardRequestRef.current = fallbackRequestId;
            if (!suppressedDraftIdsRef.current.has(draftId)) {
              const previousSuccessful = latestSuccessfulDiscardRef.current;
              publishUndoItem(
                previousSuccessful?.requestId === fallbackRequestId
                  ? previousSuccessful.item
                  : null
              );
            }
          }
          throw error;
        })
        .finally(() => {
          pendingDiscardsRef.current.delete(requestKey);
          pendingDiscardRequestIdsRef.current.delete(requestKey);
        });
      pendingDiscardsRef.current.set(requestKey, request);
      pendingDiscardRequestIdsRef.current.set(requestKey, requestId);
      return request.then(() => undefined);
    },
    [publishUndoItem]
  );

  const undo = useCallback((): Promise<boolean> => {
    if (pendingUndoRef.current) return pendingUndoRef.current;
    const itemToRestore = undoItemRef.current;
    if (!itemToRestore) return Promise.resolve(false);

    const requestKey = `${itemToRestore.userId}:${itemToRestore.draftId}`;
    const targetRequestId =
      pendingDiscardRequestIdsRef.current.get(requestKey) ??
      discardedItemsRef.current.get(itemToRestore.draftId)?.requestId ??
      activeDiscardRequestRef.current;
    suppressedDraftIdsRef.current.add(itemToRestore.draftId);
    publishUndoItem(null);

    const request = (async (): Promise<boolean> => {
      let persistedItem = itemToRestore;
      const pendingDiscard = pendingDiscardsRef.current.get(requestKey);
      if (pendingDiscard) {
        try {
          persistedItem = await pendingDiscard;
        } catch {
          suppressedDraftIdsRef.current.delete(itemToRestore.draftId);
          discardedItemsRef.current.delete(itemToRestore.draftId);
          return true;
        }
      } else {
        persistedItem =
          discardedItemsRef.current.get(itemToRestore.draftId)?.item ??
          itemToRestore;
      }

      try {
        const restored = await undoSmsReviewDraftDiscard(persistedItem);
        if (restored) {
          discardedItemsRef.current.delete(itemToRestore.draftId);
          if (
            latestSuccessfulDiscardRef.current?.item.draftId ===
            itemToRestore.draftId
          ) {
            latestSuccessfulDiscardRef.current = null;
          }
          return true;
        }

        suppressedDraftIdsRef.current.delete(itemToRestore.draftId);
        if (
          activeDiscardRequestRef.current === targetRequestId &&
          undoItemRef.current === null
        ) {
          publishUndoItem(persistedItem);
        }
        return false;
      } catch (error: unknown) {
        suppressedDraftIdsRef.current.delete(itemToRestore.draftId);
        if (
          activeDiscardRequestRef.current === targetRequestId &&
          undoItemRef.current === null
        ) {
          publishUndoItem(persistedItem);
        }
        throw error;
      }
    })().finally(() => {
      if (pendingUndoRef.current === request) pendingUndoRef.current = null;
    });
    pendingUndoRef.current = request;
    return request;
  }, [publishUndoItem]);

  const close = useCallback((): void => {
    const currentItem = undoItemRef.current;
    if (currentItem) suppressedDraftIdsRef.current.add(currentItem.draftId);
    latestSuccessfulDiscardRef.current = null;
    publishUndoItem(null);
  }, [publishUndoItem]);
  const discardedName = useMemo(() => getDiscardedName(undoItem), [undoItem]);

  return { undoItem, discardedName, discard, undo, close };
}
