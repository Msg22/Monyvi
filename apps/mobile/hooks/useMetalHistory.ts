import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMarketRates } from "@/hooks/useMarketRates";
import {
  METAL_HISTORY_PAGE_SIZE,
  observeMetalHistoryEvents,
  observeMetalHistoryHoldingStates,
  readMetalHistoryReadModel,
  type MetalHistoryFilter,
  type MetalHistoryReadModel,
} from "@/services/metal-history-read-model-service";
import { observeMetalHistoryActionEvidence } from "@/services/metal-action-evidence-observer-service";
import type { MetalHoldingState } from "@monyvi/db";

interface UseMetalHistoryResult {
  readonly error: Error | null;
  readonly filter: MetalHistoryFilter;
  readonly history: MetalHistoryReadModel;
  readonly isLoading: boolean;
  readonly isOffline: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
  readonly setFilter: (filter: MetalHistoryFilter) => void;
}

interface HistoryModelState {
  readonly history: MetalHistoryReadModel;
  readonly userId: string | null;
}

const HISTORY_STATE_OBSERVED_COLUMNS = [
  "status",
  "effective_action_id",
  "effective_event_id",
  "is_visible",
  "reconciliation_state",
] as const;

const EMPTY_COUNTS = Object.freeze({ all: 0, sold: 0, disposed: 0 });
const EMPTY_HISTORY: MetalHistoryReadModel = Object.freeze({
  counts: EMPTY_COUNTS,
  filter: "all",
  hasMore: false,
  items: Object.freeze([]),
});

function emptyHistory(filter: MetalHistoryFilter): MetalHistoryReadModel {
  return { counts: EMPTY_COUNTS, filter, hasMore: false, items: [] };
}

export function useMetalHistory(): UseMetalHistoryResult {
  const isFocused = useIsFocused();
  const { userId, isResolvingUser } = useCurrentUser();
  const { isConnected } = useMarketRates();
  const [filter, setFilter] = useState<MetalHistoryFilter>("all");
  const [historyState, setHistoryState] = useState<HistoryModelState>({
    history: EMPTY_HISTORY,
    userId: null,
  });
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [localRevision, setLocalRevision] = useState(0);
  const [pageSize, setPageSize] = useState(METAL_HISTORY_PAGE_SIZE);
  const [observedStates, setObservedStates] = useState<
    readonly MetalHoldingState[]
  >([]);
  const [observedStatesUserId, setObservedStatesUserId] = useState<string | null>(
    null
  );
  const lastLoadedRef = useRef<{
    filter: MetalHistoryFilter;
    hasLoaded: boolean;
    userId: string | null;
  }>({ filter: "all", hasLoaded: false, userId: null });
  const retry = useCallback(
    (): void => setRetryIndex((value) => value + 1),
    []
  );
  const loadMore = useCallback((): void => {
    setPageSize((value) => value + METAL_HISTORY_PAGE_SIZE);
  }, []);
  const changeFilter = useCallback((nextFilter: MetalHistoryFilter): void => {
    setFilter(nextFilter);
    setPageSize(METAL_HISTORY_PAGE_SIZE);
  }, []);

  useEffect(() => {
    if (!isFocused || isResolvingUser || userId === null) {
      setObservedStates([]);
      setObservedStatesUserId(null);
      return;
    }
    setObservedStates([]);
    setObservedStatesUserId(null);
    const currentUserId = userId;
    const subscription = observeMetalHistoryHoldingStates(currentUserId, "all")
      .observeWithColumns([...HISTORY_STATE_OBSERVED_COLUMNS])
      .subscribe({
        next: (states): void => {
          setObservedStates(states);
          setObservedStatesUserId(currentUserId);
          setLocalRevision((value) => value + 1);
        },
        error: (reason: unknown): void => {
          setObservedStates([]);
          setObservedStatesUserId(null);
          setError(
            reason instanceof Error ? reason : new Error("History unavailable")
          );
        },
      });
    return () => subscription.unsubscribe();
  }, [isFocused, isResolvingUser, retryIndex, userId]);

  useEffect(() => {
    if (
      !isFocused ||
      isResolvingUser ||
      userId === null ||
      observedStatesUserId !== userId
    ) {
      return;
    }
    const observerInput = {
      holdings: observedStates.map((state) => ({
        id: state.holdingId,
        userId: state.userId,
      })),
      userId,
    };
    const eventsQuery = observeMetalHistoryEvents(observerInput);
    const evidenceQuery = observeMetalHistoryActionEvidence(observerInput);
    const onObserverError = (reason: unknown): void => {
      setError(
        reason instanceof Error ? reason : new Error("History unavailable")
      );
    };
    const eventsSubscription = eventsQuery?.observe().subscribe({
      next: (): void => setLocalRevision((value) => value + 1),
      error: onObserverError,
    });
    const evidenceSubscription = evidenceQuery?.observe().subscribe({
      next: (): void => setLocalRevision((value) => value + 1),
      error: onObserverError,
    });
    return () => {
      eventsSubscription?.unsubscribe();
      evidenceSubscription?.unsubscribe();
    };
  }, [
    isFocused,
    isResolvingUser,
    observedStates,
    observedStatesUserId,
    retryIndex,
    userId,
  ]);

  useEffect(() => {
    let isCurrent = true;
    if (isResolvingUser) {
      setHistoryState({ history: emptyHistory(filter), userId: null });
      setError(null);
      setIsLoading(isFocused);
      return () => {
        isCurrent = false;
      };
    }
    if (!isFocused) {
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    if (userId === null) {
      setHistoryState({ history: emptyHistory(filter), userId: null });
      setError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    const isSameVisitWithData =
      lastLoadedRef.current.userId === userId &&
      lastLoadedRef.current.filter === filter &&
      lastLoadedRef.current.hasLoaded;
    if (!isSameVisitWithData) {
      setHistoryState({ history: emptyHistory(filter), userId });
      setIsLoading(true);
    }
    setError(null);
    void readMetalHistoryReadModel({ filter, pageSize, userId })
      .then((next) => {
        if (isCurrent) {
          setHistoryState({ history: next, userId });
          lastLoadedRef.current = {
            filter,
            hasLoaded: true,
            userId,
          };
        }
      })
      .catch((cause: unknown) => {
        if (isCurrent) {
          setHistoryState({ history: emptyHistory(filter), userId });
          lastLoadedRef.current = { filter, hasLoaded: false, userId };
          setError(
            cause instanceof Error ? cause : new Error("History unavailable")
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [
    filter,
    isFocused,
    isResolvingUser,
    localRevision,
    pageSize,
    retryIndex,
    userId,
  ]);

  const hasCurrentUserHistory =
    !isResolvingUser && userId !== null && historyState.userId === userId;
  const isAwaitingCurrentUserHistory =
    isFocused &&
    (isResolvingUser || (userId !== null && !hasCurrentUserHistory));

  return {
    error: hasCurrentUserHistory ? error : null,
    filter,
    history: hasCurrentUserHistory
      ? historyState.history
      : emptyHistory(filter),
    isLoading: isLoading || isAwaitingCurrentUserHistory,
    isOffline: !isConnected,
    loadMore,
    retry,
    setFilter: changeFilter,
  };
}
