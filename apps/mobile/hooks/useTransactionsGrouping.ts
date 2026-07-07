import { useEffect, useMemo, useState } from "react";

import {
  buildTransactionGroups,
  getTransactionListReadModel,
  observeTransactionListInvalidationSources,
  TRANSACTION_LIST_TRANSACTION_COLUMNS,
  TRANSACTION_LIST_TRANSFER_COLUMNS,
  type DisplayTransaction,
  type GroupedTransaction,
  type GroupingPeriod,
  type TransactionListReadModel,
  type TransactionTypeFilter,
} from "@/services/transaction-list-read-model-service";
import { logger } from "@/utils/logger";
import { useCurrentUser } from "./useCurrentUser";
import { useMarketRates } from "./useMarketRates";
import { useNetWorth } from "./useNetWorth";
import { usePreferredCurrency } from "./usePreferredCurrency";

export type {
  DisplayTransaction,
  GroupedTransaction,
  GroupingPeriod,
  TransactionTypeFilter,
};

export interface UseTransactionsGroupingResult {
  groupedData: GroupedTransaction[];
  isLoading: boolean;
  refetch: () => void;
}

export function useTransactionsGrouping(
  period: GroupingPeriod,
  selectedTypes: TransactionTypeFilter[],
  searchQuery: string
): UseTransactionsGroupingResult {
  const [readModel, setReadModel] = useState<TransactionListReadModel | null>(
    null
  );
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const { totalNetWorth, isLoading: isNetWorthLoading } = useNetWorth();
  const { latestRates } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { userId, isResolvingUser } = useCurrentUser();
  const selectedTypesKey = selectedTypes.join(",");
  const selectedTypeFilters = useMemo(
    (): TransactionTypeFilter[] =>
      selectedTypesKey.length > 0
        ? (selectedTypesKey.split(",") as TransactionTypeFilter[])
        : [],
    [selectedTypesKey]
  );

  useEffect(() => {
    if (isResolvingUser) {
      setReadModel(null);
      setIsDataLoading(true);
      return;
    }

    if (!userId) {
      setReadModel(null);
      setIsDataLoading(false);
      return;
    }

    let cancelled = false;
    setIsDataLoading(true);

    const performFetch = async (): Promise<void> => {
      try {
        const nextModel = await getTransactionListReadModel({
          userId,
          period,
          selectedTypes: selectedTypeFilters,
        });

        if (!cancelled) {
          setReadModel(nextModel);
          setIsDataLoading(false);
        }
      } catch (error: unknown) {
        logger.error("transactionsGrouping.readModel.failed", error);
        if (!cancelled) {
          setReadModel(null);
          setIsDataLoading(false);
        }
      }
    };
    const { transactionsQuery, transfersQuery } =
      observeTransactionListInvalidationSources({ userId, period });

    void performFetch();

    const txSubscription = transactionsQuery
      .observeWithColumns([...TRANSACTION_LIST_TRANSACTION_COLUMNS])
      .subscribe(() => {
        void performFetch();
      });

    const transferSubscription = transfersQuery
      .observeWithColumns([...TRANSACTION_LIST_TRANSFER_COLUMNS])
      .subscribe(() => {
        void performFetch();
      });

    return () => {
      cancelled = true;
      txSubscription.unsubscribe();
      transferSubscription.unsubscribe();
    };
  }, [period, selectedTypeFilters, refetchTrigger, userId, isResolvingUser]);

  const groupedData = useMemo((): GroupedTransaction[] => {
    if (!readModel) {
      return [];
    }

    return buildTransactionGroups({
      ...readModel,
      totalNetWorth,
      latestRates,
      preferredCurrency,
      period,
      searchQuery,
    });
  }, [
    readModel,
    totalNetWorth,
    latestRates,
    preferredCurrency,
    period,
    searchQuery,
  ]);

  return {
    groupedData,
    isLoading: isDataLoading || isNetWorthLoading,
    refetch: (): void => {
      setRefetchTrigger((prev) => prev + 1);
    },
  };
}
