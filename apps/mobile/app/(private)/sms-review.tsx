import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { SafeguardQaDiagnosticsPanel } from "@/components/sms-sync/SafeguardQaDiagnosticsPanel";
import { TransactionReview } from "@/components/transaction-review/TransactionReview";
import { PartialSmsResultsNotice } from "@/components/transaction-review/PartialSmsResultsNotice";
import { SmsReviewUndoBanner } from "@/components/transaction-review/SmsReviewUndoBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { useSmsScanContext } from "@/context/SmsScanContext";
import { useAiProcessingConsent } from "@/hooks/useAiProcessingConsent";
import { useSmsReviewDraftQueue } from "@/hooks/useSmsReviewDraftQueue";
import { useSmsReviewRetry } from "@/hooks/useSmsReviewRetry";
import {
  type UseSmsReviewUndoResult,
  useSmsReviewUndo,
} from "@/hooks/useSmsReviewUndo";
import { useSmsSync } from "@/hooks/useSmsSync";
import {
  discardEverySmsReviewDraft,
  editSmsReviewDraft,
  setSmsReviewDraftSelection,
  setSmsReviewDraftSelections,
} from "@/services/sms-review-draft-command-service";
import {
  saveSelectedSmsReviewDrafts,
  SmsReviewDraftSaveValidationError,
} from "@/services/sms-review-draft-save-service";
import { createSmsSafeguardQaDiagnostics } from "@/services/sms-safeguard-qa-diagnostics-service";
import {
  flushQueuedTransactions,
  setReviewingActive,
} from "@/services/sms-live-detection-handler";
import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";
import type {
  RevalidatedSmsReviewDraftItem,
  SmsReviewDraftHardValidationReason,
} from "@/services/sms-review-draft-reference-service";
import type { VolatileSmsReviewUndoItem } from "@/services/sms-review-draft-repository";
import { logger } from "@/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import type {
  ParsedSmsTransaction,
  ReviewableTransaction,
} from "@monyvi/logic";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

function getSmsFingerprint(transaction: ReviewableTransaction): string | null {
  const fingerprint = (
    transaction as ReviewableTransaction & { readonly smsFingerprint?: string }
  ).smsFingerprint;
  return fingerprint && fingerprint.trim().length > 0 ? fingerprint : null;
}

function isSameSmsReviewSuggestion(
  left: RevalidatedSmsReviewDraftItem,
  right: RevalidatedSmsReviewDraftItem
): boolean {
  return (
    left.draftId === right.draftId ||
    left.transaction.smsFingerprint === right.transaction.smsFingerprint
  );
}

function applyHardValidationReasons(
  transaction: ParsedSmsTransaction,
  hardValidationReasons: readonly SmsReviewDraftHardValidationReason[]
): ParsedSmsTransaction {
  if (hardValidationReasons.length === 0) return transaction;

  const mappedReasons = hardValidationReasons.map((reason) => {
    if (reason === "category_unavailable") return "category_needed" as const;
    if (
      reason === "destination_account_unavailable" ||
      reason === "destination_account_currency_mismatch"
    ) {
      return "cash_transfer_review" as const;
    }
    return "account_needed" as const;
  });

  return {
    ...transaction,
    reviewStatus: "needs_review",
    reviewReasons: [
      ...new Set([...(transaction.reviewReasons ?? []), ...mappedReasons]),
    ],
  };
}

function SmsReviewLoadingState({
  title,
}: {
  readonly title: string;
}): React.JSX.Element {
  return (
    <SafeAreaView
      testID="sms-review-loading"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <View className="h-20 flex-row items-center px-5">
        <Ionicons name="arrow-back" size={26} color={palette.slate[400]} />
        <View className="ms-4 flex-1">
          <Text className="text-xl font-bold text-text-primary dark:text-text-primary-dark">
            {title}
          </Text>
          <View className="mt-2">
            <Skeleton width="42%" height={14} borderRadius={4} />
          </View>
        </View>
      </View>
      <View className="gap-3 px-5 pb-3 pt-3">
        <Skeleton width="100%" height={80} borderRadius={8} />
        <Skeleton width="100%" height={40} borderRadius={8} />
        <Skeleton width="100%" height={40} borderRadius={8} />
      </View>
      <View className="gap-px">
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            testID="sms-review-loading-row"
            className="h-28 border-b border-border bg-background px-5 py-4 dark:border-border-dark dark:bg-background-dark"
          >
            <Skeleton width="100%" height={80} borderRadius={8} />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function ActiveSmsReviewUndoBanner({
  undo,
  onUndo,
}: {
  readonly undo: UseSmsReviewUndoResult;
  readonly onUndo: () => Promise<void>;
}): React.JSX.Element | null {
  if (!undo.undoItem || !undo.discardedName) return null;

  return (
    <SmsReviewUndoBanner
      discardedName={undo.discardedName}
      onUndo={onUndo}
      onClose={undo.close}
    />
  );
}

export default function SmsReviewScreen(): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const {
    unresolvedCandidates,
    safeguardSummary,
    parserDiagnostics,
    clearTransactions,
  } = useSmsScanContext();
  const queue = useSmsReviewDraftQueue();
  const undo = useSmsReviewUndo();
  const { markSyncComplete } = useSmsSync();
  const { showToast } = useToast();
  const smsRetry = useSmsReviewRetry();
  const aiConsent = useAiProcessingConsent();
  const [isSaving, setIsSaving] = useState(false);
  const [isLeavingAfterSave, setIsLeavingAfterSave] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [hiddenFingerprints, setHiddenFingerprints] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [latestDiscardedItem, setLatestDiscardedItem] =
    useState<RevalidatedSmsReviewDraftItem | null>(null);
  const [optimisticallyRestoredItem, setOptimisticallyRestoredItem] =
    useState<RevalidatedSmsReviewDraftItem | null>(null);
  const latestVisualDiscardRequestRef = useRef(0);
  const visualOperationByFingerprintRef = useRef(
    new Map<
      string,
      { readonly id: number; readonly type: "discard" | "restore" }
    >()
  );
  const [discardConfirmation, setDiscardConfirmation] = useState<{
    readonly queueId: string;
    readonly draftIds: readonly string[];
  } | null>(null);

  const reviewItems = useMemo(() => {
    const visibleItems = queue.items.filter(
      (item) => !hiddenFingerprints.has(item.transaction.smsFingerprint)
    );
    if (
      !optimisticallyRestoredItem ||
      visibleItems.some((item) =>
        isSameSmsReviewSuggestion(item, optimisticallyRestoredItem)
      )
    ) {
      return visibleItems;
    }
    return [...visibleItems, optimisticallyRestoredItem].sort(
      (left, right) => left.position - right.position
    );
  }, [hiddenFingerprints, optimisticallyRestoredItem, queue.items]);
  const transactions = useMemo(
    () =>
      reviewItems.map((item) =>
        applyHardValidationReasons(item.transaction, item.hardValidationReasons)
      ),
    [reviewItems]
  );
  const itemByFingerprint = useMemo(
    () =>
      new Map(
        reviewItems.map(
          (item) => [item.transaction.smsFingerprint, item] as const
        )
      ),
    [reviewItems]
  );
  const selectionOverrides = useMemo(
    () =>
      new Map(
        reviewItems.map(
          (item, index) =>
            [
              index,
              item.hardValidationReasons.length > 0
                ? false
                : item.selectionOverride,
            ] as const
        )
      ),
    [reviewItems]
  );
  const activeSafeguardSummary: SmsScanSafeguardSummary | null =
    safeguardSummary;
  const partialResults =
    activeSafeguardSummary !== null &&
    activeSafeguardSummary.deferredAiCount +
      activeSafeguardSummary.oversizedCount +
      activeSafeguardSummary.unresolvedCount >
      0
      ? {
          safeguardSummary: activeSafeguardSummary,
          retryableCount: smsRetry.retryableCount,
          canRetry: smsRetry.retryableCount > 0 && !isSaving,
          isRetrying: smsRetry.isRetrying,
          hasRetryError: smsRetry.hasRetryError,
          onRetry: () => void smsRetry.retry(),
        }
      : undefined;
  const qaDiagnostics = useMemo(
    () =>
      createSmsSafeguardQaDiagnostics({
        parserDiagnostics,
        safeguardSummary: activeSafeguardSummary,
      }),
    [activeSafeguardSummary, parserDiagnostics]
  );

  useEffect(() => {
    setReviewingActive(true);
    return () => {
      setReviewingActive(false);
      clearTransactions();
      void flushQueuedTransactions().catch((error: unknown) => {
        logger.warn("smsReview.flushQueuedTransactions.failed", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
      });
    };
  }, [clearTransactions]);

  useEffect(() => {
    if (!optimisticallyRestoredItem) return;
    const restoredFingerprint =
      optimisticallyRestoredItem.transaction.smsFingerprint;
    const restoredQueueItem = queue.items.find(
      (item) => item.transaction.smsFingerprint === restoredFingerprint
    );
    if (
      !restoredQueueItem ||
      restoredQueueItem.draftId === optimisticallyRestoredItem.draftId
    ) {
      return;
    }
    const operation =
      visualOperationByFingerprintRef.current.get(restoredFingerprint);
    if (operation?.type !== "restore") return;
    visualOperationByFingerprintRef.current.delete(restoredFingerprint);
    setOptimisticallyRestoredItem((current) =>
      current?.transaction.smsFingerprint === restoredFingerprint
        ? null
        : current
    );
    setLatestDiscardedItem((current) =>
      current?.transaction.smsFingerprint === restoredFingerprint
        ? null
        : current
    );
    setHiddenFingerprints((previous) => {
      const next = new Set(previous);
      next.delete(restoredFingerprint);
      return next;
    });
  }, [optimisticallyRestoredItem, queue.items]);

  const handleSave = useCallback(
    async (
      selected: readonly ReviewableTransaction[],
      transactionAccountMap: ReadonlyMap<number, string>,
      toAccountMap: ReadonlyMap<number, string>
    ): Promise<void> => {
      if (!queue.userId) return;
      const selectedItems = selected.map((transaction) => {
        const fingerprint = getSmsFingerprint(transaction);
        const item = fingerprint
          ? itemByFingerprint.get(fingerprint)
          : undefined;
        if (!item) throw new Error("sms_review_draft_item_not_found");
        return {
          ...item,
          transaction: transaction as ParsedSmsTransaction,
        };
      });

      setIsSaving(true);
      try {
        const result = await saveSelectedSmsReviewDrafts({
          selectedItems,
          expectedUserId: queue.userId,
          transactionAccountMap,
          toAccountMap,
        });
        showToast({
          type: "success",
          title: t("sms_review_saved", { count: result.savedCount }),
        });
        if (unresolvedCandidates.length === 0) {
          void markSyncComplete().catch((error: unknown) => {
            logger.warn("smsReview.markSyncComplete.failed", {
              errorName: error instanceof Error ? error.name : "unknown",
            });
          });
        }
        clearTransactions();
        setIsLeavingAfterSave(true);
        router.replace("/(private)/(tabs)/transactions");
        if (result.savedCount === 0) setIsLeavingAfterSave(false);
      } catch (error: unknown) {
        const isValidationError =
          error instanceof SmsReviewDraftSaveValidationError;
        if (isValidationError) await queue.refetch();
        logger.warn("smsReview.save.failed", {
          errorName: error instanceof Error ? error.name : "unknown",
          isValidationError,
        });
        showToast({
          type: isValidationError ? "warning" : "error",
          title: isValidationError
            ? t("sms_review_fix_selected")
            : t("save_error"),
          message: isValidationError
            ? t("sms_review_fix_selected_message")
            : t("sms_review_save_failed_message"),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      clearTransactions,
      itemByFingerprint,
      markSyncComplete,
      queue.userId,
      queue.refetch,
      router,
      showToast,
      t,
      unresolvedCandidates.length,
    ]
  );

  const handleSelectionChange = useCallback(
    async (index: number, selected: boolean): Promise<void> => {
      const item = reviewItems[index];
      if (!item || !queue.userId) return;
      if (selected && item.hardValidationReasons.length > 0) {
        throw new Error("sms_review_draft_hard_validation_required");
      }
      await setSmsReviewDraftSelection(item.draftId, queue.userId, selected);
    },
    [queue.userId, reviewItems]
  );

  const handleSelectionChanges = useCallback(
    async (
      changes: ReadonlyArray<{
        readonly index: number;
        readonly selected: boolean;
      }>
    ): Promise<void> => {
      if (!queue.userId) return;
      const updates = changes.map(({ index, selected }) => {
        const item = reviewItems[index];
        if (!item) throw new Error("sms_review_draft_item_not_found");
        if (selected && item.hardValidationReasons.length > 0) {
          throw new Error("sms_review_draft_hard_validation_required");
        }
        return { draftId: item.draftId, selectionOverride: selected };
      });
      await setSmsReviewDraftSelections(updates, queue.userId);
    },
    [queue.userId, reviewItems]
  );

  const handleTransactionChange = useCallback(
    async (
      index: number,
      transaction: ReviewableTransaction
    ): Promise<void> => {
      const item = reviewItems[index];
      if (!item || !queue.userId || transaction.source !== "SMS") return;
      await editSmsReviewDraft(
        item.draftId,
        queue.userId,
        transaction as ParsedSmsTransaction
      );
    },
    [queue.userId, reviewItems]
  );

  const handleDiscardItem = useCallback(
    async (index: number, wasSelected: boolean): Promise<void> => {
      const item = reviewItems[index];
      if (!item || !queue.userId) return;
      const requestId = latestVisualDiscardRequestRef.current + 1;
      latestVisualDiscardRequestRef.current = requestId;
      const fingerprint = item.transaction.smsFingerprint;
      visualOperationByFingerprintRef.current.set(fingerprint, {
        id: requestId,
        type: "discard",
      });
      const previousDiscardedItem = latestDiscardedItem;
      const discardedItem = { ...item, selectionOverride: wasSelected };
      const optimisticUndoItem: VolatileSmsReviewUndoItem = {
        draftId: item.draftId,
        userId: queue.userId,
        queueId: item.queueId,
        smsFingerprint: item.transaction.smsFingerprint,
        transaction: item.transaction,
        selectionOverride: wasSelected,
        position: item.position,
        parsedAt: item.parsedAt,
      };
      setHiddenFingerprints((previous) => new Set(previous).add(fingerprint));
      setLatestDiscardedItem(discardedItem);
      setOptimisticallyRestoredItem(null);
      try {
        await undo.discard(item.draftId, queue.userId, optimisticUndoItem);
      } catch (error: unknown) {
        const operation =
          visualOperationByFingerprintRef.current.get(fingerprint);
        if (operation?.id === requestId && operation.type === "discard") {
          visualOperationByFingerprintRef.current.delete(fingerprint);
          setHiddenFingerprints((previous) => {
            const next = new Set(previous);
            next.delete(fingerprint);
            return next;
          });
          setLatestDiscardedItem(previousDiscardedItem);
        }
        logger.warn("smsReview.discard.failed", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        showToast({ type: "error", title: t("sms_review_discard_failed") });
      }
    },
    [latestDiscardedItem, queue.userId, reviewItems, showToast, t, undo]
  );

  const handleUndoDiscard = useCallback(async (): Promise<void> => {
    const itemToRestore = latestDiscardedItem;
    let restoreRequestId: number | null = null;
    if (itemToRestore) {
      const fingerprint = itemToRestore.transaction.smsFingerprint;
      restoreRequestId = latestVisualDiscardRequestRef.current + 1;
      latestVisualDiscardRequestRef.current = restoreRequestId;
      visualOperationByFingerprintRef.current.set(fingerprint, {
        id: restoreRequestId,
        type: "restore",
      });
      setOptimisticallyRestoredItem(itemToRestore);
      setHiddenFingerprints((previous) => {
        const next = new Set(previous);
        next.delete(fingerprint);
        return next;
      });
    }
    try {
      const restored = await undo.undo();
      if (!restored && itemToRestore) {
        const fingerprint = itemToRestore.transaction.smsFingerprint;
        const operation =
          visualOperationByFingerprintRef.current.get(fingerprint);
        if (
          operation?.id === restoreRequestId &&
          operation.type === "restore"
        ) {
          visualOperationByFingerprintRef.current.delete(fingerprint);
          setOptimisticallyRestoredItem(null);
          setHiddenFingerprints((previous) =>
            new Set(previous).add(fingerprint)
          );
        }
      }
    } catch (error: unknown) {
      if (itemToRestore) {
        const fingerprint = itemToRestore.transaction.smsFingerprint;
        const operation =
          visualOperationByFingerprintRef.current.get(fingerprint);
        if (
          operation?.id === restoreRequestId &&
          operation.type === "restore"
        ) {
          visualOperationByFingerprintRef.current.delete(fingerprint);
          setOptimisticallyRestoredItem(null);
          setHiddenFingerprints((previous) =>
            new Set(previous).add(fingerprint)
          );
        }
      }
      logger.warn("smsReview.undo.failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      showToast({
        type: "error",
        title: t("sms_review_undo_failed"),
        message: t("sms_review_undo_failed_message"),
      });
    }
  }, [latestDiscardedItem, showToast, t, undo]);

  const handleCloseUndo = useCallback((): void => {
    undo.close();
    setLatestDiscardedItem(null);
    setOptimisticallyRestoredItem(null);
  }, [undo]);

  const handleConfirmDiscard = useCallback(async (): Promise<void> => {
    if (!queue.userId || !discardConfirmation) return;
    try {
      await discardEverySmsReviewDraft(
        queue.userId,
        discardConfirmation.queueId,
        discardConfirmation.draftIds
      );
      clearTransactions();
      setDiscardConfirmVisible(false);
      setDiscardConfirmation(null);
      router.replace("/(private)/(tabs)");
    } catch (error: unknown) {
      logger.warn("smsReview.discardAll.failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      showToast({ type: "error", title: t("sms_review_discard_failed") });
    }
  }, [
    clearTransactions,
    discardConfirmation,
    queue.userId,
    router,
    showToast,
    t,
  ]);

  const handleRequestDiscardAll = useCallback((): void => {
    if (!queue.queueId || reviewItems.length === 0) return;
    setDiscardConfirmation({
      queueId: queue.queueId,
      draftIds: reviewItems.map((item) => item.draftId),
    });
    setDiscardConfirmVisible(true);
  }, [queue.queueId, reviewItems]);

  const handleReviewLater = useCallback((): void => {
    clearTransactions();
    router.replace("/(private)/(tabs)");
  }, [clearTransactions, router]);

  const handleRetryConsentContinue = useCallback(async (): Promise<void> => {
    try {
      await aiConsent.grantConsent();
      smsRetry.dismissConsentRequired();
      await smsRetry.retry();
    } catch (error: unknown) {
      logger.warn("smsReview.retryConsent.failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      showToast({ type: "error", title: t("ai_consent_retry_error") });
    }
  }, [aiConsent, showToast, smsRetry, t]);

  const retryConsentSheet = (
    <AiProcessingConsentSheet
      visible={smsRetry.isConsentRequired}
      onContinue={handleRetryConsentContinue}
      onNotNow={smsRetry.dismissConsentRequired}
      onPrivacyDetails={() => {
        smsRetry.dismissConsentRequired();
        router.push("/privacy-details");
      }}
    />
  );

  if (queue.isLoading || isLeavingAfterSave) {
    return <SmsReviewLoadingState title={t("review_transactions_title")} />;
  }

  if (transactions.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6 dark:bg-background-dark">
        <Ionicons
          name={queue.error ? "warning-outline" : "checkmark-circle-outline"}
          size={48}
          color={palette.slate[400]}
        />
        <Text className="mt-4 text-center text-lg text-text-secondary dark:text-text-secondary-dark">
          {queue.error
            ? t("sms_review_load_failed")
            : t("no_transactions_to_review")}
        </Text>
        {partialResults && (
          <View className="mt-6 w-full">
            <PartialSmsResultsNotice
              {...partialResults}
              hasReviewableSuggestions={false}
            />
          </View>
        )}
        <View className="w-full">
          <SafeguardQaDiagnosticsPanel diagnostics={qaDiagnostics} />
        </View>
        <TouchableOpacity
          onPress={() => router.replace("/(private)/(tabs)")}
          className="mt-6 rounded-lg bg-slate-800 px-6 py-3"
        >
          <Text className="font-semibold text-white">
            {t("back_to_dashboard")}
          </Text>
        </TouchableOpacity>
        {retryConsentSheet}
        <ActiveSmsReviewUndoBanner
          undo={{ ...undo, close: handleCloseUndo }}
          onUndo={handleUndoDiscard}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <StatusBar style="auto" />
      <TransactionReview
        transactions={transactions}
        selectionOverrides={selectionOverrides}
        onSelectionChange={handleSelectionChange}
        onSelectionChanges={handleSelectionChanges}
        onTransactionChange={handleTransactionChange}
        onDiscardItem={handleDiscardItem}
        onSave={handleSave}
        onDiscard={handleRequestDiscardAll}
        onReviewLater={handleReviewLater}
        undoBanner={
          undo.undoItem && undo.discardedName
            ? {
                discardedName: undo.discardedName,
                onUndo: handleUndoDiscard,
                onClose: handleCloseUndo,
              }
            : undefined
        }
        isSaving={isSaving || smsRetry.isRetrying}
        title={t("review_transactions_title")}
        subtitle={t("review_sms_source_summary", {
          count: transactions.length,
        })}
        workspaceVariant="sms"
        partialResults={partialResults}
        qaDiagnostics={qaDiagnostics}
        onBack={() => router.back()}
      />
      <ConfirmationModal
        visible={discardConfirmVisible}
        variant="danger"
        title={t("sms_review_discard_all_title")}
        message={t("sms_review_discard_all_message", {
          count: discardConfirmation?.draftIds.length ?? 0,
        })}
        confirmLabel={t("discard")}
        cancelLabel={t("cancel")}
        onConfirm={() => void handleConfirmDiscard()}
        onCancel={() => {
          setDiscardConfirmVisible(false);
          setDiscardConfirmation(null);
        }}
      />
      {retryConsentSheet}
    </SafeAreaView>
  );
}
