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

interface DrilldownQueryState {
  readonly scopeKey: string | null;
  readonly transactions: readonly Transaction[];
  readonly isLoading: boolean;
  readonly error: Error | null;
}

export function useCategoryDrilldownTransactions(
  year: number,
  month: number,
  currency: CurrencyType
): UseCategoryDrilldownTransactionsResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const activeScopeKey = buildScopeKey(userId, year, month, currency);
  const [queryState, setQueryState] = useState<DrilldownQueryState>({
    scopeKey: null,
    transactions: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setQueryState({
          scopeKey: activeScopeKey,
          transactions: [],
          isLoading: true,
          error: null,
        });
      },
      onSignedOut: () => {
        setQueryState({
          scopeKey: activeScopeKey,
          transactions: [],
          isLoading: false,
          error: null,
        });
      },
      onAuthenticated: (currentUserId) => {
        setQueryState({
          scopeKey: activeScopeKey,
          transactions: [],
          isLoading: true,
          error: null,
        });

        const subscription = observeCategoryDrilldownTransactions({
          userId: currentUserId,
          year,
          month,
          currency,
        })
          .observe()
          .subscribe({
            next: (result) => {
              setQueryState({
                scopeKey: activeScopeKey,
                transactions: result,
                isLoading: false,
                error: null,
              });
            },
            error: (err: unknown) => {
              logger.error(
                "categoryDrilldown.transactions.observe.failed",
                err
              );
              setQueryState({
                scopeKey: activeScopeKey,
                transactions: [],
                isLoading: false,
                error: err instanceof Error ? err : new Error(String(err)),
              });
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [
    year,
    month,
    currency,
    userId,
    isResolvingUser,
    activeScopeKey,
  ]);

  const isCurrentScope = queryState.scopeKey === activeScopeKey;

  return {
    transactions: isCurrentScope ? queryState.transactions : [],
    isLoading: isCurrentScope ? queryState.isLoading : true,
    error: isCurrentScope ? queryState.error : null,
  };
}

function buildScopeKey(
  userId: string | null,
  year: number,
  month: number,
  currency: CurrencyType
): string {
  return `${userId ?? "signed-out"}:${year}:${month}:${currency}`;
}
