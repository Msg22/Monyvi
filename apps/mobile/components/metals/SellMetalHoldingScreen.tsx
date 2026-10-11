import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { PageHeader } from "@/components/navigation/PageHeader";
import { GroupedMoneyInput } from "@/components/ui/GroupedMoneyInput";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import type { SellMetalHoldingCopy } from "./sell-copy";

interface SellValues {
  readonly saleDate: string;
  readonly grossProceedsDecimal: string;
  readonly saleCurrency: string;
  readonly feeDecimal: string;
  readonly notes: string;
}

export interface SellMetalHoldingScreenProps {
  readonly holdingName: string;
  readonly copy: SellMetalHoldingCopy;
  readonly values: SellValues;
  readonly purchaseDate: string;
  readonly today: string;
  readonly locale: string;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly preview: {
    readonly validationErrors: Readonly<Record<string, string>>;
    readonly netProceedsLabel: string | null;
    readonly resultLabel: string | null;
    readonly resultDirection: "positive" | "negative" | "zero" | "unavailable";
    readonly canSubmit: boolean;
  };
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onChange: (field: keyof SellValues, value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onRequestExit: () => void;
}

export function SellMetalHoldingScreen(
  props: SellMetalHoldingScreenProps
): React.JSX.Element {
  const { copy, values, preview } = props;
  const compact = shouldUseCompactLayout(props.width, props.fontScale);
  return (
    <View
      testID="metal-holding-sell-screen"
      className="flex-1 bg-slate-25 dark:bg-slate-900"
    >
      <PageHeader
        title={`${copy.title} ${props.holdingName}`}
        showBackButton={!props.isSubmitting}
        showDrawer={false}
        onBack={props.onRequestExit}
        backAccessibilityLabel={copy.back}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mx-auto w-full max-w-2xl gap-6 px-4 pt-4">
            <View className="flex-row items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <Ionicons
                name="information-circle"
                size={24}
                color={palette.nileGreen[500]}
              />
              <Text className="flex-1 text-base leading-6 text-text-primary dark:text-text-primary-dark">
                {copy.wholeHolding}
              </Text>
            </View>
            <SaleDateControl props={props} />
            <View
              testID="metal-holding-sell-field-row"
              className={compact ? "gap-3" : "flex-row gap-3"}
            >
              <GroupedMoneyInput
                testID="metal-holding-sell-gross-field"
                label={copy.gross}
                required
                accessibilityLabel={copy.gross}
                value={values.grossProceedsDecimal}
                onCanonicalChange={(value): void =>
                  props.onChange("grossProceedsDecimal", value)
                }
                editable={!props.isSubmitting}
                error={preview.validationErrors.grossProceedsDecimal}
                containerClassName="flex-1"
                leadingAdornment={
                  <CurrencyLabel currency={values.saleCurrency} />
                }
              />
              <View
                testID="metal-holding-sell-currency"
                accessible
                accessibilityLabel={`${copy.saleCurrency}: ${values.saleCurrency}`}
                accessibilityState={{ disabled: true }}
                className="min-h-12 justify-center rounded-lg border border-slate-200 px-4 dark:border-slate-700"
              >
                <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  {copy.saleCurrency}
                  <Text className="text-red-500">{" *"}</Text>
                </Text>
                <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
                  {values.saleCurrency}
                </Text>
              </View>
            </View>
            <GroupedMoneyInput
              testID="metal-holding-sell-fee-field"
              label={copy.fee}
              accessibilityLabel={copy.fee}
              value={values.feeDecimal}
              onCanonicalChange={(value): void =>
                props.onChange("feeDecimal", value)
              }
              editable={!props.isSubmitting}
              error={preview.validationErrors.feeDecimal}
              leadingAdornment={
                <CurrencyLabel currency={values.saleCurrency} />
              }
            />
            <View
              testID="metal-holding-sell-live-summary"
              accessibilityLiveRegion="polite"
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <SummaryRow
                icon="remove-circle-outline"
                label={copy.net}
                value={preview.netProceedsLabel}
              />
            </View>
            <TextField
              testID="metal-holding-sell-notes-field"
              label={copy.notes}
              value={values.notes}
              onChangeText={(value): void => props.onChange("notes", value)}
              editable={!props.isSubmitting}
              multiline
              error={preview.validationErrors.notes}
              variant="outlined"
            />
            <Consequences props={props} />
            {props.submitError ? (
              <View
                accessibilityLiveRegion="polite"
                className="gap-3 rounded-2xl border border-red-300 p-4 dark:border-red-800"
              >
                <Text
                  accessibilityRole="alert"
                  className="text-base text-red-600 dark:text-red-300"
                >
                  {props.submitError}
                </Text>
                <TouchableOpacity
                  testID="metal-holding-sell-retry"
                  accessibilityRole="button"
                  disabled={props.isSubmitting}
                  onPress={props.onRetry}
                  className="min-h-12 justify-center"
                >
                  <Text className="font-semibold text-nileGreen-600 dark:text-nileGreen-300">
                    {copy.retry}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <SellActionArea props={props} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function CurrencyLabel({
  currency,
}: {
  readonly currency: string;
}): React.JSX.Element {
  return (
    <Text className="text-base text-text-secondary dark:text-text-secondary-dark">
      {currency}
    </Text>
  );
}

function SaleDateControl({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const date = new Date(`${props.values.saleDate}T12:00:00`);
  const display = Number.isFinite(date.getTime())
    ? date.toLocaleDateString(props.locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : props.values.saleDate;
  const selectDate = (event: DateTimePickerEvent, selected?: Date): void => {
    setIsOpen(false);
    if (event.type !== "set" || !selected || props.isSubmitting) return;
    const value = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`;
    props.onChange("saleDate", value);
  };
  return (
    <View>
      <TouchableOpacity
        testID="metal-holding-sell-date"
        accessibilityRole="button"
        accessibilityLabel={`${props.copy.saleDate}: ${display}`}
        accessibilityState={{ disabled: props.isSubmitting }}
        disabled={props.isSubmitting}
        onPress={(): void => setIsOpen(true)}
        className="min-h-12"
      >
        <View pointerEvents="none">
          <TextField
            testID="metal-holding-sell-date-field"
            label={props.copy.saleDate}
            required
            value={display}
            editable={false}
            error={props.preview.validationErrors.saleDate}
            variant="outlined"
            leadingAdornment={
              <Ionicons
                name="calendar-outline"
                size={20}
                color={palette.slate[500]}
              />
            }
          />
        </View>
      </TouchableOpacity>
      {isOpen ? (
        <DateTimePicker
          value={Number.isFinite(date.getTime()) ? date : new Date()}
          mode="date"
          minimumDate={new Date(`${props.purchaseDate}T00:00:00`)}
          maximumDate={new Date(`${props.today}T23:59:59`)}
          onChange={selectDate}
        />
      ) : null}
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>["name"];
  readonly label: string;
  readonly value?: string | null;
  readonly tone?: "positive" | "negative" | "neutral";
}): React.JSX.Element {
  const moneyClass =
    tone === "negative"
      ? "text-red-600 dark:text-red-300"
      : tone === "positive"
        ? "text-nileGreen-700 dark:text-nileGreen-300"
        : "text-text-primary dark:text-text-primary-dark";
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-nileGreen-50 dark:bg-slate-700">
        <Ionicons name={icon} size={20} color={palette.nileGreen[500]} />
      </View>
      <Text className="min-w-0 flex-1 text-base leading-6 text-text-primary dark:text-text-primary-dark">
        {label}
      </Text>
      {value ? (
        <Text className={`text-base font-semibold ${moneyClass}`}>{value}</Text>
      ) : null}
    </View>
  );
}

function Consequences({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const { copy, preview } = props;
  const resultTitle =
    preview.resultDirection === "negative"
      ? copy.loss
      : preview.resultDirection === "zero"
        ? copy.even
        : copy.profit;
  return (
    <View
      testID="metal-holding-sell-consequences"
      accessibilityLiveRegion="polite"
      className="gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <Text className="text-lg font-semibold text-text-primary dark:text-text-primary-dark">
        {copy.consequences}
      </Text>
      <SummaryRow
        icon="cash-outline"
        label={copy.net}
        value={preview.netProceedsLabel}
      />
      <SummaryRow
        icon="trending-up-outline"
        label={
          preview.resultDirection === "unavailable"
            ? copy.unavailable
            : resultTitle
        }
        value={preview.resultLabel}
        tone={
          preview.resultDirection === "positive"
            ? "positive"
            : preview.resultDirection === "negative"
              ? "negative"
              : "neutral"
        }
      />
      <SummaryRow
        icon="pricetag-outline"
        label={`${props.holdingName} ${copy.sold}`}
      />
      <SummaryRow icon="remove-circle-outline" label={copy.leavesActive} />
      <SummaryRow icon="time-outline" label={copy.history} />
    </View>
  );
}

function SellActionArea({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const disabled = props.isSubmitting || !props.preview.canSubmit;
  return (
    <View
      testID="metal-holding-sell-actions"
      className="gap-3"
      style={{ paddingBottom: props.bottomInset + 16 }}
    >
      <TouchableOpacity
        testID="metal-holding-sell-submit"
        accessibilityRole="button"
        accessibilityLabel={
          props.isSubmitting ? props.copy.recording : props.copy.record
        }
        accessibilityState={{ disabled, busy: props.isSubmitting }}
        disabled={disabled}
        onPress={props.onSubmit}
        className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-4 py-3 dark:bg-nileGreen-500"
      >
        <Text
          accessibilityLiveRegion="polite"
          className="text-base font-semibold text-slate-25 dark:text-slate-900"
        >
          {props.isSubmitting ? props.copy.recording : props.copy.record}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="metal-holding-sell-cancel"
        accessibilityRole="button"
        accessibilityLabel={props.copy.cancel}
        accessibilityState={{ disabled: props.isSubmitting }}
        disabled={props.isSubmitting}
        onPress={props.onRequestExit}
        className="min-h-12 items-center justify-center rounded-2xl border border-nileGreen-700 px-4 py-3 dark:border-nileGreen-400"
      >
        <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-300">
          {props.copy.cancel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
