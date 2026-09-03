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
}

export function useStatsCurrencyFilter(
  preferredCurrency: CurrencyType
): UseStatsCurrencyFilterResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requestedCurrency, setRequestedCurrency] =
    useState<CurrencyType>(preferredCurrency);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (isResolvingUser) {
      setTransactions([]);
      setError(null);
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setTransactions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const subscription = observeStatsCurrencyTransactions({ userId })
      .observe()
      .subscribe({
        next: (result) => {
          setTransactions(result);
          setIsLoading(false);
        },
        error: (err: unknown) => {
          logger.error("stats.currencyOptions.observe.failed", err);
          setTransactions([]);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [userId, isResolvingUser]);

  const availableCurrencies = useMemo(
    () => buildStatsCurrencies(transactions, preferredCurrency),
    [transactions, preferredCurrency]
  );

  const selectedCurrency = useMemo(
    () =>
      resolveSelectedCurrency(
        requestedCurrency,
        availableCurrencies,
        preferredCurrency
      ),
    [requestedCurrency, availableCurrencies, preferredCurrency]
  );

  useEffect(() => {
    setRequestedCurrency(selectedCurrency);
  }, [selectedCurrency]);

  const selectCurrency = useCallback(
    (currency: CurrencyType): void => {
      if (availableCurrencies.includes(currency)) {
        setRequestedCurrency(currency);
      }
    },
    [availableCurrencies]
  );

  return {
    availableCurrencies,
    selectedCurrency,
    selectCurrency,
    isLoading,
    error,
  };
}

function resolveSelectedCurrency(
  requestedCurrency: CurrencyType,
  availableCurrencies: readonly CurrencyType[],
  preferredCurrency: CurrencyType
): CurrencyType {
  if (availableCurrencies.length === 0) {
    return preferredCurrency;
  }

  if (availableCurrencies.includes(requestedCurrency)) {
    return requestedCurrency;
  }

  return availableCurrencies[0] ?? preferredCurrency;
}
