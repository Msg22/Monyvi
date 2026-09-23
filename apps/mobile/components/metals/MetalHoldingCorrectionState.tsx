import React from "react";
import { Text, View } from "react-native";

import { TextField } from "@/components/ui/TextField";
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
}: MetalHoldingCorrectionStateProps): React.JSX.Element {
  const hasFinancialChange = state.affectedChanges.some(
    (change) => change.isFinancial
  );
  const hasPhysicalFormChange = state.affectedChanges.some(
    (change) => change.field === "physicalForm"
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
        label={copy.correctionReason ?? "Why are you changing this?"}
        value={state.correctionReason}
        editable={!isDisabled}
        onChangeText={onReasonChange}
        error={reasonError}
        autoFocus={autoFocus}
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
          <Text
            key={change.field}
            className="text-sm text-text-secondary dark:text-text-secondary-dark"
          >
            {`${change.label}: ${change.before} → ${change.after}`}
          </Text>
        ))}
        {!hasFinancialChange ? (
          <>
            {formattedCurrentValue ? (
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {`${copy.noFinancialChange ?? "Current value stays"} ${formattedCurrentValue}`}
              </Text>
            ) : null}
            {formattedResult ? (
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {`${resultLabel} ${formattedResult}`}
              </Text>
            ) : null}
          </>
        ) : null}
        {hasPhysicalFormChange ? (
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {copy.imageDescriptionUpdate ?? "The holding image and description will update."}
          </Text>
        ) : null}
        <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
          {copy.correctionHistory ?? "This correction will appear in History"}
        </Text>
      </View>
    </View>
  );
}
