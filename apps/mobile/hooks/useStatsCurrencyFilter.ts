import type { CurrencyType, Transaction } from "@monyvi/db";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildStatsCurrencies,
  observeStatsCurrencyTransactions,
} from "@/services/analytics-read-model-service";
import { logger } from "@/utils/logger";
import { useCurrentUser } from "./useCurrentUser";

interface UseStatsCurrencyFilterResult {
  readonly availableCurrencies: readonly CurrencyType[];
  readonly selectedCurrency: CurrencyType;
  readonly selectCurrency: (currency: CurrencyType) => void;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function useStatsCurrencyFilter(
  preferredCurrency: CurrencyType,
  isPreferredCurrencyLoading: boolean = false
): UseStatsCurrencyFilterResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requestedCurrency, setRequestedCurrency] =
    useState<CurrencyType | null>(null);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (isResolvingUser) {
      setTransactions([]);
      setError(null);
      setIsDiscoveryLoading(true);
      return;
    }

    if (!userId) {
      setTransactions([]);
      setError(null);
      setIsDiscoveryLoading(false);
      return;
    }

    setIsDiscoveryLoading(true);
    setError(null);

    const subscription = observeStatsCurrencyTransactions({ userId })
      .observe()
      .subscribe({
        next: (result) => {
          setTransactions(result);
          setIsDiscoveryLoading(false);
        },
        error: (err: unknown) => {
          logger.error("stats.currencyOptions.observe.failed", err);
          setTransactions([]);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsDiscoveryLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [userId, isResolvingUser, retryVersion]);

  const availableCurrencies = useMemo(
    () => buildStatsCurrencies(transactions, preferredCurrency),
    [transactions, preferredCurrency]
  );

  const selectedCurrency = useMemo(
    () =>
      resolveSelectedCurrency(
        isPreferredCurrencyLoading ? null : requestedCurrency,
        availableCurrencies,
        preferredCurrency
      ),
    [
      requestedCurrency,
      availableCurrencies,
      preferredCurrency,
      isPreferredCurrencyLoading,
    ]
  );

  useEffect(() => {
    if (!isPreferredCurrencyLoading) {
      setRequestedCurrency(selectedCurrency);
    }
  }, [isPreferredCurrencyLoading, selectedCurrency]);

  const selectCurrency = useCallback(
    (currency: CurrencyType): void => {
      if (availableCurrencies.includes(currency)) {
        setRequestedCurrency(currency);
      }
    },
    [availableCurrencies]
  );

  const retry = useCallback((): void => {
    setRetryVersion((current) => current + 1);
  }, []);

  return {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
    isLoading: isDiscoveryLoading || isPreferredCurrencyLoading,
    error,
    retry,
  };
}

function resolveSelectedCurrency(
  requestedCurrency: CurrencyType | null,
  availableCurrencies: readonly CurrencyType[],
  preferredCurrency: CurrencyType
): CurrencyType {
  if (availableCurrencies.length === 0) {
    return preferredCurrency;
  }

  if (
    requestedCurrency !== null &&
    availableCurrencies.includes(requestedCurrency)
  ) {
    return requestedCurrency;
  }

  if (availableCurrencies.includes(preferredCurrency)) {
    return preferredCurrency;
  }

  return availableCurrencies[0] ?? preferredCurrency;
}
