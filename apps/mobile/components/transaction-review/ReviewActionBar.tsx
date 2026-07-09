import { useToast } from "@/components/ui/Toast";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ReviewActionBarProps {
  readonly selectedCount: number;
  readonly isSaving: boolean;
  readonly onSave: () => Promise<void>;
  readonly onDiscard: () => void;
}

export function ReviewActionBar({
  selectedCount,
  isSaving,
  onSave,
  onDiscard,
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
      className="px-5 pt-4 bg-white/95 dark:bg-background-dark border-t border-slate-200 dark:border-slate-800 flex-row gap-4 items-center"
      style={{ paddingBottom: bottomPadding }}
    >
      {/* Discard All */}
      <TouchableOpacity
        onPress={onDiscard}
        disabled={isSaving}
        activeOpacity={0.85}
        className="w-[50%] flex-1 py-4 rounded-xl items-center bg-slate-100 dark:bg-slate-800"
      >
        <Text className="text-slate-500 dark:text-slate-400 text-sm font-semibold">
          {t("discard_all")}
        </Text>
      </TouchableOpacity>

      {/* Save Selected */}
      <TouchableOpacity
        onPress={handleSaveWrapper}
        disabled={selectedCount === 0 || isSaving}
        activeOpacity={0.85}
        className={`w-[50%] flex-1 py-4 rounded-xl items-center justify-center ${
          selectedCount === 0 || isSaving
            ? "bg-slate-300 dark:bg-slate-700"
            : "bg-nileGreen-600"
        }`}
      >
        {isSaving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-base font-bold">
            {t("save_selected_button_count", { count: selectedCount })}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
