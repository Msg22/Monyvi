import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TransactionReviewMode } from "@/hooks/useTransactionReviewState";

export interface ReviewActionBarProps {
  readonly selectedCount: number;
  readonly needsReviewCount: number;
  readonly reviewMode: TransactionReviewMode;
  readonly isSaving: boolean;
  readonly onSave: () => Promise<void>;
  readonly onDiscard: () => void;
  readonly onReviewNeeds: () => void;
  readonly onShowAll: () => void;
}

export function ReviewActionBar({
  selectedCount,
  needsReviewCount,
  reviewMode,
  isSaving,
  onSave,
  onReviewNeeds,
  onShowAll,
}: ReviewActionBarProps): React.JSX.Element {
  const { showToast } = useToast();
  const { t } = useTranslation("transactions");
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16);

  const handleSaveWrapper = (): void => {
    onSave().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      showToast({
        type: "error",
        title: t("save_error_title"),
        message,
      });
    });
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(200)}
      className="border-t border-slate-800 bg-slate-950/95 px-7 pt-5"
      style={{ paddingBottom: bottomPadding }}
    >
      <View className="mb-5 flex-row items-center">
        <Ionicons
          name="information-circle-outline"
          size={24}
          color={palette.nileGreen[400]}
        />
        <Text className="ms-3 flex-1 text-sm text-slate-400">
          {t("review_ai_accuracy_notice")}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSaveWrapper}
        disabled={selectedCount === 0 || isSaving}
        activeOpacity={0.85}
        className="overflow-hidden rounded-2xl"
      >
        <LinearGradient
          colors={
            selectedCount === 0 || isSaving
              ? [palette.slate[700], palette.slate[700]]
              : [palette.nileGreen[400], palette.nileGreen[600]]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="min-h-[72px] flex-row items-center justify-between px-7"
        >
          <Ionicons name="lock-closed-outline" size={24} color="white" />
          {isSaving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-xl font-extrabold text-white">
              {t("save_selected_button_count", { count: selectedCount })}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={30} color="white" />
        </LinearGradient>
      </TouchableOpacity>

      {needsReviewCount > 0 && (
        <TouchableOpacity
          onPress={reviewMode === "needs_review" ? onShowAll : onReviewNeeds}
          disabled={isSaving}
          activeOpacity={0.8}
          className="mt-5 min-h-9 items-center justify-center"
        >
          <Text className="text-xl font-bold text-nileGreen-400">
            {reviewMode === "needs_review"
              ? t("show_all")
              : t("review_items_count", { count: needsReviewCount })}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
