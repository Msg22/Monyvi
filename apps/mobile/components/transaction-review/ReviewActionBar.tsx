import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

export interface ReviewActionBarProps {
  readonly selectedCount: number;
  readonly isSaving: boolean;
  readonly isReviewMetadataReady: boolean;
  readonly onSave: () => Promise<void>;
  readonly onDiscard: () => void;
  readonly isSmsWorkspace?: boolean;
}

export function ReviewActionBar({
  selectedCount,
  isSaving,
  isReviewMetadataReady,
  onSave,
  onDiscard,
}: ReviewActionBarProps): React.JSX.Element {
  const { showToast } = useToast();
  const { t } = useTranslation("transactions");
  const isSaveDisabled =
    selectedCount === 0 || isSaving || !isReviewMetadataReady;

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
      testID="review-action-bar"
      entering={FadeInDown.delay(200)}
      className="border-t border-border bg-background px-5 py-2 dark:border-border-dark dark:bg-background-dark"
    >
      <View testID="review-actions-row" className="h-12 flex-row gap-3">
        <TouchableOpacity
          onPress={onDiscard}
          disabled={isSaving}
          activeOpacity={0.8}
          className="min-w-28 flex-row items-center justify-center rounded-lg border border-border px-3 dark:border-border-dark"
        >
          <Ionicons name="trash-outline" size={18} color={palette.red[500]} />
          <Text
            numberOfLines={1}
            className="ms-2 text-sm font-semibold text-red-600 dark:text-red-400"
          >
            {t("discard_all")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="review-save-button"
          onPress={handleSaveWrapper}
          disabled={isSaveDisabled}
          accessibilityState={{ disabled: isSaveDisabled }}
          activeOpacity={0.85}
          className={`flex-1 flex-row items-center justify-center rounded-lg px-4 ${
            isSaveDisabled ? "bg-slate-700" : "bg-nileGreen-600"
          }`}
        >
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={palette.slate[25]}
          />
          <Text
            className="ms-2 text-base font-bold text-white"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t("save_selected_button_count", { count: selectedCount })}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
