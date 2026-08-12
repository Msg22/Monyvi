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
  const activeUndoRequestIdRef = useRef<number | null>(null);
  const discardSequenceRef = useRef(0);
  const latestSuccessfulDiscardRef = useRef<{
    readonly requestId: number;
    readonly item: VolatileSmsReviewUndoItem;
  } | null>(null);
  const pendingDiscardsRef = useRef(
    new Map<
      string,
      {
        readonly requestId: number;
        readonly promise: Promise<VolatileSmsReviewUndoItem>;
      }
    >()
  );
  const pendingDiscardsByRequestIdRef = useRef(
    new Map<number, Promise<VolatileSmsReviewUndoItem>>()
  );
  const discardedItemsRef = useRef(
    new Map<number, VolatileSmsReviewUndoItem>()
  );
  const suppressedRequestIdsRef = useRef(new Set<number>());
  const pendingUndoRequestsRef = useRef(new Map<number, Promise<boolean>>());

  const publishUndoItem = useCallback(
    (
      item: VolatileSmsReviewUndoItem | null,
      requestId: number | null
    ): void => {
      undoItemRef.current = item;
      activeUndoRequestIdRef.current = requestId;
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
      if (
        existingRequest &&
        !pendingUndoRequestsRef.current.has(existingRequest.requestId)
      ) {
        return existingRequest.promise.then(() => undefined);
      }

      const requestId = discardSequenceRef.current + 1;
      discardSequenceRef.current = requestId;
      const previousSuccessful = latestSuccessfulDiscardRef.current;
      publishUndoItem(optimisticItem ?? null, requestId);

      const request = discardOneSmsReviewDraft(
        draftId,
        userId,
        optimisticItem?.smsFingerprint
      )
        .then((discarded) => {
          const resolvedItem = optimisticItem
            ? {
                ...discarded,
                selectionOverride: optimisticItem.selectionOverride,
              }
            : discarded;
          discardedItemsRef.current.set(requestId, resolvedItem);
          const isSuppressed = suppressedRequestIdsRef.current.has(requestId);
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
            !isSuppressed &&
            (activeUndoRequestIdRef.current === requestId ||
              (activeUndoRequestIdRef.current === null &&
                latestSuccessfulDiscardRef.current?.requestId === requestId))
          ) {
            publishUndoItem(resolvedItem, requestId);
          }
          return resolvedItem;
        })
        .catch((error: unknown) => {
          if (activeUndoRequestIdRef.current === requestId) {
            publishUndoItem(
              previousSuccessful?.item ?? null,
              previousSuccessful?.requestId ?? null
            );
          }
          throw error;
        })
        .finally(() => {
          if (
            pendingDiscardsRef.current.get(requestKey)?.requestId === requestId
          ) {
            pendingDiscardsRef.current.delete(requestKey);
          }
          pendingDiscardsByRequestIdRef.current.delete(requestId);
        });
      pendingDiscardsRef.current.set(requestKey, {
        requestId,
        promise: request,
      });
      pendingDiscardsByRequestIdRef.current.set(requestId, request);
      return request.then(() => undefined);
    },
    [publishUndoItem]
  );

  const undo = useCallback((): Promise<boolean> => {
    const itemToRestore = undoItemRef.current;
    const targetRequestId = activeUndoRequestIdRef.current;
    if (!itemToRestore || targetRequestId === null)
      return Promise.resolve(false);
    const existingUndo = pendingUndoRequestsRef.current.get(targetRequestId);
    if (existingUndo) return existingUndo;

    suppressedRequestIdsRef.current.add(targetRequestId);
    publishUndoItem(null, null);

    const request = (async (): Promise<boolean> => {
      let persistedItem = itemToRestore;
      const pendingDiscard =
        pendingDiscardsByRequestIdRef.current.get(targetRequestId);
      if (pendingDiscard) {
        try {
          persistedItem = await pendingDiscard;
        } catch {
          suppressedRequestIdsRef.current.delete(targetRequestId);
          discardedItemsRef.current.delete(targetRequestId);
          return true;
        }
      } else {
        persistedItem =
          discardedItemsRef.current.get(targetRequestId) ?? itemToRestore;
      }

      try {
        const restored = await undoSmsReviewDraftDiscard(persistedItem);
        if (restored) {
          discardedItemsRef.current.delete(targetRequestId);
          if (
            latestSuccessfulDiscardRef.current?.requestId === targetRequestId
          ) {
            latestSuccessfulDiscardRef.current = null;
          }
          return true;
        }

        suppressedRequestIdsRef.current.delete(targetRequestId);
        if (activeUndoRequestIdRef.current === null) {
          publishUndoItem(persistedItem, targetRequestId);
        }
        return false;
      } catch (error: unknown) {
        suppressedRequestIdsRef.current.delete(targetRequestId);
        if (activeUndoRequestIdRef.current === null) {
          publishUndoItem(persistedItem, targetRequestId);
        }
        throw error;
      }
    })().finally(() => {
      pendingUndoRequestsRef.current.delete(targetRequestId);
    });
    pendingUndoRequestsRef.current.set(targetRequestId, request);
    return request;
  }, [publishUndoItem]);

  const close = useCallback((): void => {
    const currentRequestId = activeUndoRequestIdRef.current;
    if (currentRequestId !== null) {
      suppressedRequestIdsRef.current.add(currentRequestId);
      if (latestSuccessfulDiscardRef.current?.requestId === currentRequestId) {
        latestSuccessfulDiscardRef.current = null;
      }
    }
    publishUndoItem(null, null);
  }, [publishUndoItem]);
  const discardedName = useMemo(() => getDiscardedName(undoItem), [undoItem]);

  return { undoItem, discardedName, discard, undo, close };
}
