/**
 * SMS Review Route
 *
 * Expo Router page that shows the transaction review list directly.
 * Account matching is done per-transaction via `matchTransactionsBatched`
 * on the review component (no separate account setup step).
 *
 * Flow: sms-scan.tsx → setTransactions → navigate here → review → save
 *
 * Architecture & Design Rationale:
 * - Pattern: Single-Step Flow (direct review)
 * - Why: Account setup was removed (US1) — matching is now automatic
 *   per-transaction, making a separate setup step unnecessary.
 * - SOLID: SRP — this route only orchestrates navigation and save.
 *   Business logic (matching, persistence) lives in services.
 *
 * @module sms-review
 */

import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { TransactionReview } from "@/components/transaction-review/TransactionReview";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { useSmsScanContext } from "@/context/SmsScanContext";
import { useTheme } from "@/context/ThemeContext";
import { useSmsSync } from "@/hooks/useSmsSync";
import { batchCreateTransactions } from "@/services/batch-create-transactions";
import {
  flushQueuedTransactions,
  setReviewingActive,
} from "@/services/sms-live-detection-handler";
import type { ReviewableTransaction } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SmsReviewScreen(): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const { transactions, clearTransactions } = useSmsScanContext();
  const { markSyncComplete } = useSmsSync();
  const { showToast } = useToast();
  const { isDark } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);

  // Mark review as active to queue incoming live transactions
  useEffect(() => {
    setReviewingActive(true);

    return () => {
      setReviewingActive(false);
      flushQueuedTransactions().catch((err) => {
        // Non-critical: queued transactions will be processed on next app launch
        console.warn("[sms-review] Failed to flush queued transactions:", err);
      });
    };
  }, []);

  // ── Save ────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (
      selected: readonly ReviewableTransaction[],
      transactionAccountMap: ReadonlyMap<number, string>,
      toAccountMap: ReadonlyMap<number, string>
    ) => {
      setIsSaving(true);
      try {
        const result = await batchCreateTransactions(
          selected,
          transactionAccountMap,
          toAccountMap
        );

        if (result.failedCount > 0) {
          showToast({
            type: "error",
            title: t("save_error"),
            message: t("save_partial", {
              saved: result.savedCount,
              failed: result.failedCount,
              errors: result.errors.join(", "),
            }),
          });
          return;
        }

        showToast({
          type: "success",
          title: t("saved"),
          message: t("saved_from_sms", { count: result.savedCount }),
        });

        markSyncComplete().catch(console.error);
        clearTransactions();
        router.replace("/(private)/(tabs)/transactions");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast({
          message: t("failed_to_save_transactions", { message }),
          title: t("save_error"),
          type: "error",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [clearTransactions, router, markSyncComplete, showToast, t]
  );

  // ── Discard ─────────────────────────────────────────────────────────

  const handleDiscard = useCallback(() => {
    setDiscardConfirmVisible(true);
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    clearTransactions();
    router.replace("/(private)/(tabs)");
  }, [clearTransactions, router]);

  // ── No transactions guard ───────────────────────────────────────────

  if (transactions.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-background dark:bg-background-dark items-center justify-center px-6">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={palette.slate[400]}
        />
        <Text className="text-lg text-slate-400 mt-4 text-center">
          {t("no_transactions_to_review")}
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(private)/(tabs)")}
          className="mt-6 px-6 py-3 bg-slate-800 rounded-2xl"
        >
          <Text className="text-white font-semibold">
            {t("back_to_dashboard")}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Transaction Review (direct — no setup step) ─────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Transaction review list */}
      <TransactionReview
        transactions={transactions}
        onSave={handleSave}
        onDiscard={handleDiscard}
        isSaving={isSaving}
        title={t("review_transactions_title")}
        subtitle={t("review_sms_source_summary", {
          count: transactions.length,
        })}
        onBack={() => router.back()}
        workspaceVariant="sms"
      />

      {/* Discard confirmation */}
      <ConfirmationModal
        visible={discardConfirmVisible}
        variant="danger"
        title={t("discard_all")}
        message={t("discard_all_confirm")}
        confirmLabel={t("discard")}
        cancelLabel={t("cancel")}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}
