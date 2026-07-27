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
    item.transaction.merchant ??
    item.transaction.counterparty ??
    item.transaction.originLabel
  );
}

export function useSmsReviewUndo(): UseSmsReviewUndoResult {
  const [undoItem, setUndoItem] = useState<VolatileSmsReviewUndoItem | null>(
    null
  );
  const latestDiscardRequestRef = useRef(0);

  useEffect(() => {
    if (!undoItem) return;
    const remainingMs = Math.max(0, undoItem.expiresAt - Date.now());
    const timeout = setTimeout(() => setUndoItem(null), remainingMs);
    return () => clearTimeout(timeout);
  }, [undoItem]);

  const discard = useCallback(
    async (draftId: string, userId: string): Promise<void> => {
      const requestId = latestDiscardRequestRef.current + 1;
      latestDiscardRequestRef.current = requestId;
      const discarded = await discardOneSmsReviewDraft(draftId, userId);
      if (latestDiscardRequestRef.current === requestId) {
        setUndoItem(discarded);
      }
    },
    []
  );

  const undo = useCallback(async (): Promise<boolean> => {
    if (!undoItem) return false;
    const restored = await undoSmsReviewDraftDiscard(undoItem);
    if (restored) {
      setUndoItem((current) =>
        current?.draftId === undoItem.draftId ? null : current
      );
    }
    return restored;
  }, [undoItem]);

  const close = useCallback((): void => setUndoItem(null), []);
  const discardedName = useMemo(() => getDiscardedName(undoItem), [undoItem]);

  return { undoItem, discardedName, discard, undo, close };
}
