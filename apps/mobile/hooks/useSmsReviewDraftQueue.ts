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
import { getTransactionParsedContentIdentity } from "@/services/transaction-review-account-match-cache";

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

function haveSameHardValidationReasons(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): boolean {
  const leftReasons = left ?? [];
  const rightReasons = right ?? [];
  return (
    leftReasons.length === rightReasons.length &&
    leftReasons.every((reason, index) => reason === rightReasons[index])
  );
}

function preserveUnchangedDraftItems(
  previous: readonly RevalidatedSmsReviewDraftItem[],
  next: readonly RevalidatedSmsReviewDraftItem[]
): readonly RevalidatedSmsReviewDraftItem[] {
  const previousById = new Map(previous.map((item) => [item.draftId, item]));
  const stabilized = next.map((item) => {
    const prior = previousById.get(item.draftId);
    if (
      prior?.updatedAt.getTime() === item.updatedAt.getTime() &&
      prior.selectionOverride === item.selectionOverride &&
      prior.position === item.position &&
      haveSameHardValidationReasons(
        prior.hardValidationReasons,
        item.hardValidationReasons
      )
    ) {
      return prior;
    }
    if (
      prior &&
      getTransactionParsedContentIdentity(prior.transaction) ===
        getTransactionParsedContentIdentity(item.transaction)
    ) {
      return { ...item, transaction: prior.transaction };
    }
    return item;
  });
  return stabilized.length === previous.length &&
    stabilized.every((item, index) => item === previous[index])
    ? previous
    : stabilized;
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
  const latestRefetchRequestRef = useRef(0);
  activeUserIdRef.current = userId;

  const refetch = useCallback(async (): Promise<void> => {
    const requestedUserId = userId;
    const requestId = latestRefetchRequestRef.current + 1;
    latestRefetchRequestRef.current = requestId;
    const isCurrentRequest = (): boolean =>
      activeUserIdRef.current === requestedUserId &&
      latestRefetchRequestRef.current === requestId;
    if (!requestedUserId) {
      if (!isCurrentRequest()) return;
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
      if (!isCurrentRequest()) return;
      const normalized = await normalizeHardInvalidSelectionOverrides(
        validated,
        requestedUserId
      );
      if (!isCurrentRequest()) return;
      setSnapshot(nextSnapshot);
      setItems((previous) => preserveUnchangedDraftItems(previous, normalized));
      setError(null);
    } catch (caught) {
      if (!isCurrentRequest()) return;
      setSnapshot(null);
      setItems([]);
      setError(
        caught instanceof Error ? caught : new Error("sms_review_failed")
      );
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
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
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;
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
            if (!isActive) return;
            if (refetchTimer) clearTimeout(refetchTimer);
            refetchTimer = setTimeout(() => {
              refetchTimer = undefined;
              if (isActive) void refetch();
            }, 40);
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
      if (refetchTimer) clearTimeout(refetchTimer);
      unsubscribe?.();
    };
  }, [isResolvingUser, refetch, userId]);

  const visibleSnapshot =
    !isResolvingUser && snapshot?.userId === userId ? snapshot : null;
  const visibleItems = visibleSnapshot ? items : [];

  return {
    userId,
    queueId: visibleSnapshot?.queueId ?? null,
    items: visibleItems,
    itemCount: visibleItems.length,
    isLoading: isResolvingUser || isLoading,
    error,
    refetch,
  };
}
