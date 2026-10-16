/**
 * Voice Review Route
 *
 * Expo Router page that displays voice-parsed transactions for user review.
 * Receives parsed data via route params from useVoiceTransactionFlow.
 *
 * Architecture & Design Rationale:
 * - Pattern: Page Component (thin route wrapper)
 * - Why: Keeps route files lightweight. Business logic lives in services/hooks.
 *   This page only orchestrates rendering and save/discard actions.
 * - SOLID: SRP — orchestrates review UI only. DIP — depends on service
 *   abstractions for persistence.
 *
 * @module voice-review
 */

import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { PageHeader } from "@/components/navigation/PageHeader";
import { TransactionReview } from "@/components/transaction-review/TransactionReview";
import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { batchCreateTransactions } from "@/services/batch-create-transactions";
import type { ReviewableTransaction } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import React, { useCallback, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type PrivateTabRoute =
  | "/(private)/(tabs)"
  | "/(private)/(tabs)/accounts"
  | "/(private)/(tabs)/transactions"
  | "/(private)/(tabs)/metals";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VoiceReviewScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{
    transactions: string;
    transcript: string;
    originalTranscript: string;
    detectedLanguage: string;
    originTabIndex: string;
  }>();
  const { showToast } = useToast();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");

  const [isSaving, setIsSaving] = useState(false);
  const [discardModalVisible, setDiscardModalVisible] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);

  // Parse transactions from route params
  const transactions = useMemo<readonly ReviewableTransaction[]>(() => {
    try {
      if (!params.transactions) return [];
      const parsed = JSON.parse(params.transactions) as ReviewableTransaction[];
      // Restore Date objects from serialized strings
      return parsed.map((t) => ({
        ...t,
        date: new Date(t.date),
      }));
    } catch {
      console.error("[voice-review] Failed to parse transactions from params");
      return [];
    }
  }, [params.transactions]);

  const transcript = params.transcript ?? "";
  const originalTranscript = params.originalTranscript ?? transcript;
  const detectedLanguage = (params.detectedLanguage ?? "en").toUpperCase();

  /** Map tab indices to route paths for post-save navigation */
  const originTabRoute = useMemo((): PrivateTabRoute => {
    const index = Number(params.originTabIndex ?? "2");
    const TAB_ROUTES: Record<number, PrivateTabRoute> = {
      0: "/(private)/(tabs)",
      1: "/(private)/(tabs)/accounts",
      2: "/(private)/(tabs)/transactions",
      3: "/(private)/(tabs)/metals",
    };
    return TAB_ROUTES[index] ?? "/(private)/(tabs)/transactions";
  }, [params.originTabIndex]);

  // ── Save ────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (
      selected: readonly ReviewableTransaction[],
      transactionAccountMap: ReadonlyMap<number, string>,
      toAccountMap: ReadonlyMap<number, string>
    ): Promise<void> => {
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
            title: tCommon("error"),
            message: t("voice_save_partial", {
              saved: result.savedCount,
              failed: result.failedCount,
              errors: result.errors.join(", "),
            }),
          });
          return;
        }

        showToast({
          type: "success",
          title: tCommon("success"),
          message: t("voice_saved_count", { count: result.savedCount }),
        });

        // Navigate back to origin tab (FR-024: post-save navigation)
        router.replace(originTabRoute);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast({
          message: t("voice_save_error", { message }),
          title: tCommon("error"),
          type: "error",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [router, showToast, originTabRoute, t, tCommon]
  );

  // ── Discard ─────────────────────────────────────────────────────────

  const handleDiscard = useCallback((): void => {
    setDiscardModalVisible(true);
  }, []);

  const handleConfirmDiscard = useCallback((): void => {
    router.replace(originTabRoute);
  }, [router, originTabRoute]);

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
          onPress={() => router.replace(originTabRoute)}
          className="mt-6 px-6 py-3 rounded-2xl"
          style={{ backgroundColor: palette.slate[800] }}
        >
          <Text className="text-white font-semibold">
            {t("back_to_dashboard")}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Voice Review ────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark">
      {/* Header (S-03 + S-06) */}
      <PageHeader
        title={t("voice_review_title")}
        showDrawer={false}
        showBackButton={true}
        rightAction={{
          label: t("voice_retry"),
          onPress: () => {
            router.replace({
              pathname: "/add-transaction",
              params: {
                mode: "voice",
                retry: "true",
                originTabIndex: params.originTabIndex ?? "2",
              },
            });
          },
        }}
      />

      {/* Transcript preview (S-04 + S-05) */}
      {originalTranscript.length > 0 && (
        <View className="mx-4 mb-3 rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
          <TouchableOpacity
            onPress={() => setIsTranscriptExpanded((prev) => !prev)}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center">
                <Ionicons
                  name="mic-outline"
                  size={14}
                  color={palette.slate[500]}
                />
                <Text className="ms-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("voice_what_i_heard")}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="rounded px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700">
                  <Text className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {detectedLanguage}
                  </Text>
                </View>
                <Ionicons
                  name={isTranscriptExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={palette.slate[500]}
                />
              </View>
            </View>
          </TouchableOpacity>
          {isTranscriptExpanded && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
            >
              <Text
                className="text-sm text-slate-700 dark:text-slate-300"
                // eslint-disable-next-line react-native/no-inline-styles
                style={
                  detectedLanguage === "AR"
                    ? { writingDirection: "rtl" }
                    : undefined
                }
              >
                {originalTranscript}
              </Text>
            </Animated.View>
          )}
        </View>
      )}

      <TransactionReview
        transactions={transactions}
        onSave={handleSave}
        onDiscard={handleDiscard}
        isSaving={isSaving}
      />

      <ConfirmationModal
        visible={discardModalVisible}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardModalVisible(false)}
        title={t("discard_voice_title")}
        message={t("discard_voice_message")}
        confirmLabel={t("discard_all")}
        cancelLabel={t("keep_reviewing")}
        variant="danger"
        icon="trash-outline"
      />
    </SafeAreaView>
  );
}
