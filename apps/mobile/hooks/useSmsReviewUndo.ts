import { useCallback, useMemo, useRef, useState } from "react";

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
  const pendingUndoRef = useRef<Promise<boolean> | null>(null);

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
            setUndoItem(previousSuccessful ?? null);
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

  const undo = useCallback((): Promise<boolean> => {
    if (pendingUndoRef.current) return pendingUndoRef.current;
    if (!undoItem) return Promise.resolve(false);

    const itemToRestore = undoItem;
    const request = undoSmsReviewDraftDiscard(itemToRestore)
      .then((restored) => {
        if (restored) {
          if (
            latestSuccessfulDiscardRef.current?.item.draftId ===
            itemToRestore.draftId
          ) {
            latestSuccessfulDiscardRef.current = null;
          }
          setUndoItem((current) =>
            current?.draftId === itemToRestore.draftId ? null : current
          );
        }
        return restored;
      })
      .finally(() => {
        if (pendingUndoRef.current === request) pendingUndoRef.current = null;
      });
    pendingUndoRef.current = request;
    return request;
  }, [undoItem]);

  const close = useCallback((): void => {
    latestSuccessfulDiscardRef.current = null;
    setUndoItem(null);
  }, []);
  const discardedName = useMemo(() => getDiscardedName(undoItem), [undoItem]);

  return { undoItem, discardedName, discard, undo, close };
}
