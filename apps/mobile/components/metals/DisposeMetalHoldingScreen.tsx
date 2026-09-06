import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  type TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { shouldUseCompactLayout } from "@/constants/ui";
import type {
  DisposeCategory,
  DisposeTreatment,
} from "@/services/dispose-metal-holding-command-service";

export const DISPOSE_METAL_HOLDING_COPY_KEYS = Object.freeze({
  title: "dispose.title",
  intro: "dispose.intro",
  reasonLabel: "dispose.reasonLabel",
  categories: Object.freeze({
    lost_stolen: "dispose.categories.lostOrStolen",
    destroyed_damaged: "dispose.categories.destroyedOrDamaged",
    given_away: "dispose.categories.givenAway",
    donated: "dispose.categories.donated",
    other: "dispose.categories.other",
  }),
  otherTreatmentLabel: "dispose.otherTreatmentLabel",
  treatments: Object.freeze({
    write_off: "dispose.treatments.writeOff",
    external_transfer: "dispose.treatments.externalTransfer",
  }),
  dateLabel: "dispose.dateLabel",
  notesLabel: "dispose.notesLabel",
  notesOptional: "dispose.notesOptional",
  summaryTitle: "dispose.summaryTitle",
  writeOffSummary: "dispose.writeOffSummary",
  externalTransferSummary: "dispose.externalTransferSummary",
  activeOwnershipSummary: "dispose.activeOwnershipSummary",
  historySummary: "dispose.historySummary",
  noSaleMoneyOrAccountSummary: "dispose.noSaleMoneyOrAccountSummary",
  noSaleProfitLossSummary: "dispose.noSaleProfitLossSummary",
  submitLabel: "dispose.submitLabel",
  pendingLabel: "dispose.pendingLabel",
  cancelLabel: "dispose.cancelLabel",
  retryLabel: "dispose.retryLabel",
  loadError: "dispose.loadError",
  categoryRequired: "dispose.categoryRequired",
  treatmentRequired: "dispose.treatmentRequired",
  dateRequired: "dispose.dateRequired",
});

export interface DisposeMetalHoldingCopy {
  readonly title: string;
  readonly intro: string;
  readonly reasonLabel: string;
  readonly categoryLabels: Readonly<Record<DisposeCategory, string>>;
  readonly otherTreatmentLabel: string;
  readonly treatmentLabels: Readonly<Record<DisposeTreatment, string>>;
  readonly dateLabel: string;
  readonly notesLabel: string;
  readonly notesOptional: string;
  readonly summaryTitle: string;
  readonly writeOffSummary: string;
  readonly externalTransferSummary: string;
  readonly activeOwnershipSummary: string;
  readonly historySummary: string;
  readonly noSaleMoneyOrAccountSummary: string;
  readonly noSaleProfitLossSummary: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel: string;
  readonly retryLabel: string;
  readonly loadError: string;
  readonly categoryRequired: string;
  readonly treatmentRequired: string;
  readonly dateRequired: string;
}

export interface DisposeMetalHoldingScreenProps {
  readonly holdingName: string;
  readonly copy: DisposeMetalHoldingCopy;
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly category: DisposeCategory | null;
  readonly otherTreatment: DisposeTreatment | null;
  readonly treatment: DisposeTreatment | null;
  readonly disposalDate: string;
  readonly notes: string;
  readonly isLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly loadError?: string | null;
  readonly submitError?: string | null;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onCategoryChange: (category: DisposeCategory) => void;
  readonly onOtherTreatmentChange: (treatment: DisposeTreatment) => void;
  readonly onDateChange: (value: string) => void;
  readonly onNotesChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onRetry: () => void;
}

const CATEGORIES: readonly DisposeCategory[] = [
  "lost_stolen",
  "destroyed_damaged",
  "given_away",
  "donated",
  "other",
];
const TREATMENTS: readonly DisposeTreatment[] = [
  "write_off",
  "external_transfer",
];
const CONSEQUENCE_ORDER = [
  "reason",
  "treatment",
  "ownership",
  "sale-money-account",
  "sale-profit-loss",
  "history",
] as const;

function ChoiceButton(props: {
  readonly id: string;
  readonly label: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isStacked: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  const className = props.isStacked
    ? "min-h-12 w-full justify-center rounded-2xl border border-slate-300 bg-slate-25 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
    : "min-h-12 w-[48%] justify-center rounded-2xl border border-slate-300 bg-slate-25 px-4 py-3 dark:border-slate-700 dark:bg-slate-900";
  return (
    <TouchableOpacity
      testID={props.id}
      accessibilityRole="radio"
      accessibilityState={{
        selected: props.isSelected,
        disabled: props.isDisabled,
      }}
      disabled={props.isDisabled}
      onPress={props.onPress}
      className={`${className} ${
        props.isSelected
          ? "border-nileGreen-700 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-slate-800"
          : ""
      }`}
      style={props.isDisabled ? { opacity: 0.55 } : undefined}
    >
      <Text
        className={
          props.isSelected
            ? "text-sm font-semibold text-nileGreen-800 dark:text-nileGreen-300"
            : "text-sm font-medium text-text-primary dark:text-text-primary-dark"
        }
      >
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

function LoadingState(): React.JSX.Element {
  return (
    <View testID="dispose-form-skeleton" className="flex-1 gap-4 px-5 py-6">
      <Skeleton width="100%" height={64} />
      <View className="flex-row gap-3">
        <Skeleton width="48%" height={56} />
        <Skeleton width="48%" height={56} />
      </View>
      <Skeleton width="100%" height={132} />
      <Skeleton width="100%" height={112} />
    </View>
  );
}

export function DisposeMetalHoldingScreen({
  holdingName,
  copy,
  locale,
  isRtl,
  width,
  fontScale,
  bottomInset,
  category,
  otherTreatment,
  treatment,
  disposalDate,
  notes,
  isLoading = false,
  isSubmitting = false,
  loadError = null,
  submitError = null,
  validationErrors = {},
  onCategoryChange,
  onOtherTreatmentChange,
  onDateChange,
  onNotesChange,
  onSubmit,
  onRequestExit,
  onRetry,
}: DisposeMetalHoldingScreenProps): React.JSX.Element {
  const isStacked = shouldUseCompactLayout(width, fontScale);
  const hasSummary = category !== null && treatment !== null;
  const validationSummaryRef = useRef<View>(null);
  const categoryGroupRef = useRef<View>(null);
  const treatmentGroupRef = useRef<View>(null);
  const dateFieldRef = useRef<TextInput>(null);
  const submit = useCallback((): void => {
    if (!isSubmitting) onSubmit();
  }, [isSubmitting, onSubmit]);
  const requestExit = useCallback((): void => {
    if (!isSubmitting) onRequestExit();
  }, [isSubmitting, onRequestExit]);
  const formMetadata = useMemo(
    () => ({
      writingDirection: isRtl ? ("rtl" as const) : ("ltr" as const),
    }),
    [isRtl]
  );
  const categoryMetadata = {
    layoutMode: isStacked ? ("stacked" as const) : ("two-column" as const),
  };
  const submitAreaMetadata = { bottomInset };
  const summaryMetadata = { consequenceOrder: CONSEQUENCE_ORDER };
  const validationMessages = useMemo(
    () =>
      [
        validationErrors.category ? copy.categoryRequired : null,
        validationErrors.treatment ? copy.treatmentRequired : null,
        validationErrors.disposalDate ? copy.dateRequired : null,
      ].filter((message): message is string => message !== null),
    [copy, validationErrors]
  );

  useEffect(() => {
    if (validationMessages.length === 0) return undefined;
    const summaryHandle = findNodeHandle(validationSummaryRef.current);
    if (summaryHandle !== null) {
      AccessibilityInfo.setAccessibilityFocus(summaryHandle);
    }
    const frame = requestAnimationFrame((): void => {
      const firstInvalidTarget = validationErrors.category
        ? categoryGroupRef.current
        : validationErrors.treatment
          ? treatmentGroupRef.current
          : dateFieldRef.current;
      const targetHandle = findNodeHandle(firstInvalidTarget);
      if (targetHandle !== null) {
        AccessibilityInfo.setAccessibilityFocus(targetHandle);
      }
    });
    return (): void => cancelAnimationFrame(frame);
  }, [validationErrors, validationMessages.length]);

  return (
    <KeyboardAvoidingView
      testID="metal-holding-dispose-screen"
      className="flex-1 bg-slate-25 dark:bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader
        title={copy.title.replace("{{holdingName}}", holdingName)}
        showBackButton
        onBack={requestExit}
      />
      <View
        testID="dispose-form"
        className="flex-1"
        accessibilityLanguage={locale}
        {...formMetadata}
      >
        {isLoading ? (
          <LoadingState />
        ) : loadError ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Text
              accessibilityRole="alert"
              className="text-center text-text-primary dark:text-text-primary-dark"
            >
              {copy.loadError}
            </Text>
            <TouchableOpacity
              testID="dispose-retry"
              accessibilityRole="button"
              onPress={onRetry}
              className="min-h-12 justify-center rounded-2xl bg-nileGreen-700 px-6 dark:bg-nileGreen-500"
            >
              <Text className="font-semibold text-slate-25 dark:text-slate-950">
                {copy.retryLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            testID="dispose-scroll-content"
            className="min-h-0 flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-6 px-5 py-5"
          >
            <Text className="text-sm leading-6 text-text-secondary dark:text-text-secondary-dark">
              {copy.intro}
            </Text>

            {validationMessages.length > 0 ? (
              <View
                ref={validationSummaryRef}
                testID="dispose-validation-summary"
                accessible
                accessibilityRole="alert"
                accessibilityLabel={validationMessages.join(" ")}
                className="rounded-2xl border border-red-600 p-3 dark:border-red-400"
              >
                <Text className="text-sm text-red-700 dark:text-red-300">
                  {validationMessages.join(" ")}
                </Text>
              </View>
            ) : null}

            <View className="gap-3">
              <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
                {copy.reasonLabel}
              </Text>
              <View
                ref={categoryGroupRef}
                testID="dispose-category-group"
                accessible
                accessibilityRole="radiogroup"
                aria-invalid={Boolean(validationErrors.category)}
                className="flex-row flex-wrap justify-between gap-y-3"
                {...categoryMetadata}
              >
                {CATEGORIES.map((value) => (
                  <ChoiceButton
                    key={value}
                    id={`dispose-category-${value}`}
                    label={copy.categoryLabels[value]}
                    isSelected={category === value}
                    isDisabled={isSubmitting}
                    isStacked={isStacked || value === "other"}
                    onPress={() => onCategoryChange(value)}
                  />
                ))}
              </View>
              {validationErrors.category ? (
                <Text
                  testID="dispose-category-error"
                  accessibilityRole="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {copy.categoryRequired}
                </Text>
              ) : null}
            </View>

            {category === "other" ? (
              <View testID="dispose-treatment-group" className="gap-3">
                <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
                  {copy.otherTreatmentLabel}
                </Text>
                <View
                  ref={treatmentGroupRef}
                  accessible
                  accessibilityRole="radiogroup"
                  className="gap-3"
                >
                  {TREATMENTS.map((value) => (
                    <ChoiceButton
                      key={value}
                      id={`dispose-treatment-${value}`}
                      label={copy.treatmentLabels[value]}
                      isSelected={otherTreatment === value}
                      isDisabled={isSubmitting}
                      isStacked
                      onPress={() => onOtherTreatmentChange(value)}
                    />
                  ))}
                </View>
                {validationErrors.treatment ? (
                  <Text
                    testID="dispose-treatment-error"
                    accessibilityRole="alert"
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    {copy.treatmentRequired}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <TextField
              inputRef={dateFieldRef}
              testID="dispose-date-field"
              label={copy.dateLabel}
              value={disposalDate}
              onChangeText={onDateChange}
              editable={!isSubmitting}
              aria-invalid={Boolean(validationErrors.disposalDate)}
              error={
                validationErrors.disposalDate ? copy.dateRequired : undefined
              }
            />
            <View className="gap-1">
              <TextField
                testID="dispose-notes-field"
                label={copy.notesLabel}
                value={notes}
                onChangeText={onNotesChange}
                editable={!isSubmitting}
                multiline
              />
              <Text className="text-xs text-text-muted dark:text-text-muted-dark">
                {copy.notesOptional}
              </Text>
            </View>

            {hasSummary ? (
              <View
                testID="dispose-live-summary"
                className="gap-2 rounded-2xl border border-nileGreen-200 bg-nileGreen-50 p-4 dark:border-nileGreen-800 dark:bg-slate-900"
                {...summaryMetadata}
              >
                <Text className="text-base font-bold text-nileGreen-900 dark:text-nileGreen-300">
                  {copy.summaryTitle}
                </Text>
                <Text className="text-sm text-text-primary dark:text-text-primary-dark">
                  {copy.reasonLabel}:{" "}
                  {category ? copy.categoryLabels[category] : ""}
                </Text>
                <Text
                  testID={`dispose-summary-${treatment}`}
                  className="text-sm text-text-primary dark:text-text-primary-dark"
                >
                  {treatment === "write_off"
                    ? copy.writeOffSummary
                    : copy.externalTransferSummary}
                </Text>
                <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  {copy.activeOwnershipSummary}
                </Text>
                <Text
                  testID="dispose-summary-no-sale-money-account"
                  className="text-sm text-text-secondary dark:text-text-secondary-dark"
                >
                  {copy.noSaleMoneyOrAccountSummary}
                </Text>
                <Text
                  testID="dispose-summary-no-sale-profit-loss"
                  className="text-sm text-text-secondary dark:text-text-secondary-dark"
                >
                  {copy.noSaleProfitLossSummary}
                </Text>
                <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  {copy.historySummary}
                </Text>
              </View>
            ) : null}

            {submitError ? (
              <View className="gap-3">
                <Text
                  testID="dispose-submit-error"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {submitError}
                </Text>
                <TouchableOpacity
                  testID="dispose-retry"
                  accessibilityRole="button"
                  onPress={onRetry}
                  className="min-h-12 justify-center self-start rounded-2xl border border-red-600 px-4 dark:border-red-400"
                >
                  <Text className="font-semibold text-red-700 dark:text-red-300">
                    {copy.retryLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>

      {!isLoading && !loadError ? (
        <View
          testID="dispose-submit-area"
          className="gap-2 border-t border-slate-200 bg-slate-25 px-5 pt-3 dark:border-slate-800 dark:bg-slate-950"
          style={{ paddingBottom: bottomInset + 12 }}
          {...submitAreaMetadata}
        >
          <TouchableOpacity
            testID="dispose-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            disabled={isSubmitting}
            onPress={submit}
            className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-5 py-3 dark:bg-nileGreen-500"
            style={isSubmitting ? { opacity: 0.55 } : undefined}
          >
            <Text className="text-base font-bold text-slate-25 dark:text-slate-950">
              {isSubmitting ? copy.pendingLabel : copy.submitLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="dispose-cancel"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={requestExit}
            className="min-h-12 items-center justify-center rounded-2xl px-5 py-3"
            style={isSubmitting ? { opacity: 0.55 } : undefined}
          >
            <Text className="font-semibold text-text-secondary dark:text-text-secondary-dark">
              {copy.cancelLabel}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
