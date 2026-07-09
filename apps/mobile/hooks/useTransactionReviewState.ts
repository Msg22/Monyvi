import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, MarketRate } from "@monyvi/db";
import { useToast } from "@/components/ui/Toast";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { useMarketRates } from "@/hooks/useMarketRates";
import { getPeriodDateRange } from "@/hooks/usePeriodSummary";
import type {
  GroupingPeriod,
  TransactionTypeFilter,
} from "@/hooks/useTransactionsGrouping";
import type { PendingAccount } from "@/services/pending-account-service";
import {
  type AccountMatch,
  type AccountWithBankDetails,
  fetchAccountsWithDetails,
  matchTransactionsBatched,
} from "@/services/sms-account-matcher";
import { prepareSavePayload } from "@/services/sms-review-save-service";
import {
  buildAutoSelectedIndices,
  getTransactionReviewMeta,
  type TransactionReviewMeta,
} from "@/services/transaction-review-selection";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ReviewableTransaction } from "@monyvi/logic";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";

export type ReviewListItem =
  | { readonly kind: "header"; readonly date: string; readonly key: string }
  | {
      readonly kind: "transaction";
      readonly originalIndex: number;
      readonly tx: ReviewableTransaction;
      readonly key: string;
    };

export type TransactionReviewMode = "all" | "needs_review" | "auto_selected";

function groupByDate(
  transactions: readonly ReviewableTransaction[],
  originalTransactions: readonly ReviewableTransaction[]
): readonly ReviewListItem[] {
  const items: ReviewListItem[] = [];
  let lastDate = "";

  const originalIndexMap = new Map<ReviewableTransaction, number>();
  originalTransactions.forEach((tx, i) => originalIndexMap.set(tx, i));

  const sorted = [...transactions].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );

  sorted.forEach((tx) => {
    const dateKey = tx.date.toLocaleDateString("en-EG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    if (dateKey !== lastDate) {
      items.push({ kind: "header", date: dateKey, key: `h-${dateKey}` });
      lastDate = dateKey;
    }

    const originalIndex = originalIndexMap.get(tx) ?? 0;
    items.push({
      kind: "transaction",
      originalIndex,
      tx,
      key: `tx-${originalIndex}`,
    });
  });

  return items;
}

function applyFilters(
  transactions: readonly ReviewableTransaction[],
  period: GroupingPeriod,
  selectedTypes: readonly TransactionTypeFilter[],
  searchQuery: string
): readonly ReviewableTransaction[] {
  let filtered = [...transactions];

  if (period !== "all_time") {
    const { startDate, endDate } = getPeriodDateRange(period);
    filtered = filtered.filter((tx) => {
      const time = tx.date.getTime();
      return time >= startDate && time <= endDate;
    });
  }

  const includesAll = selectedTypes.includes("All");
  if (!includesAll && selectedTypes.length > 0) {
    filtered = filtered.filter((tx) => {
      const txType = tx.type === "INCOME" ? "Income" : "Expense";
      return selectedTypes.includes(txType);
    });
  }

  if (searchQuery.trim()) {
    const lower = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (tx) =>
        tx.counterparty?.toLowerCase().includes(lower) ||
        tx.originLabel.toLowerCase().includes(lower) ||
        tx.amount.toString().includes(lower)
    );
  }

  return filtered;
}

export interface UseTransactionReviewStateProps {
  readonly transactions: readonly ReviewableTransaction[];
  readonly onSave: (
    selected: readonly ReviewableTransaction[],
    transactionAccountMap: ReadonlyMap<number, string>,
    toAccountMap: ReadonlyMap<number, string>
  ) => Promise<void>;
}

export interface UseTransactionReviewStateResult {
  readonly period: GroupingPeriod;
  readonly setPeriod: (p: GroupingPeriod) => void;
  readonly selectedTypes: TransactionTypeFilter[];
  readonly handleTypeToggle: (t: TransactionTypeFilter) => void;
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  readonly periodModalVisible: boolean;
  readonly setPeriodModalVisible: (v: boolean) => void;
  readonly typeModalVisible: boolean;
  readonly setTypeModalVisible: (v: boolean) => void;
  readonly selectedIndices: ReadonlySet<number>;
  readonly selectedIndicesRef: React.MutableRefObject<ReadonlySet<number>>;
  readonly allSelected: boolean;
  readonly selectedCount: number;
  readonly autoSelectedCount: number;
  readonly needsReviewCount: number;
  readonly reviewMode: TransactionReviewMode;
  readonly setReviewMode: (mode: TransactionReviewMode) => void;
  readonly handleReviewNeeds: () => void;
  readonly handleShowAll: () => void;
  readonly handleToggleAll: () => void;
  readonly handleToggleItem: (index: number) => void;
  readonly listItems: readonly ReviewListItem[];
  readonly filteredTransactions: readonly ReviewableTransaction[];
  readonly effectiveTransactions: readonly ReviewableTransaction[];
  readonly invalidIndices: ReadonlySet<number>;
  readonly userAccounts: readonly AccountWithBankDetails[];
  readonly pendingAccounts: readonly PendingAccount[];
  readonly accountMatches: ReadonlyMap<number, AccountMatch>;
  readonly reviewMetaByIndex: ReadonlyMap<number, TransactionReviewMeta>;
  readonly transactionOverrides: ReadonlyMap<number, TransactionEdits>;
  readonly editModalIndex: number | null;
  readonly setEditModalIndex: (i: number | null) => void;
  readonly handleOpenEditModal: (index: number) => void;
  readonly handleEditModalSave: (edits: TransactionEdits) => void;
  readonly handleCreatePendingAccount: (account: PendingAccount) => void;
  readonly handleSave: () => Promise<void>;
  readonly categoryMap: ReadonlyMap<string, Category>;
  readonly expenseCategories: readonly Category[];
  readonly incomeCategories: readonly Category[];
  readonly latestRates: MarketRate | null;
}

export function useTransactionReviewState({
  transactions,
  onSave,
}: UseTransactionReviewStateProps): UseTransactionReviewStateResult {
  // ── Filter state ──────────────────────────────────────────────────
  const [period, setPeriod] = useState<GroupingPeriod>("all_time");
  const [selectedTypes, setSelectedTypes] = useState<TransactionTypeFilter[]>([
    "All",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [reviewMode, setReviewMode] = useState<TransactionReviewMode>("all");

  // ── Selection state ─────────────────────────────────────────────────
  const [selectedIndices, setSelectedIndices] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  const selectedIndicesRef = useRef(selectedIndices);
  selectedIndicesRef.current = selectedIndices;
  const seededSelectionIdentityRef = useRef<string | null>(null);
  const userTouchedSelectionRef = useRef(false);

  // ── Unified transaction overrides ─────────────────────────────────
  const [transactionOverrides, setTransactionOverrides] = useState<
    ReadonlyMap<number, TransactionEdits>
  >(new Map());

  // ── Account matching state ────────────────────────────────────────
  const [accountMatches, setAccountMatches] = useState<
    ReadonlyMap<number, AccountMatch>
  >(new Map());
  const [userAccounts, setUserAccounts] = useState<
    readonly AccountWithBankDetails[]
  >([]);

  // ── Pending accounts ──────────────────────────────────────────────
  const [pendingAccounts, setPendingAccounts] = useState<
    readonly PendingAccount[]
  >([]);

  // ── Missing info flags ────────────────────────────────────────────
  const [invalidIndices, setInvalidIndices] = useState<ReadonlySet<number>>(
    new Set()
  );

  const { showToast } = useToast();

  const handleCreatePendingAccount = useCallback((account: PendingAccount) => {
    setPendingAccounts((prev) => [...prev, account]);
  }, []);

  const { latestRates } = useMarketRates();
  const [editModalIndex, setEditModalIndex] = useState<number | null>(null);
  const { expenseCategories, incomeCategories } = useCategories();
  const categoryMap = useCategoryLookup();
  const { userId, isResolvingUser } = useCurrentUser();

  const batchSize = 20;
  const transactionIdentity = useMemo(
    () =>
      transactions
        .map((tx) =>
          [
            tx.deduplicationHash ?? "",
            tx.originLabel,
            tx.amount,
            tx.currency,
            tx.type,
            tx.date.getTime(),
          ].join(":")
        )
        .join("|"),
    [transactions]
  );

  useEffect(() => {
    seededSelectionIdentityRef.current = null;
    userTouchedSelectionRef.current = false;
    setSelectedIndices(new Set());
    setTransactionOverrides(new Map());
    setAccountMatches(new Map());
    setPendingAccounts([]);
    setInvalidIndices(new Set());
    setEditModalIndex(null);
    setReviewMode("all");
  }, [transactionIdentity]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        if (isResolvingUser || !userId || cancelled) return;

        const accounts = await fetchAccountsWithDetails(userId);
        if (!cancelled) {
          setUserAccounts(accounts);
        }

        await matchTransactionsBatched(
          transactions,
          userId,
          batchSize,
          (batchResults) => {
            if (cancelled) return;
            setAccountMatches((prev) => {
              const next = new Map(prev);
              for (const [idx, match] of batchResults) {
                next.set(idx, match);
              }
              return next;
            });
          },
          accounts
        );
      } catch (err: unknown) {
        if (cancelled) return;
        setAccountMatches(
          new Map(
            transactions.map((_, index) => [
              index,
              {
                accountId: null,
                accountName: null,
                matchReason: "none",
              } satisfies AccountMatch,
            ])
          )
        );
        console.warn("[TransactionReview] Account matching failed:", err);
        showToast({
          type: "warning",
          title: "Account Matching Failed",
          message:
            "Some transactions may not have an account assigned. You can assign them manually.",
          duration: 4000,
        });
      }
    };
    run().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [transactions, showToast, userId, isResolvingUser]);

  const effectiveTransactions =
    useMemo((): readonly ReviewableTransaction[] => {
      return transactions.map((tx, i) => {
        const overrides = transactionOverrides.get(i);
        if (!overrides) return tx;
        return {
          ...tx,
          amount: overrides.amount,
          type: overrides.type,
          categoryId: overrides.categoryId,
          categoryDisplayName:
            categoryMap.get(overrides.categoryId)?.displayName ??
            tx.categoryDisplayName,
          ...(overrides.counterparty !== undefined && {
            counterparty: overrides.counterparty,
          }),
          ...(overrides.note !== undefined && {
            note: overrides.note,
          }),
        };
      });
    }, [transactions, transactionOverrides, categoryMap]);

  const filteredTransactions = useMemo(
    () =>
      applyFilters(effectiveTransactions, period, selectedTypes, searchQuery),
    [effectiveTransactions, period, selectedTypes, searchQuery]
  );

  const effectiveAccountMatches = useMemo((): ReadonlyMap<
    number,
    AccountMatch
  > => {
    const next = new Map(accountMatches);
    transactionOverrides.forEach((edits, index) => {
      next.set(index, {
        accountId: edits.accountId,
        accountName: edits.accountName,
        matchReason: accountMatches.get(index)?.matchReason ?? "none",
      });
    });
    return next;
  }, [accountMatches, transactionOverrides]);

  const reviewMetaByIndex = useMemo((): ReadonlyMap<
    number,
    TransactionReviewMeta
  > => {
    const meta = new Map<number, TransactionReviewMeta>();
    effectiveTransactions.forEach((tx, index) => {
      meta.set(
        index,
        getTransactionReviewMeta(tx, effectiveAccountMatches.get(index))
      );
    });
    return meta;
  }, [effectiveTransactions, effectiveAccountMatches]);

  const autoSelectedOriginalIndices = useMemo(
    () =>
      buildAutoSelectedIndices(effectiveTransactions, effectiveAccountMatches),
    [effectiveTransactions, effectiveAccountMatches]
  );

  const needsReviewOriginalIndices = useMemo((): ReadonlySet<number> => {
    const needsReview = new Set<number>();
    effectiveTransactions.forEach((_, index) => {
      if (!autoSelectedOriginalIndices.has(index)) {
        needsReview.add(index);
      }
    });
    return needsReview;
  }, [effectiveTransactions, autoSelectedOriginalIndices]);

  const hasCompleteAccountMatches =
    effectiveTransactions.length === 0 ||
    accountMatches.size >= effectiveTransactions.length;

  useEffect(() => {
    if (seededSelectionIdentityRef.current === transactionIdentity) return;
    if (userTouchedSelectionRef.current) return;
    if (!hasCompleteAccountMatches) return;

    setSelectedIndices(autoSelectedOriginalIndices);
    seededSelectionIdentityRef.current = transactionIdentity;
  }, [
    autoSelectedOriginalIndices,
    hasCompleteAccountMatches,
    transactionIdentity,
  ]);

  const filteredOriginalIndicesBeforeReviewMode = useMemo(() => {
    const indexMap = new Map<ReviewableTransaction, number>();
    effectiveTransactions.forEach((tx, i) => indexMap.set(tx, i));
    return filteredTransactions.map((tx) => indexMap.get(tx) ?? 0);
  }, [filteredTransactions, effectiveTransactions]);

  const visibleTransactions = useMemo((): readonly ReviewableTransaction[] => {
    if (reviewMode === "all") {
      return filteredTransactions;
    }

    return filteredTransactions.filter((_, index) => {
      const originalIndex = filteredOriginalIndicesBeforeReviewMode[index];
      if (reviewMode === "needs_review") {
        return needsReviewOriginalIndices.has(originalIndex);
      }
      return autoSelectedOriginalIndices.has(originalIndex);
    });
  }, [
    autoSelectedOriginalIndices,
    filteredOriginalIndicesBeforeReviewMode,
    filteredTransactions,
    needsReviewOriginalIndices,
    reviewMode,
  ]);

  const listItems = useMemo(
    () => groupByDate(visibleTransactions, effectiveTransactions),
    [visibleTransactions, effectiveTransactions]
  );

  const filteredOriginalIndices = useMemo(() => {
    const indexMap = new Map<ReviewableTransaction, number>();
    effectiveTransactions.forEach((tx, i) => indexMap.set(tx, i));
    return visibleTransactions.map((tx) => indexMap.get(tx) ?? 0);
  }, [visibleTransactions, effectiveTransactions]);

  const allSelected =
    visibleTransactions.length > 0 &&
    filteredOriginalIndices.every((i) => selectedIndices.has(i));
  const selectedCount = selectedIndices.size;
  const autoSelectedCount = autoSelectedOriginalIndices.size;
  const needsReviewCount = needsReviewOriginalIndices.size;

  const handleToggleAll = useCallback(() => {
    userTouchedSelectionRef.current = true;
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredOriginalIndices.forEach((index) => next.delete(index));
      } else {
        filteredOriginalIndices.forEach((index) => next.add(index));
      }
      return next;
    });
  }, [allSelected, filteredOriginalIndices]);

  const handleToggleItem = useCallback((index: number) => {
    userTouchedSelectionRef.current = true;
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleOpenEditModal = useCallback((index: number) => {
    setEditModalIndex(index);
  }, []);

  const handleEditModalSave = useCallback(
    (edits: TransactionEdits) => {
      if (editModalIndex === null) return;

      setTransactionOverrides((prev) => {
        const next = new Map(prev);
        const existing = next.get(editModalIndex);
        const definedEdits = Object.fromEntries(
          Object.entries(edits).filter(([, v]) => v !== undefined)
        );
        const merged: TransactionEdits = Object.assign(
          {},
          existing,
          definedEdits
        );
        next.set(editModalIndex, merged);
        return next;
      });

      userTouchedSelectionRef.current = true;
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        next.add(editModalIndex);
        return next;
      });
      setInvalidIndices((prev) => {
        const next = new Set(prev);
        next.delete(editModalIndex);
        return next;
      });
      setEditModalIndex(null);
    },
    [editModalIndex]
  );

  const handleReviewNeeds = useCallback(() => {
    setReviewMode("needs_review");
  }, []);

  const handleShowAll = useCallback(() => {
    setReviewMode("all");
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!userId) {
      showToast({
        type: "error",
        title: "Save Error",
        message: "User not authenticated.",
      });
      return;
    }

    const result = await prepareSavePayload({
      selectedIndices,
      transactionOverrides,
      accountMatches,
      pendingAccounts,
      effectiveTransactions,
      userId,
    });

    if (!result.success) {
      if (result.reason === "missing_accounts") {
        setInvalidIndices(result.missingIndices);
        showToast({
          type: "warning",
          title: "Missing Info",
          message: result.message,
          duration: 4000,
        });
      } else {
        showToast({
          type: "error",
          title: "Account Creation Failed",
          message: result.message,
        });
      }
      return;
    }

    setInvalidIndices(new Set());

    await onSave(
      result.selected,
      result.transactionAccountMap,
      result.toAccountMap
    );
  }, [
    effectiveTransactions,
    selectedIndices,
    accountMatches,
    transactionOverrides,
    pendingAccounts,
    onSave,
    showToast,
    userId,
  ]);

  const handleTypeToggle = useCallback((type: TransactionTypeFilter) => {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }, []);

  return {
    period,
    setPeriod,
    selectedTypes,
    handleTypeToggle,
    searchQuery,
    setSearchQuery,
    periodModalVisible,
    setPeriodModalVisible,
    typeModalVisible,
    setTypeModalVisible,
    selectedIndices,
    selectedIndicesRef,
    allSelected,
    selectedCount,
    autoSelectedCount,
    needsReviewCount,
    reviewMode,
    setReviewMode,
    handleReviewNeeds,
    handleShowAll,
    handleToggleAll,
    handleToggleItem,
    listItems,
    filteredTransactions: visibleTransactions,
    effectiveTransactions,
    invalidIndices,
    userAccounts,
    pendingAccounts,
    accountMatches,
    reviewMetaByIndex,
    transactionOverrides,
    editModalIndex,
    setEditModalIndex,
    handleOpenEditModal,
    handleEditModalSave,
    handleCreatePendingAccount,
    handleSave,
    categoryMap,
    expenseCategories,
    incomeCategories,
    latestRates,
  };
}
