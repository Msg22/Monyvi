/**
 * useAccounts Hook
 * Reactive hook for account data from WatermelonDB
 */

import { Account, BankDetails, database } from "@monyvi/db";
import { calculateAccountsTotalBalance, convertCurrency } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState } from "react";
import {
  observeOwnedById,
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";
import { useCurrentUser } from "./useCurrentUser";
import { logger } from "../utils/logger";
import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";

interface UseAccountsResult {
  readonly accounts: Account[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly totalAccountsBalance: number;
  readonly refetch: () => void;
}

/**
 * A bank account paired with its first non-deleted `BankDetails` row.
 *
 * Note: `account` is the live WatermelonDB `Model` instance — keep it as
 * a Model so getters (`isBank`, etc.) and instance
 * methods (`update`, `markAsDeleted`, `observe`) keep working. The prior
 * spread shape (`{ ...account, bankDetails }`) silently stripped the
 * prototype.
 */
export interface BankAccountWithDetails {
  readonly account: Account;
  readonly bankDetails: BankDetails | undefined;
}

interface UseBankAccountsResult {
  readonly bankAccounts: readonly BankAccountWithDetails[];
  readonly isLoading: boolean;
  readonly error: Error | null;
}

export interface UseTopAccountsResult {
  accounts: Account[];
  isLoading: boolean;
}

export interface UseAccountResult {
  account: Account | null;
  isLoading: boolean;
  error: Error | null;
}

const ACCOUNT_LIST_OBSERVED_COLUMNS = [
  "balance",
  "is_default",
  "name",
  "institution_id",
  "provider_display_name",
];

/**
 * Subscribes to non-deleted accounts owned by the current user and exposes
 * the list, load/error state, total balance in the preferred currency, and a
 * refetch trigger. While auth is still resolving, `isLoading` stays `true`;
 * if there's no signed-in user, returns an empty list (never another user's
 * rows).
 */
export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { latestRates, isLoading: isRatesLoading } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { userId, isResolvingUser } = useCurrentUser();

  const refetch = (): void => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (isResolvingUser) {
      setAccounts([]);
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const accountsCollection = database.get<Account>("accounts");

    const query = queryOwned(
      accountsCollection,
      userId,
      Q.where("deleted", false)
    );

    const subscription = query
      .observeWithColumns(ACCOUNT_LIST_OBSERVED_COLUMNS)
      .subscribe({
        next: (result) => {
          setAccounts(result);
          setIsLoading(false);
        },
        error: (err: unknown) => {
          logger.error("useAccounts_observation_failed", err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [refreshKey, userId, isResolvingUser]);

  const totalAccountsBalance = useMemo(() => {
    if (!latestRates) return 0;
    const totalUsd = calculateAccountsTotalBalance(accounts, latestRates);
    if (preferredCurrency === "USD") return totalUsd;
    return convertCurrency(totalUsd, "USD", preferredCurrency, latestRates);
  }, [accounts, latestRates, preferredCurrency]);

  return {
    accounts,
    isLoading: isLoading || isRatesLoading,
    error,
    totalAccountsBalance,
    refetch,
  };
}

/**
 * Subscribes to non-deleted BANK accounts and to the `bank_details` owned by the current user
 * collection, then joins them in memory by `account_id`.
 *
 * The previous implementation re-ran `account.bankDetails.fetch()` for every
 * account on every observe emit (N round-trips per balance change) AND
 * spread the WatermelonDB `Model` instance into a plain object, stripping
 * its prototype. This version observes both collections once and merges
 * with a `useMemo` keyed on the latest snapshots — O(1) `bank_details`
 * lookup per account, prototype preserved.
 */
export function useBankAccounts(): UseBankAccountsResult {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [bankDetails, setBankDetails] = useState<readonly BankDetails[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [accountsError, setAccountsError] = useState<Error | null>(null);
  const [detailsError, setDetailsError] = useState<Error | null>(null);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (isResolvingUser) {
      setAccounts([]);
      setIsLoadingAccounts(true);
      return;
    }

    if (!userId) {
      setAccounts([]);
      setIsLoadingAccounts(false);
      return;
    }

    setIsLoadingAccounts(true);
    setAccountsError(null);

    const accountsCollection = database.get<Account>("accounts");
    const subscription = queryOwned(
      accountsCollection,
      userId,
      Q.where("deleted", false),
      Q.where("type", "BANK")
    )
      .observeWithColumns(ACCOUNT_LIST_OBSERVED_COLUMNS)
      .subscribe({
        next: (result) => {
          setAccounts(result);
          setAccountsError(null);
          setIsLoadingAccounts(false);
        },
        error: (err: unknown) => {
          logger.error("useBankAccounts_observation_failed", err);
          setAccountsError(err instanceof Error ? err : new Error(String(err)));
          setIsLoadingAccounts(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [userId, isResolvingUser]);

  const accountIds = useMemo(
    () => accounts.map((account) => account.id),
    [accounts]
  );
  const accountIdsKey = useMemo(() => accountIds.join("|"), [accountIds]);

  useEffect(() => {
    if (isResolvingUser) {
      setBankDetails([]);
      setIsLoadingDetails(true);
      return;
    }

    if (!userId) {
      setBankDetails([]);
      setIsLoadingDetails(false);
      return;
    }

    if (accountIds.length === 0) {
      setBankDetails([]);
      setIsLoadingDetails(false);
      setDetailsError(null);
      return;
    }

    setIsLoadingDetails(true);
    setDetailsError(null);

    const subscription = queryChildrenOfOwnedParents(
      database.get<BankDetails>("bank_details"),
      accounts,
      userId,
      "account_id",
      Q.where("deleted", false)
    )
      .observe()
      .subscribe({
        next: (result) => {
          setBankDetails(result);
          setDetailsError(null);
          setIsLoadingDetails(false);
        },
        error: (err: unknown) => {
          logger.error("useBankAccounts_details_fetch_failed", err);
          setDetailsError(err instanceof Error ? err : new Error(String(err)));
          setIsLoadingDetails(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [accountIds, accountIdsKey, userId, isResolvingUser]);

  const bankAccounts = useMemo<readonly BankAccountWithDetails[]>(() => {
    const detailsByAccountId = new Map<string, BankDetails>();
    for (const detail of bankDetails) {
      // First detail per account wins — matches the prior single-detail
      // semantics of `account.bankDetails.fetch()` taking `[0]`.
      if (!detailsByAccountId.has(detail.accountId)) {
        detailsByAccountId.set(detail.accountId, detail);
      }
    }
    return accounts.map((account) => ({
      account,
      bankDetails: detailsByAccountId.get(account.id),
    }));
  }, [accounts, bankDetails]);

  return {
    bankAccounts,
    isLoading: isLoadingAccounts || isLoadingDetails || isResolvingUser,
    error: accountsError ?? detailsError,
  };
}

/**
 * Hook to get top N accounts owned by the current user, ordered by creation
 * date (newest first). Used for dashboard display.
 */
export function useTopAccounts(limit: number = 3): UseTopAccountsResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (isResolvingUser) {
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const accountsCollection = database.get<Account>("accounts");

    const query = queryOwned(
      accountsCollection,
      userId,
      Q.where("deleted", false),
      Q.sortBy("created_at", Q.desc),
      Q.take(limit)
    );

    // Use observeWithColumns to react to balance/default changes, not just add/remove
    const subscription = query
      .observeWithColumns(ACCOUNT_LIST_OBSERVED_COLUMNS)
      .subscribe({
        next: (result) => {
          setAccounts(result);
          setIsLoading(false);
        },
        error: (err: unknown) => {
          logger.error("useTopAccounts_observation_failed", err);
          setIsLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [limit, userId, isResolvingUser]);

  return { accounts, isLoading };
}

/**
 * Hook to get a single account by ID. Validates that the observed record
 * belongs to the current user; treats foreign records as not-found to
 * defend against bad sync state or stale local rows.
 */
export function useAccount(accountId: string | null): UseAccountResult {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { userId, isResolvingUser } = useCurrentUser();

  useEffect(() => {
    if (!accountId) {
      setAccount(null);
      setIsLoading(false);
      return;
    }

    if (isResolvingUser) {
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setAccount(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const accountsCollection = database.get<Account>("accounts");

    const subscription = observeOwnedById<Account>(
      accountsCollection,
      accountId,
      userId
    ).subscribe({
      next: (result) => {
        setAccount(result);
        setIsLoading(false);
      },
      error: (err: unknown) => {
        logger.error("useAccount_observation_failed", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [accountId, userId, isResolvingUser]);

  return { account, isLoading, error };
}
