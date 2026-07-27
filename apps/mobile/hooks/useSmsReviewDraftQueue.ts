import { useCallback, useEffect, useRef, useState } from "react";

import { cleanupExpiredSmsReviewDrafts } from "@/services/sms-review-draft-cleanup-service";
import { setSmsReviewDraftSelection } from "@/services/sms-review-draft-command-service";
import {
  getSmsReviewDraftQueueSnapshot,
  observeSmsReviewDraftChanges,
  type SmsReviewQueueSnapshot,
} from "@/services/sms-review-draft-repository";
import {
  revalidateSmsReviewDraftReferences,
  type RevalidatedSmsReviewDraftItem,
} from "@/services/sms-review-draft-reference-service";

import { useCurrentUser } from "./useCurrentUser";

export interface UseSmsReviewDraftQueueResult {
  readonly userId: string | null;
  readonly queueId: string | null;
  readonly items: readonly RevalidatedSmsReviewDraftItem[];
  readonly itemCount: number;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
}

async function normalizeHardInvalidSelectionOverrides(
  items: readonly RevalidatedSmsReviewDraftItem[],
  userId: string
): Promise<readonly RevalidatedSmsReviewDraftItem[]> {
  return Promise.all(
    items.map(async (item): Promise<RevalidatedSmsReviewDraftItem> => {
      if (
        item.selectionOverride !== true ||
        item.hardValidationReasons.length === 0
      ) {
        return item;
      }
      await setSmsReviewDraftSelection(item.draftId, userId, false);
      return { ...item, selectionOverride: false };
    })
  );
}

export function useSmsReviewDraftQueue(): UseSmsReviewDraftQueueResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const [snapshot, setSnapshot] = useState<SmsReviewQueueSnapshot | null>(null);
  const [items, setItems] = useState<readonly RevalidatedSmsReviewDraftItem[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeUserIdRef = useRef<string | null>(userId);
  activeUserIdRef.current = userId;

  const refetch = useCallback(async (): Promise<void> => {
    const requestedUserId = userId;
    if (!requestedUserId) {
      if (activeUserIdRef.current !== requestedUserId) return;
      setSnapshot(null);
      setItems([]);
      setIsLoading(false);
      return;
    }
    try {
      const nextSnapshot =
        await getSmsReviewDraftQueueSnapshot(requestedUserId);
      const validated = await revalidateSmsReviewDraftReferences(
        nextSnapshot?.items ?? [],
        requestedUserId
      );
      if (activeUserIdRef.current !== requestedUserId) return;
      const normalized = await normalizeHardInvalidSelectionOverrides(
        validated,
        requestedUserId
      );
      if (activeUserIdRef.current !== requestedUserId) return;
      setSnapshot(nextSnapshot);
      setItems(normalized);
      setError(null);
    } catch (caught) {
      if (activeUserIdRef.current !== requestedUserId) return;
      setSnapshot(null);
      setItems([]);
      setError(
        caught instanceof Error ? caught : new Error("sms_review_failed")
      );
    } finally {
      if (activeUserIdRef.current === requestedUserId) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isResolvingUser) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setSnapshot(null);
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    let unsubscribe: (() => void) | undefined;
    const abortController = new AbortController();
    setIsLoading(true);

    void (async (): Promise<void> => {
      try {
        await cleanupExpiredSmsReviewDrafts({ signal: abortController.signal });
        if (!isActive) return;
        await refetch();
        const observable = await observeSmsReviewDraftChanges(userId);
        if (!isActive) return;
        const subscription = observable.subscribe({
          next: (): void => {
            if (isActive) void refetch();
          },
          error: (caught: unknown): void => {
            if (!isActive) return;
            setError(
              caught instanceof Error ? caught : new Error("sms_review_failed")
            );
            setIsLoading(false);
          },
        });
        unsubscribe = (): void => subscription.unsubscribe();
      } catch (caught) {
        if (!isActive) return;
        setError(
          caught instanceof Error ? caught : new Error("sms_review_failed")
        );
        setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
      abortController.abort();
      unsubscribe?.();
    };
  }, [isResolvingUser, refetch, userId]);

  return {
    userId,
    queueId: snapshot?.queueId ?? null,
    items,
    itemCount: items.length,
    isLoading,
    error,
    refetch,
  };
}
