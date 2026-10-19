import { useToast } from "@/components/ui/Toast";
import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

export interface ReviewActionBarProps {
  readonly selectedCount: number;
  readonly isSaving: boolean;
  readonly isReviewMetadataReady: boolean;
  readonly onSave: () => Promise<void>;
  readonly onDiscard: () => void;
  readonly isSmsWorkspace?: boolean;
  /** The V2 owned SMS route retains Review later; no legacy discard writer. */
  readonly hideDiscard?: boolean;
  readonly onReviewLater?: () => void;
}

export const SMS_REVIEW_ACTION_BAR_HEIGHT = 100;

/**
 * Conservative intrinsic label-width budget for choosing an action layout.
 * Actual text remains shrinkable/wrappable; neither labels nor font scaling
 * are constrained to the estimate. The bar uses its measured content width.
 */
function labelWidthBudget(
  label: string,
  fontSize: number,
  fontScale: number
): number {
  return Array.from(label).length * fontSize * fontScale * 0.48;
}

export function ReviewActionBar({
  selectedCount,
  isSaving,
  isReviewMetadataReady,
  onSave,
  onDiscard,
  onReviewLater,
  hideDiscard = false,
}: ReviewActionBarProps): React.JSX.Element {
  const { showToast } = useToast();
  const { t } = useTranslation("transactions");
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = React.useState<number | null>(null);
  const discardLabel = t("discard_all");
  const saveLabel = t("save_selected_button_count", { count: selectedCount });
  // The 20 dp outer gutters are already applied by this bar; use its actual
  // measured inner width after layout, including for tablet/landscape layouts.
  const available = measuredWidth ?? Math.max(0, width - 40);
  const standardWidth =
    Math.max(112, labelWidthBudget(discardLabel, 14, fontScale) + 42) +
    Math.max(44, labelWidthBudget(saveLabel, 16, fontScale) + 58) +
    12;
  const compactWidth =
    Math.max(44, labelWidthBudget(discardLabel, 13, fontScale) + 32) +
    Math.max(44, labelWidthBudget(saveLabel, 14, fontScale) + 40) +
    8;
  const compact =
    fontScale > 1.35 || (!hideDiscard && available < standardWidth);
  const stacked = !hideDiscard && available < compactWidth;
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
        {!hideDiscard && (
          <TouchableOpacity
            onPress={onDiscard}
            disabled={isSaving}
            activeOpacity={0.8}
            className={
              "min-h-12 flex-row items-center justify-center rounded-lg border border-border dark:border-border-dark " +
              (stacked ? "w-full " : "max-w-[45%] shrink-0 ") +
              (compact
                ? "min-w-11 gap-1.5 px-2 py-2"
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
            "min-h-12 min-w-11 flex-row items-center justify-center rounded-lg " +
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
          className="min-h-11 items-center justify-center py-2"
        >
          <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
            {t("sms_review_review_later")}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
