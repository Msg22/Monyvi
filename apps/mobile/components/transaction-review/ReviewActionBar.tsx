import { logReviewFailure } from "@/services/account-review-feedback-diagnostics";
import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

export interface ReviewActionBarProps {
  readonly selectedCount: number;
  readonly isSaving: boolean;
  readonly isReviewMetadataReady: boolean;
  readonly onSave: () => Promise<void>;
  /** Unhandled footer failure is reported by the owning Review surface. */
  readonly onUnhandledSaveError?: (error: unknown) => void;
  readonly onDiscard: () => void;
  readonly isSmsWorkspace?: boolean;
  /** The V2 owned SMS route retains Review later; no legacy discard writer. */
  readonly hideDiscard?: boolean;
  readonly onReviewLater?: () => void;
}

export const SMS_REVIEW_ACTION_BAR_HEIGHT = 100;

export function ReviewActionBar({
  selectedCount,
  isSaving,
  isReviewMetadataReady,
  onSave,
  onUnhandledSaveError,
  onDiscard,
  isSmsWorkspace,
  onReviewLater,
  hideDiscard = false,
}: ReviewActionBarProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const [measuredWidth, setMeasuredWidth] = React.useState<number | null>(null);
  const [discardTextWidth, setDiscardTextWidth] = React.useState(0);
  const [saveTextWidth, setSaveTextWidth] = React.useState(0);
  const [compactDiscardTextWidth, setCompactDiscardTextWidth] =
    React.useState(0);
  const [compactSaveTextWidth, setCompactSaveTextWidth] = React.useState(0);
  const discardLabel = t("discard_all");
  const saveLabel = t("save_selected_button_count", { count: selectedCount });
  // Actual intrinsic localized text widths and the measured footer container,
  // never character estimates or an arbitrary font-scale threshold.
  const measured =
    !hideDiscard &&
    measuredWidth !== null &&
    measuredWidth > 0 &&
    discardTextWidth > 0 &&
    saveTextWidth > 0 &&
    compactDiscardTextWidth > 0 &&
    compactSaveTextWidth > 0;
  const normalDiscardWidth = Math.max(112, discardTextWidth + 18 + 8 + 24 + 2);
  const normalSaveWidth = Math.max(48, saveTextWidth + 18 + 8 + 32);
  const compactDiscardWidth = Math.max(
    48,
    compactDiscardTextWidth + 16 + 6 + 16 + 2
  );
  const compactSaveWidth = Math.max(48, compactSaveTextWidth + 16 + 6 + 16);
  // Discard's 45% cap must also be respected; otherwise the labels wrap.
  const normalFits =
    measured &&
    normalDiscardWidth <= measuredWidth * 0.45 &&
    normalDiscardWidth + normalSaveWidth + 12 <= measuredWidth;
  const compactFits =
    measured &&
    compactDiscardWidth <= measuredWidth * 0.45 &&
    compactDiscardWidth + compactSaveWidth + 8 <= measuredWidth;
  const compact = measured && !normalFits && compactFits;
  const stacked = measured && !normalFits && !compactFits;
  const isSaveDisabled =
    selectedCount === 0 || isSaving || !isReviewMetadataReady;

  const reportUnhandled = (error: unknown): void => {
    if (onUnhandledSaveError) {
      onUnhandledSaveError(error);
      return;
    }
    // Legacy callers without a notice host still receive privacy-safe Metro
    // diagnostics; never resurrect a raw-error toast.
    logReviewFailure({
      source: isSmsWorkspace ? "SMS" : "VOICE",
      stage: "footer_unhandled",
      error,
    });
  };
  const handleSaveWrapper = (): void => {
    try {
      void onSave().catch(reportUnhandled);
    } catch (error: unknown) {
      reportUnhandled(error);
    }
  };

  return (
    <Animated.View
      testID="review-action-bar"
      entering={FadeInDown.delay(200).reduceMotion(ReduceMotion.System)}
      className="border-t border-border bg-background px-5 py-2 dark:border-border-dark dark:bg-background-dark"
    >
      <View
        testID="review-actions-row"
        className={
          (stacked ? "flex-col " : "flex-row ") + (compact ? "gap-2" : "gap-3")
        }
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setMeasuredWidth((previous) => (previous === next ? previous : next));
        }}
      >
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute start-0 top-0 items-start opacity-0"
        >
          <Text
            className="text-sm font-semibold leading-5"
            onLayout={(event) =>
              setDiscardTextWidth(Math.ceil(event.nativeEvent.layout.width))
            }
          >
            {discardLabel}
          </Text>
          <Text
            className="text-base font-bold leading-6"
            onLayout={(event) =>
              setSaveTextWidth(Math.ceil(event.nativeEvent.layout.width))
            }
          >
            {saveLabel}
          </Text>
          <Text
            className="text-[13px] font-semibold leading-[18px]"
            onLayout={(event) =>
              setCompactDiscardTextWidth(
                Math.ceil(event.nativeEvent.layout.width)
              )
            }
          >
            {discardLabel}
          </Text>
          <Text
            className="text-sm font-bold leading-5"
            onLayout={(event) =>
              setCompactSaveTextWidth(Math.ceil(event.nativeEvent.layout.width))
            }
          >
            {saveLabel}
          </Text>
        </View>
        {!hideDiscard && (
          <TouchableOpacity
            onPress={onDiscard}
            disabled={isSaving}
            activeOpacity={0.8}
            className={
              "min-h-12 flex-row items-center justify-center rounded-lg border border-border dark:border-border-dark " +
              (stacked ? "w-full " : "max-w-[45%] shrink-0 ") +
              (compact
                ? "min-w-12 gap-1.5 px-2 py-2"
                : "min-w-28 gap-2 px-3 py-2")
            }
          >
            <Ionicons
              name="trash-outline"
              size={compact ? 16 : 18}
              color={palette.red[500]}
            />
            <Text
              className={
                "min-w-0 shrink text-center font-semibold text-red-600 dark:text-red-400 " +
                (compact ? "text-[13px] leading-[18px]" : "text-sm leading-5")
              }
            >
              {discardLabel}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          testID="review-save-button"
          onPress={handleSaveWrapper}
          disabled={isSaveDisabled}
          accessibilityState={{ disabled: isSaveDisabled }}
          activeOpacity={0.85}
          className={
            "min-h-12 min-w-12 flex-row items-center justify-center rounded-lg " +
            (stacked ? "w-full " : "min-w-0 flex-1 ") +
            (compact ? "gap-1.5 px-2 py-2 " : "gap-2 px-4 py-2 ") +
            (isSaveDisabled ? "bg-slate-700" : "bg-nileGreen-600")
          }
        >
          <Ionicons
            name="lock-closed-outline"
            size={compact ? 16 : 18}
            color={palette.slate[25]}
          />
          <Text
            className={
              "min-w-0 shrink text-center font-bold text-white " +
              (compact ? "text-sm leading-5" : "text-base leading-6")
            }
          >
            {saveLabel}
          </Text>
        </TouchableOpacity>
      </View>
      {onReviewLater && (
        <TouchableOpacity
          testID="sms-review-later"
          onPress={onReviewLater}
          disabled={isSaving}
          activeOpacity={0.7}
          className="min-h-12 items-center justify-center py-2"
        >
          <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
            {t("sms_review_review_later")}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
