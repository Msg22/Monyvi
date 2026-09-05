import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

import { PageHeader } from "@/components/navigation/PageHeader";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextField } from "@/components/ui/TextField";
import { shouldUseCompactLayout } from "@/constants/ui";

export interface SellMetalHoldingValues {
  readonly saleDate: string;
  readonly grossProceedsDecimal: string;
  readonly saleCurrency: string;
  readonly feeDecimal: string;
  readonly notes: string;
}

export type SellMetalHoldingField = keyof SellMetalHoldingValues;

export interface SellMetalHoldingScreenCopy {
  readonly title: string;
  readonly back: string;
  readonly wholeHoldingTitle: string;
  readonly wholeHoldingBody: string;
  readonly saleDate: string;
  readonly grossProceeds: string;
  readonly grossProceedsHint: string;
  readonly saleCurrency: string;
  readonly fee: string;
  readonly feeHint: string;
  readonly notes: string;
  readonly notesHint: string;
  readonly netProceeds: string;
  readonly accountCredit: string;
  readonly accountCreditUnavailable: string;
  readonly whatHappensTitle: string;
  readonly soldBullet: string;
  readonly noAccountBullet: string;
  readonly resultBullet: string;
  readonly historyBullet: string;
  readonly recordSale: string;
  readonly recordingSale: string;
  readonly cancel: string;
  readonly retry: string;
  readonly offline: string;
  readonly rateWarning: string;
  readonly acknowledgeRateRisk: string;
}

export interface SellMetalHoldingScreenProps {
  readonly holding: {
    readonly name: string;
    readonly description: string;
    readonly weightLabel: string;
  };
  readonly values: SellMetalHoldingValues;
  readonly preview: {
    readonly netProceedsLabel: string | null;
    readonly realizedResultLabel: string | null;
    readonly validationErrors: Readonly<Record<string, string>>;
    readonly requiresRateAcknowledgment: boolean;
    readonly canSubmit: boolean;
  };
  readonly copy: SellMetalHoldingScreenCopy;
  readonly currencyOptions: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
  }>;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly isRtl: boolean;
  readonly isOffline: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onChange: (field: SellMetalHoldingField, value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onRequestExit: () => void;
  readonly onAcknowledgeRateRisk: () => void;
}

export function SellMetalHoldingScreen(
  props: SellMetalHoldingScreenProps
): React.JSX.Element {
  const { copy, isSubmitting, onRequestExit } = props;
  return (
    <View
      testID="metal-holding-sell-screen"
      className="flex-1 bg-slate-25 dark:bg-slate-950"
    >
      <View testID="metal-holding-sell-header">
        <PageHeader
          variant="review"
          title={copy.title}
          showBackButton={!isSubmitting}
          showDrawer={false}
          onBack={onRequestExit}
          backAccessibilityLabel={copy.back}
        />
      </View>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SellFormContent props={props} />
        </ScrollView>
        <SellActionArea props={props} />
      </KeyboardAvoidingView>
    </View>
  );
}

function SellFormContent({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const { holding, preview, copy, isRtl, isOffline, isSubmitting } = props;
  const directionStyle = isRtl ? RTL_DIRECTION_STYLE : LTR_DIRECTION_STYLE;
  return (
    <View
      testID="metal-holding-sell-content"
      className="gap-5 px-5 pb-6"
      style={directionStyle}
    >
      <HoldingIdentity holding={holding} />
      <WholeHoldingNotice copy={copy} />
      <SaleFields props={props} />
      <LiveSummary copy={copy} preview={preview} />
      <AccountCreditUnavailable copy={copy} />
      {preview.requiresRateAcknowledgment ? (
        <RateAcknowledgment
          copy={copy}
          isDisabled={isSubmitting}
          onPress={props.onAcknowledgeRateRisk}
        />
      ) : null}
      <Consequences copy={copy} />
      {props.submitError ? (
        <SubmitError
          message={props.submitError}
          copy={copy}
          onRetry={props.onRetry}
        />
      ) : null}
      {isOffline ? (
        <Text className="text-center text-xs text-text-muted dark:text-text-muted-dark">
          {copy.offline}
        </Text>
      ) : null}
    </View>
  );
}

function SaleFields({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const { values, preview, copy, isSubmitting, onChange } = props;
  return (
    <>
      <TextField
        testID="metal-holding-sell-date-field"
        label={copy.saleDate}
        accessibilityLabel={copy.saleDate}
        value={values.saleDate}
        editable={!isSubmitting}
        error={preview.validationErrors.saleDate}
        onChangeText={(value) => onChange("saleDate", value)}
      />
      <ProceedsFields props={props} />
      <TextField
        testID="metal-holding-sell-fee-field"
        label={copy.fee}
        accessibilityLabel={copy.fee}
        accessibilityHint={copy.feeHint}
        value={values.feeDecimal}
        editable={!isSubmitting}
        keyboardType="decimal-pad"
        error={preview.validationErrors.feeDecimal}
        onChangeText={(value) => onChange("feeDecimal", value)}
      />
      <TextField
        testID="metal-holding-sell-notes-field"
        label={copy.notes}
        accessibilityLabel={copy.notes}
        accessibilityHint={copy.notesHint}
        value={values.notes}
        editable={!isSubmitting}
        multiline
        onChangeText={(value) => onChange("notes", value)}
      />
    </>
  );
}

function ProceedsFields({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const { values, preview, copy, currencyOptions, isSubmitting, onChange } =
    props;
  const isCompact = shouldUseCompactLayout(props.width, props.fontScale);
  return (
    <View
      testID="metal-holding-sell-field-row"
      className={isCompact ? "gap-3" : "flex-row gap-3"}
    >
      <TextField
        testID="metal-holding-sell-gross-field"
        containerClassName="flex-1"
        label={copy.grossProceeds}
        accessibilityLabel={copy.grossProceeds}
        accessibilityHint={copy.grossProceedsHint}
        value={values.grossProceedsDecimal}
        editable={!isSubmitting}
        keyboardType="decimal-pad"
        error={preview.validationErrors.grossProceedsDecimal}
        onChangeText={(value) => onChange("grossProceedsDecimal", value)}
      />
      <CurrencyControl
        copy={copy}
        current={values.saleCurrency}
        options={currencyOptions}
        isDisabled={isSubmitting}
        onChange={(value) => onChange("saleCurrency", value)}
      />
    </View>
  );
}

function SellActionArea({
  props,
}: {
  readonly props: SellMetalHoldingScreenProps;
}): React.JSX.Element {
  const { copy, preview, bottomInset, isSubmitting } = props;
  const submitLabel = isSubmitting ? copy.recordingSale : copy.recordSale;
  const isSubmitDisabled = isSubmitting || !preview.canSubmit;
  return (
    <View
      testID="metal-holding-sell-actions"
      className="gap-3 border-t border-slate-200 bg-slate-25 px-5 pt-4 dark:border-slate-800 dark:bg-slate-950"
      style={{ paddingBottom: bottomInset + 20 }}
    >
      <TouchableOpacity
        testID="metal-holding-sell-submit"
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: isSubmitDisabled }}
        disabled={isSubmitDisabled}
        onPress={props.onSubmit}
        className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-4 dark:bg-nileGreen-500"
      >
        <Text className="font-bold text-slate-25 dark:text-slate-950">
          {submitLabel}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={copy.cancel}
        disabled={isSubmitting}
        onPress={props.onRequestExit}
        className="min-h-11 items-center justify-center px-4"
      >
        <Text className="font-semibold text-text-secondary dark:text-text-secondary-dark">
          {copy.cancel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function HoldingIdentity({
  holding,
}: Pick<SellMetalHoldingScreenProps, "holding">): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900">
        <View
          accessible={false}
          className="h-5 w-5 rounded-full bg-gold-700 dark:bg-gold-300"
        />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-text-primary dark:text-text-primary-dark">
          {holding.name}
        </Text>
        <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
          {holding.description}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
        {holding.weightLabel}
      </Text>
    </View>
  );
}

function WholeHoldingNotice({
  copy,
}: Pick<SellMetalHoldingScreenProps, "copy">): React.JSX.Element {
  return (
    <View
      testID="metal-holding-sell-whole-holding"
      className="rounded-2xl border border-gold-200 bg-gold-50 p-4 dark:border-gold-800 dark:bg-gold-950"
    >
      <Text className="font-bold text-gold-900 dark:text-gold-100">
        {copy.wholeHoldingTitle}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-gold-800 dark:text-gold-200">
        {copy.wholeHoldingBody}
      </Text>
    </View>
  );
}

function CurrencyControl({
  copy,
  current,
  options,
  isDisabled,
  onChange,
}: {
  readonly copy: SellMetalHoldingScreenCopy;
  readonly current: string;
  readonly options: SellMetalHoldingScreenProps["currencyOptions"];
  readonly isDisabled: boolean;
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dropdown
      label={copy.saleCurrency}
      items={options}
      value={current}
      isOpen={isOpen}
      onToggle={() => setIsOpen((currentValue) => !currentValue)}
      onChange={onChange}
      useModal
      disabled={isDisabled}
      className="mb-0 min-w-28 flex-1"
    />
  );
}

function LiveSummary({
  copy,
  preview,
}: Pick<SellMetalHoldingScreenProps, "copy" | "preview">): React.JSX.Element {
  return (
    <View
      testID="metal-holding-sell-live-summary"
      accessibilityLiveRegion="polite"
      className="rounded-2xl bg-nileGreen-50 p-4 dark:bg-nileGreen-950"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-text-secondary dark:text-text-secondary-dark">
          {copy.netProceeds}
        </Text>
        {preview.netProceedsLabel ? (
          <Text className="text-base font-bold text-nileGreen-800 dark:text-nileGreen-200">
            {preview.netProceedsLabel}
          </Text>
        ) : null}
      </View>
      {preview.realizedResultLabel ? (
        <Text className="mt-2 text-sm font-semibold text-text-primary dark:text-text-primary-dark">
          {preview.realizedResultLabel}
        </Text>
      ) : null}
    </View>
  );
}

function AccountCreditUnavailable({
  copy,
}: Pick<SellMetalHoldingScreenProps, "copy">): React.JSX.Element {
  return (
    <View
      testID="metal-holding-sell-account-credit"
      accessibilityRole="switch"
      accessibilityLabel={copy.accountCredit}
      accessibilityHint={copy.accountCreditUnavailable}
      accessibilityState={{ checked: false, disabled: true }}
      className="flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <View className="flex-1">
        <Text className="font-semibold text-text-muted dark:text-text-muted-dark">
          {copy.accountCredit}
        </Text>
        <Text className="mt-1 text-xs text-text-muted dark:text-text-muted-dark">
          {copy.accountCreditUnavailable}
        </Text>
      </View>
      <View className="h-7 w-12 rounded-full bg-slate-300 p-1 dark:bg-slate-700">
        <View className="h-5 w-5 rounded-full bg-slate-25 dark:bg-slate-400" />
      </View>
    </View>
  );
}

function RateAcknowledgment({
  copy,
  isDisabled,
  onPress,
}: {
  readonly copy: SellMetalHoldingScreenCopy;
  readonly isDisabled: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <View className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <Text className="text-sm text-amber-900 dark:text-amber-100">
        {copy.rateWarning}
      </Text>
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityLabel={copy.acknowledgeRateRisk}
        accessibilityState={{ checked: false, disabled: isDisabled }}
        disabled={isDisabled}
        onPress={onPress}
        className="mt-3 min-h-11 flex-row items-center gap-3"
      >
        <View className="h-6 w-6 rounded-md border-2 border-amber-700 dark:border-amber-300" />
        <Text className="flex-1 font-semibold text-amber-900 dark:text-amber-100">
          {copy.acknowledgeRateRisk}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Consequences({
  copy,
}: Pick<SellMetalHoldingScreenProps, "copy">): React.JSX.Element {
  const bullets = [
    copy.soldBullet,
    copy.noAccountBullet,
    copy.resultBullet,
    copy.historyBullet,
  ];
  return (
    <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Text className="font-bold text-text-primary dark:text-text-primary-dark">
        {copy.whatHappensTitle}
      </Text>
      <View className="mt-3 gap-2">
        {bullets.map((bullet) => (
          <View key={bullet} className="flex-row gap-2">
            <View
              accessible={false}
              className="mt-2 h-2 w-2 rounded-full bg-nileGreen-700 dark:bg-nileGreen-300"
            />
            <Text className="flex-1 text-sm leading-5 text-text-secondary dark:text-text-secondary-dark">
              {bullet}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SubmitError({
  message,
  copy,
  onRetry,
}: {
  readonly message: string;
  readonly copy: SellMetalHoldingScreenCopy;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <View className="rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
      <Text
        accessibilityRole="alert"
        className="text-sm text-red-700 dark:text-red-300"
      >
        {message}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={copy.retry}
        onPress={onRetry}
        className="mt-2 min-h-11 self-start justify-center"
      >
        <Text className="font-bold text-red-700 dark:text-red-300">
          {copy.retry}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const RTL_DIRECTION_STYLE: ViewStyle = { direction: "rtl" };
const LTR_DIRECTION_STYLE: ViewStyle = { direction: "ltr" };
