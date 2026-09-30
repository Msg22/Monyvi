import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, type TextInput, View } from "react-native";

import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { formatAmount } from "./MetalHoldingLivePreview";
import type {
  MetalHoldingFormCopy,
  MetalHoldingFormEditState,
  MetalHoldingFormPreview,
} from "./MetalHoldingForm";

export interface MetalHoldingCorrectionStateProps {
  readonly copy: MetalHoldingFormCopy;
  readonly state: MetalHoldingFormEditState;
  readonly currency: string;
  readonly locale: "en" | "ar";
  readonly currentValue: string | null;
  readonly resultSincePurchase: string | null;
  readonly resultDirection: MetalHoldingFormPreview["resultDirection"];
  readonly reasonError?: string;
  readonly onReasonChange?: (value: string) => void;
  readonly isDisabled: boolean;
  readonly autoFocus?: boolean;
  readonly inputRef?: React.Ref<TextInput>;
}

/**
 * Presentational component displaying correction consequences, historical
 * notice, and correction reason input when editing material holding fields.
 */
export function MetalHoldingCorrectionState({
  copy,
  state,
  currency,
  locale,
  currentValue,
  resultSincePurchase,
  resultDirection,
  reasonError,
  onReasonChange,
  isDisabled,
  autoFocus,
  inputRef,
}: MetalHoldingCorrectionStateProps): React.JSX.Element {
  const { isDark } = useTheme();
  const iconColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];

  const hasFinancialChange = state.affectedChanges.some(
    (change) => change.isFinancial
  );
  const formattedCurrentValue = currentValue
    ? formatAmount(currency, currentValue, locale, "never")
    : null;
  const unsignedMagnitude =
    resultSincePurchase && resultSincePurchase.startsWith("-")
      ? resultSincePurchase.slice(1)
      : resultSincePurchase;
  const formattedResult =
    unsignedMagnitude && resultDirection && resultDirection !== "unavailable"
      ? formatAmount(currency, unsignedMagnitude, locale, "never")
      : null;
  const resultLabel =
    resultDirection === "negative"
      ? (copy.unchangedLoss ?? "Your loss since purchase stays")
      : resultDirection === "zero"
        ? (copy.unchangedResult ?? "Your result since purchase stays")
        : (copy.unchangedGain ?? "Your gain since purchase stays");

  return (
    <View className="gap-4">
      <TextField
        testID="metal-holding-correction-reason"
        label={copy.correctionReason ?? "Correction reason (optional)"}
        value={state.correctionReason}
        editable={!isDisabled}
        onChangeText={onReasonChange}
        error={reasonError}
        autoFocus={autoFocus}
        inputRef={inputRef}
        multiline
      />
      <View
        testID="metal-holding-what-will-change"
        className="gap-3 rounded-2xl border border-slate-200 bg-slate-25 p-4 dark:border-slate-700 dark:bg-slate-900"
      >
        <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
          {copy.whatWillChange ?? "What will change"}
        </Text>
        {state.affectedChanges.map((change) => (
          <ChangeRow
            key={change.field}
            testID={`change-icon-${change.field}`}
            icon="swap-horizontal-outline"
            iconColor={iconColor}
            text={`${change.label}: ${change.before} → ${change.after}`}
          />
        ))}
        {!hasFinancialChange ? (
          <>
            {formattedCurrentValue ? (
              <ChangeRow
                testID="change-icon-current-value"
                icon="trending-up-outline"
                iconColor={iconColor}
                text={`${copy.noFinancialChange ?? "Current value stays"} ${formattedCurrentValue}`}
              />
            ) : null}
            {formattedResult ? (
              <ChangeRow
                testID="change-icon-result"
                icon="person-outline"
                iconColor={iconColor}
                text={`${resultLabel} ${formattedResult}`}
              />
            ) : null}
          </>
        ) : null}
        <ChangeRow
          testID="change-icon-history"
          icon="time-outline"
          iconColor={iconColor}
          text={
            copy.correctionHistory ?? "This correction will appear in History"
          }
        />
      </View>
    </View>
  );
}

function ChangeRow({
  icon,
  iconColor,
  text,
  testID,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly iconColor: string;
  readonly text: string;
  readonly testID?: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start gap-2.5">
      <View className="mt-0.5">
        <Ionicons
          testID={testID}
          name={icon}
          size={18}
          color={iconColor}
          accessible={false}
          aria-hidden={true}
        />
      </View>
      <Text className="min-w-0 flex-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
        {text}
      </Text>
    </View>
  );
}
