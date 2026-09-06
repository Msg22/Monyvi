import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";

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
  const [history, setHistory] = useState<MetalHistoryReadModel>(EMPTY_HISTORY);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryIndex, setRetryIndex] = useState(0);
  const [localRevision, setLocalRevision] = useState(0);
  const [pageSize, setPageSize] = useState(METAL_HISTORY_PAGE_SIZE);
  const [observedStates, setObservedStates] = useState<
    readonly MetalHoldingState[]
  >([]);
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
      return;
    }
    const subscription = observeMetalHistoryHoldingStates(userId, "all")
      .observe()
      .subscribe({
        next: (states): void => {
          setObservedStates(states);
          setLocalRevision((value) => value + 1);
        },
        error: (): void => setLocalRevision((value) => value + 1),
      });
    return () => subscription.unsubscribe();
  }, [isFocused, isResolvingUser, userId]);

  useEffect(() => {
    if (!isFocused || isResolvingUser || userId === null) return;
    const query = observeMetalHistoryEvents({
      holdings: observedStates.map((state) => ({
        id: state.holdingId,
        userId: state.userId,
      })),
      userId,
    });
    if (query === null) return;
    const subscription = query.observe().subscribe({
      next: (): void => setLocalRevision((value) => value + 1),
      error: (): void => setLocalRevision((value) => value + 1),
    });
    return () => subscription.unsubscribe();
  }, [isFocused, isResolvingUser, observedStates, userId]);

  useEffect(() => {
    let isCurrent = true;
    if (isResolvingUser) {
      setHistory(emptyHistory(filter));
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
      setHistory(emptyHistory(filter));
      setError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setHistory(emptyHistory(filter));
    setIsLoading(true);
    setError(null);
    void readMetalHistoryReadModel({ filter, pageSize, userId })
      .then((next) => {
        if (isCurrent) setHistory(next);
      })
      .catch((cause: unknown) => {
        if (isCurrent) {
          setHistory(emptyHistory(filter));
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

  return {
    error,
    filter,
    history,
    isLoading,
    isOffline: !isConnected,
    loadMore,
    retry,
    setFilter: changeFilter,
  };
}
