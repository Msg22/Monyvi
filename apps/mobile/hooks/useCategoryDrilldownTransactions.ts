import type { CurrencyType, Transaction } from "@monyvi/db";
import { useEffect, useState } from "react";

import { observeCategoryDrilldownTransactions } from "@/services/analytics-read-model-service";
import { logger } from "@/utils/logger";
import { runUserScopedEffect, useCurrentUser } from "./useCurrentUser";

interface UseCategoryDrilldownTransactionsResult {
  readonly transactions: readonly Transaction[];
  readonly isLoading: boolean;
  readonly error: Error | null;
}

export function useCategoryDrilldownTransactions(
  year: number,
  month: number,
  currency: CurrencyType
): UseCategoryDrilldownTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setTransactions([]);
        setError(null);
        setIsLoading(true);
      },
      onSignedOut: () => {
        setTransactions([]);
        setError(null);
        setIsLoading(false);
      },
      onAuthenticated: (currentUserId) => {
        setIsLoading(true);
        setError(null);

        const subscription = observeCategoryDrilldownTransactions({
          userId: currentUserId,
          year,
          month,
          currency,
        })
          .observe()
          .subscribe({
            next: (result) => {
              setTransactions(result);
              setIsLoading(false);
            },
            error: (err: unknown) => {
              logger.error(
                "categoryDrilldown.transactions.observe.failed",
                err
              );
              setError(err instanceof Error ? err : new Error(String(err)));
              setTransactions([]);
              setIsLoading(false);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [year, month, currency, userId, isResolvingUser]);

  return { transactions, isLoading, error };
}
