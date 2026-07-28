import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  discardOneSmsReviewDraft,
  undoSmsReviewDraftDiscard,
} from "@/services/sms-review-draft-command-service";
import type { VolatileSmsReviewUndoItem } from "@/services/sms-review-draft-repository";

export interface UseSmsReviewUndoResult {
  readonly undoItem: VolatileSmsReviewUndoItem | null;
  readonly discardedName: string | null;
  readonly discard: (draftId: string, userId: string) => Promise<void>;
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
  const latestDiscardRequestRef = useRef(0);
  const latestSuccessfulDiscardRef = useRef<{
    readonly requestId: number;
    readonly item: VolatileSmsReviewUndoItem;
  } | null>(null);
  const pendingDiscardsRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    if (!undoItem) return;
    const remainingMs = Math.max(0, undoItem.expiresAt - Date.now());
    const timeout = setTimeout(() => {
      setUndoItem(null);
      if (
        latestSuccessfulDiscardRef.current?.item.draftId === undoItem.draftId
      ) {
        latestSuccessfulDiscardRef.current = null;
      }
    }, remainingMs);
    return () => clearTimeout(timeout);
  }, [undoItem]);

  const discard = useCallback(
    (draftId: string, userId: string): Promise<void> => {
      const requestKey = `${userId}:${draftId}`;
      const existingRequest = pendingDiscardsRef.current.get(requestKey);
      if (existingRequest) return existingRequest;

      const requestId = latestDiscardRequestRef.current + 1;
      latestDiscardRequestRef.current = requestId;
      setUndoItem(null);
      const request = discardOneSmsReviewDraft(draftId, userId)
        .then((discarded) => {
          const latestSuccessful = latestSuccessfulDiscardRef.current;
          if (!latestSuccessful || requestId > latestSuccessful.requestId) {
            latestSuccessfulDiscardRef.current = {
              requestId,
              item: discarded,
            };
            setUndoItem(discarded);
          }
        })
        .catch((error: unknown) => {
          if (latestDiscardRequestRef.current === requestId) {
            const previousSuccessful = latestSuccessfulDiscardRef.current?.item;
            setUndoItem(
              previousSuccessful && previousSuccessful.expiresAt > Date.now()
                ? previousSuccessful
                : null
            );
          }
          throw error;
        })
        .finally(() => {
          pendingDiscardsRef.current.delete(requestKey);
        });
      pendingDiscardsRef.current.set(requestKey, request);
      return request;
    },
    []
  );

  const undo = useCallback(async (): Promise<boolean> => {
    if (!undoItem) return false;
    const restored = await undoSmsReviewDraftDiscard(undoItem);
    if (restored) {
      if (
        latestSuccessfulDiscardRef.current?.item.draftId === undoItem.draftId
      ) {
        latestSuccessfulDiscardRef.current = null;
      }
      setUndoItem((current) =>
        current?.draftId === undoItem.draftId ? null : current
      );
    }
    return restored;
  }, [undoItem]);

  const close = useCallback((): void => {
    latestSuccessfulDiscardRef.current = null;
    setUndoItem(null);
  }, []);
  const discardedName = useMemo(() => getDiscardedName(undoItem), [undoItem]);

  return { undoItem, discardedName, discard, undo, close };
}
