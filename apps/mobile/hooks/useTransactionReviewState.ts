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
  getEditedTransactionReviewMeta,
  getTransactionReviewMeta,
  resolveEditedAccountMatch,
  type TransactionReviewMeta,
  type TransactionReviewReason,
} from "@/services/transaction-review-selection";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { ReviewableTransaction } from "@monyvi/logic";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";
import { toggleTransactionTypeFilter } from "@/utils/transaction-review-filters";

export interface ReviewListItem {
  readonly originalIndex: number;
  readonly tx: ReviewableTransaction;
  readonly key: string;
}

export type TransactionReviewMode = "all" | "needs_review" | "auto_selected";

const HARD_VALIDATION_REASONS: ReadonlySet<TransactionReviewReason> = new Set([
  "account_needed",
  "category_needed",
  "cash_transfer",
]);

function hasHardValidationReason(
  meta: TransactionReviewMeta | undefined
): boolean {
  return (
    meta?.reasons.some((reason) => HARD_VALIDATION_REASONS.has(reason)) ?? false
  );
}

export interface TransactionReviewFilters {
  readonly period: GroupingPeriod;
  readonly selectedTypes: readonly TransactionTypeFilter[];
  readonly searchQuery: string;
}

function buildFlatReviewList(
  transactions: readonly ReviewableTransaction[],
  originalTransactions: readonly ReviewableTransaction[]
): readonly ReviewListItem[] {
  const originalIndexMap = new Map<ReviewableTransaction, number>();
  originalTransactions.forEach((tx, i) => originalIndexMap.set(tx, i));

  return [...transactions]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((tx) => {
      const originalIndex = originalIndexMap.get(tx) ?? 0;
      const smsFingerprint = (
        tx as ReviewableTransaction & { readonly smsFingerprint?: string }
      ).smsFingerprint;
      return {
        originalIndex,
        tx,
        key: smsFingerprint ? `sms-${smsFingerprint}` : `tx-${originalIndex}`,
      };
    });
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
      const isAtmWithdrawal =
        (tx as ReviewableTransaction & { readonly isAtmWithdrawal?: boolean })
          .isAtmWithdrawal === true;
      const txType: TransactionTypeFilter = isAtmWithdrawal
        ? "Transfer"
        : tx.type === "INCOME"
          ? "Income"
          : "Expense";
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
  readonly selectionOverrides?: ReadonlyMap<number, boolean | null>;
  readonly onSelectionChange?: (
    index: number,
    selected: boolean
  ) => void | Promise<void>;
  readonly onTransactionChange?: (
    index: number,
    transaction: ReviewableTransaction
  ) => void | Promise<void>;
}

export interface UseTransactionReviewStateResult {
  readonly period: GroupingPeriod;
  readonly setPeriod: (p: GroupingPeriod) => void;
  readonly selectedTypes: TransactionTypeFilter[];
  readonly handleTypeToggle: (t: TransactionTypeFilter) => void;
  readonly searchQuery: string;
  readonly setSearchQuery: (q: string) => void;
  readonly applyReviewFilters: (filters: TransactionReviewFilters) => void;
  readonly getFilteredTransactionCount: (
    filters: TransactionReviewFilters
  ) => number;
  readonly selectedIndices: ReadonlySet<number>;
  readonly selectedIndicesRef: React.MutableRefObject<ReadonlySet<number>>;
  readonly allSelected: boolean;
  readonly selectedCount: number;
  readonly autoSelectedCount: number;
  readonly needsReviewCount: number;
  readonly reviewMode: TransactionReviewMode;
  readonly setReviewMode: (mode: TransactionReviewMode) => void;
  readonly handleReviewNeeds: () => void;
  readonly handleShowAutoSelected: () => void;
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
  readonly resolvedAccountMatchIndices: ReadonlySet<number>;
  readonly isReviewMetadataReady: boolean;
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

interface AccountMatchState {
  readonly identity: string;
  readonly matches: ReadonlyMap<number, AccountMatch>;
}

function getTransactionRiskIdentity(
  transaction: ReviewableTransaction
): string {
  const reviewFields = transaction as {
    readonly accountId?: string | null;
    readonly isAtmWithdrawal?: boolean;
    readonly toAccountId?: string | null;
  };

  return [
    transaction.confidence,
    transaction.categoryId ?? "",
    transaction.reviewStatus ?? "",
    [...(transaction.reviewReasons ?? [])].sort().join(","),
    reviewFields.accountId ?? "",
    reviewFields.toAccountId ?? "",
    reviewFields.isAtmWithdrawal === true ? "atm" : "not-atm",
  ].join(":");
}

function getTransactionParsedContentIdentity(
  transaction: ReviewableTransaction
): string {
  const sourceFields = transaction as ReviewableTransaction & {
    readonly smsFingerprint?: string;
    readonly senderDisplayName?: string;
    readonly rawSmsBody?: string;
    readonly cardLast4?: string;
    readonly note?: string;
    readonly originalTranscript?: string;
    readonly detectedLanguage?: string;
    readonly aiDetectedCurrency?: string | null;
  };

  return JSON.stringify({
    accountAndRisk: getTransactionRiskIdentity(transaction),
    amount: transaction.amount,
    cardLast4: sourceFields.cardLast4 ?? null,
    categoryDisplayName: transaction.categoryDisplayName,
    counterparty: transaction.counterparty ?? null,
    currency: transaction.currency,
    date: transaction.date.getTime(),
    deduplicationHash: transaction.deduplicationHash ?? null,
    detectedLanguage: sourceFields.detectedLanguage ?? null,
    aiDetectedCurrency: sourceFields.aiDetectedCurrency ?? null,
    merchant: transaction.merchant ?? null,
    note: sourceFields.note ?? null,
    originalTranscript: sourceFields.originalTranscript ?? null,
    originLabel: transaction.originLabel,
    rawSmsBody: sourceFields.rawSmsBody ?? null,
    senderDisplayName: sourceFields.senderDisplayName ?? null,
    smsFingerprint: sourceFields.smsFingerprint ?? null,
    source: transaction.source,
    type: transaction.type,
  });
}

function applyTransactionEdits(
  transaction: ReviewableTransaction,
  edits: TransactionEdits,
  categoryMap: ReadonlyMap<string, Category>
): ReviewableTransaction {
  return {
    ...transaction,
    amount: edits.amount,
    ...(edits.currency !== undefined && { currency: edits.currency }),
    type: edits.type,
    categoryId: edits.categoryId,
    categoryDisplayName:
      categoryMap.get(edits.categoryId)?.displayName ??
      transaction.categoryDisplayName,
    ...(edits.counterparty !== undefined && {
      counterparty: edits.counterparty,
      merchant: edits.counterparty,
    }),
    ...(edits.note !== undefined && { note: edits.note }),
    accountId: edits.accountId ?? undefined,
    ...(edits.toAccountId !== undefined && {
      toAccountId: edits.toAccountId ?? undefined,
    }),
  };
}

export function useTransactionReviewState({
  transactions,
  onSave,
  selectionOverrides = new Map(),
  onSelectionChange,
  onTransactionChange,
}: UseTransactionReviewStateProps): UseTransactionReviewStateResult {
  // ── Filter state ──────────────────────────────────────────────────
  const [period, setPeriod] = useState<GroupingPeriod>("all_time");
  const [selectedTypes, setSelectedTypes] = useState<TransactionTypeFilter[]>([
    "All",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewMode, setReviewMode] = useState<TransactionReviewMode>("all");

  // ── Selection state ─────────────────────────────────────────────────
  const [selectedIndices, setSelectedIndices] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  const selectedIndicesRef = useRef(selectedIndices);
  selectedIndicesRef.current = selectedIndices;
  const seededSelectionIdentityRef = useRef<string | null>(null);
  const userTouchedSelectionRef = useRef(false);
  const manuallyDeselectedIndicesRef = useRef<Set<number>>(new Set());

  // ── Unified transaction overrides ─────────────────────────────────
  const [transactionOverrides, setTransactionOverrides] = useState<
    ReadonlyMap<number, TransactionEdits>
  >(new Map());

  // ── Account matching state ────────────────────────────────────────
  const [accountMatchState, setAccountMatchState] = useState<AccountMatchState>(
    () => ({
      identity: "",
      matches: new Map(),
    })
  );
  const accountMatches = accountMatchState.matches;
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
    () => JSON.stringify(transactions.map(getTransactionParsedContentIdentity)),
    [transactions]
  );
  const previousTransactionsRef = useRef<readonly ReviewableTransaction[]>([]);
  const currentTransactionsRef = useRef(transactions);
  currentTransactionsRef.current = transactions;

  useEffect(() => {
    const currentTransactions = currentTransactionsRef.current;
    const previousTransactions = previousTransactionsRef.current;
    const isAppendOnly =
      previousTransactions.length > 0 &&
      currentTransactions.length >= previousTransactions.length &&
      previousTransactions.every(
        (transaction, index) =>
          getTransactionParsedContentIdentity(transaction) ===
          getTransactionParsedContentIdentity(currentTransactions[index])
      );
    previousTransactionsRef.current = currentTransactions;
    if (isAppendOnly) {
      setAccountMatchState((previous) => ({
        identity: transactionIdentity,
        matches: previous.matches,
      }));
      return;
    }
    seededSelectionIdentityRef.current = null;
    userTouchedSelectionRef.current = false;
    manuallyDeselectedIndicesRef.current = new Set();
    setSelectedIndices(new Set());
    setTransactionOverrides(new Map());
    setAccountMatchState({
      identity: transactionIdentity,
      matches: new Map(),
    });
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
            setAccountMatchState((prev) => {
              const next =
                prev.identity === transactionIdentity
                  ? new Map(prev.matches)
                  : new Map<number, AccountMatch>();
              for (const [idx, match] of batchResults) {
                next.set(idx, match);
              }
              return {
                identity: transactionIdentity,
                matches: next,
              };
            });
          },
          accounts
        );
      } catch (err: unknown) {
        if (cancelled) return;
        setAccountMatchState({
          identity: transactionIdentity,
          matches: new Map(
            transactions.map((_, index) => [
              index,
              {
                accountId: null,
                accountName: null,
                matchReason: "none",
              } satisfies AccountMatch,
            ])
          ),
        });
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
  }, [transactions, showToast, userId, isResolvingUser, transactionIdentity]);

  const effectiveTransactions =
    useMemo((): readonly ReviewableTransaction[] => {
      return transactions.map((transaction, index) => {
        const overrides = transactionOverrides.get(index);
        return overrides
          ? applyTransactionEdits(transaction, overrides, categoryMap)
          : transaction;
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
      const editedMatch = resolveEditedAccountMatch(
        accountMatches.get(index),
        edits.accountId,
        edits.accountConfirmed === true
      );
      next.set(index, {
        accountId: editedMatch.accountId,
        accountName: edits.accountName,
        matchReason: editedMatch.matchReason,
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
        getTransactionReviewMeta(tx, effectiveAccountMatches.get(index), {
          hasCategoryOverride:
            transactionOverrides.get(index)?.categoryConfirmed === true,
          hasCashDestinationOverride:
            transactionOverrides.get(index)?.toAccountConfirmed === true,
        })
      );
    });
    return meta;
  }, [effectiveTransactions, effectiveAccountMatches, transactionOverrides]);

  const autoSelectedOriginalIndices = useMemo((): ReadonlySet<number> => {
    const autoSelected = new Set<number>();
    reviewMetaByIndex.forEach((meta, index) => {
      if (meta.isAutoSelectable) {
        autoSelected.add(index);
      }
    });
    return autoSelected;
  }, [reviewMetaByIndex]);

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
    accountMatchState.identity === transactionIdentity &&
    (effectiveTransactions.length === 0 ||
      accountMatches.size >= effectiveTransactions.length);
  const resolvedAccountMatchIndices = useMemo<ReadonlySet<number>>(
    () =>
      accountMatchState.identity === transactionIdentity
        ? new Set(accountMatchState.matches.keys())
        : new Set(),
    [accountMatchState, transactionIdentity]
  );

  useEffect(() => {
    if (seededSelectionIdentityRef.current === transactionIdentity) return;
    if (userTouchedSelectionRef.current) return;
    if (!hasCompleteAccountMatches) return;

    const seeded = new Set(autoSelectedOriginalIndices);
    selectionOverrides.forEach((override, index) => {
      if (
        override === true &&
        hasHardValidationReason(reviewMetaByIndex.get(index))
      ) {
        seeded.delete(index);
        void onSelectionChange?.(index, false);
        return;
      }
      if (override === true) seeded.add(index);
      if (override === false) seeded.delete(index);
    });
    setSelectedIndices(seeded);
    seededSelectionIdentityRef.current = transactionIdentity;
  }, [
    autoSelectedOriginalIndices,
    hasCompleteAccountMatches,
    onSelectionChange,
    reviewMetaByIndex,
    selectionOverrides,
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
    () => buildFlatReviewList(visibleTransactions, effectiveTransactions),
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
    setSelectedIndices((previous) => {
      const next = new Set(previous);
      filteredOriginalIndices.forEach((index) => {
        const selected = !allSelected;
        if (selected) {
          next.add(index);
          manuallyDeselectedIndicesRef.current.delete(index);
        } else {
          next.delete(index);
          manuallyDeselectedIndicesRef.current.add(index);
        }
        void onSelectionChange?.(index, selected);
      });
      return next;
    });
  }, [allSelected, filteredOriginalIndices, onSelectionChange]);

  const handleToggleItem = useCallback(
    (index: number): void => {
      userTouchedSelectionRef.current = true;
      setSelectedIndices((previous) => {
        const next = new Set(previous);
        const selected = !next.has(index);
        if (selected) {
          next.add(index);
          manuallyDeselectedIndicesRef.current.delete(index);
        } else {
          next.delete(index);
          manuallyDeselectedIndicesRef.current.add(index);
        }
        void onSelectionChange?.(index, selected);
        return next;
      });
    },
    [onSelectionChange]
  );

  const handleOpenEditModal = useCallback((index: number) => {
    setEditModalIndex(index);
  }, []);

  const handleEditModalSave = useCallback(
    (edits: TransactionEdits) => {
      if (editModalIndex === null) return;

      const currentTransaction = effectiveTransactions[editModalIndex];
      const editedMeta = currentTransaction
        ? getEditedTransactionReviewMeta(
            currentTransaction,
            accountMatches.get(editModalIndex),
            edits
          )
        : null;
      const existingEdits = transactionOverrides.get(editModalIndex);
      const definedEdits = Object.fromEntries(
        Object.entries(edits).filter(([, value]) => value !== undefined)
      );
      const mergedEdits: TransactionEdits = Object.assign(
        {},
        existingEdits,
        definedEdits
      );
      if (currentTransaction) {
        void onTransactionChange?.(
          editModalIndex,
          applyTransactionEdits(currentTransaction, mergedEdits, categoryMap)
        );
      }

      setTransactionOverrides((previous) => {
        const next = new Map(previous);
        next.set(editModalIndex, mergedEdits);
        return next;
      });

      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (
          editedMeta?.isAutoSelectable &&
          selectionOverrides.get(editModalIndex) !== false &&
          !manuallyDeselectedIndicesRef.current.has(editModalIndex)
        ) {
          next.add(editModalIndex);
          void onSelectionChange?.(editModalIndex, true);
        }
        return next;
      });
      setInvalidIndices((prev) => {
        const next = new Set(prev);
        next.delete(editModalIndex);
        return next;
      });
      setEditModalIndex(null);
    },
    [
      accountMatches,
      categoryMap,
      editModalIndex,
      effectiveTransactions,
      onSelectionChange,
      onTransactionChange,
      selectionOverrides,
      transactionOverrides,
    ]
  );

  const handleReviewNeeds = useCallback(() => {
    setPeriod("all_time");
    setSelectedTypes(["All"]);
    setSearchQuery("");
    setReviewMode("needs_review");
  }, []);

  const handleShowAutoSelected = useCallback(() => {
    setPeriod("all_time");
    setSelectedTypes(["All"]);
    setSearchQuery("");
    setReviewMode("auto_selected");
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
    setSelectedTypes((previousTypes) =>
      toggleTransactionTypeFilter(previousTypes, type)
    );
  }, []);

  const applyReviewFilters = useCallback(
    (filters: TransactionReviewFilters): void => {
      setPeriod(filters.period);
      setSelectedTypes([...filters.selectedTypes]);
      setSearchQuery(filters.searchQuery);
    },
    []
  );

  const getFilteredTransactionCount = useCallback(
    (filters: TransactionReviewFilters): number => {
      const nextFilteredTransactions = applyFilters(
        effectiveTransactions,
        filters.period,
        filters.selectedTypes,
        filters.searchQuery
      );

      if (reviewMode === "all") {
        return nextFilteredTransactions.length;
      }

      const indexMap = new Map<ReviewableTransaction, number>();
      effectiveTransactions.forEach((tx, index) => indexMap.set(tx, index));
      const expectedIndices =
        reviewMode === "needs_review"
          ? needsReviewOriginalIndices
          : autoSelectedOriginalIndices;

      return nextFilteredTransactions.filter((tx) => {
        const originalIndex = indexMap.get(tx);
        return (
          originalIndex !== undefined && expectedIndices.has(originalIndex)
        );
      }).length;
    },
    [
      autoSelectedOriginalIndices,
      effectiveTransactions,
      needsReviewOriginalIndices,
      reviewMode,
    ]
  );

  return {
    period,
    setPeriod,
    selectedTypes,
    handleTypeToggle,
    searchQuery,
    setSearchQuery,
    applyReviewFilters,
    getFilteredTransactionCount,
    selectedIndices,
    selectedIndicesRef,
    allSelected,
    selectedCount,
    autoSelectedCount,
    needsReviewCount,
    reviewMode,
    setReviewMode,
    handleReviewNeeds,
    handleShowAutoSelected,
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
    resolvedAccountMatchIndices,
    isReviewMetadataReady: hasCompleteAccountMatches,
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
