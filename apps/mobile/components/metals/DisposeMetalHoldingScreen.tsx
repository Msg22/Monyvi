import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  DISPOSE_CATEGORIES,
  DISPOSE_CONSEQUENCE_ORDER,
  DISPOSE_TREATMENTS,
  CategoryTile,
  RequiredMark,
  SummaryRow,
  TreatmentOption,
  formatDisposalDate,
  parseDisposalDate,
  toDisposalDateOnlyString,
  type DisposeChoiceButtonHandle,
} from "@/components/metals/dispose-form-presentation";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/constants/colors";
import { shouldUseCompactLayout } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import type {
  DisposeCategory,
  DisposeTreatment,
} from "@/services/dispose-metal-holding-command-service";

export const DISPOSE_METAL_HOLDING_COPY_KEYS = Object.freeze({
  title: "dispose.title",
  intro: "dispose.intro",
  whatHappened: "dispose.whatHappened",
  affectsRecords: "dispose.affectsRecords",
  categories: Object.freeze({
    lost_or_stolen: "dispose.categories.lostOrStolen",
    destroyed_or_damaged: "dispose.categories.destroyedOrDamaged",
    given_away: "dispose.categories.givenAway",
    donated: "dispose.categories.donated",
    other: "dispose.categories.other",
  }),
  treatments: Object.freeze({
    write_off: "dispose.treatments.writeOff",
    external_transfer: "dispose.treatments.externalTransfer",
  }),
  treatmentDescriptions: Object.freeze({
    write_off: "dispose.treatments.writeOffDescription",
    external_transfer: "dispose.treatments.externalTransferDescription",
  }),
  dateLabel: "dispose.dateLabel",
  notesLabel: "dispose.notesLabel",
  notesTooLong: "dispose.notesTooLong",
  summaryTitle: "dispose.summaryTitle",
  writeOffSummary: "dispose.writeOffSummary",
  externalTransferSummary: "dispose.externalTransferSummary",
  activeOwnershipSummary: "dispose.activeOwnershipSummary",
  historySummary: "dispose.historySummary",
  noSaleMoneyOrAccountSummary: "dispose.noSaleMoneyOrAccountSummary",
  noSaleProfitLossSummary: "dispose.noSaleProfitLossSummary",
  rateEvidenceUnavailable: "dispose.rateEvidenceUnavailable",
  ratePendingLabel: "dispose.ratePendingLabel",
  submitLabel: "dispose.submitLabel",
  pendingLabel: "dispose.pendingLabel",
  cancelLabel: "dispose.cancelLabel",
  retryLabel: "dispose.retryLabel",
  loadError: "dispose.loadError",
  categoryRequired: "dispose.categoryRequired",
  treatmentRequired: "dispose.treatmentRequired",
  dateRequired: "dispose.dateRequired",
  dateInvalid: "dispose.dateInvalid",
  dateBeforeAcquisition: "dispose.dateBeforeAcquisition",
  submitFailed: "dispose.submitFailed",
  submitErrors: Object.freeze({
    metal_holding_not_found: "dispose.submitErrors.holdingNotFound",
    metal_holding_not_active: "dispose.submitErrors.holdingNotActive",
    holding_revision_conflict: "dispose.submitErrors.revisionConflict",
    financial_action_auth_scope_changed:
      "dispose.submitErrors.authScopeChanged",
    metal_dispose_effective_active_holding_required:
      "dispose.submitErrors.notEffectiveHolding",
    metal_dispose_lifecycle_conflict: "dispose.submitErrors.lifecycleConflict",
    metal_dispose_date_before_acquisition:
      "dispose.submitErrors.dateBeforeAcquisition",
    metal_dispose_replay_requires_recovery:
      "dispose.submitErrors.recoveryRequired",
  }),
});

export const DISPOSE_SUBMISSION_ERROR_CODES = Object.freeze([
  "metal_holding_not_found",
  "metal_holding_not_active",
  "holding_revision_conflict",
  "financial_action_auth_scope_changed",
  "metal_dispose_effective_active_holding_required",
  "metal_dispose_lifecycle_conflict",
  "metal_dispose_date_before_acquisition",
  "metal_dispose_replay_requires_recovery",
] as const);

export interface DisposeMetalHoldingCopy {
  readonly title: string;
  readonly intro: string;
  readonly whatHappened: string;
  readonly affectsRecords: string;
  readonly categoryLabels: Readonly<Record<DisposeCategory, string>>;
  readonly treatmentLabels: Readonly<Record<DisposeTreatment, string>>;
  readonly treatmentDescriptions: Readonly<Record<DisposeTreatment, string>>;
  readonly dateLabel: string;
  readonly notesLabel: string;
  readonly notesTooLong: string;
  readonly summaryTitle: string;
  readonly writeOffSummary: string;
  readonly externalTransferSummary: string;
  readonly activeOwnershipSummary: string;
  readonly historySummary: string;
  readonly noSaleMoneyOrAccountSummary: string;
  readonly noSaleProfitLossSummary: string;
  readonly rateEvidenceUnavailable: string;
  readonly ratePendingLabel: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel: string;
  readonly retryLabel: string;
  readonly loadError: string;
  readonly categoryRequired: string;
  readonly treatmentRequired: string;
  readonly dateRequired: string;
  readonly dateInvalid: string;
  readonly dateBeforeAcquisition: string;
  readonly submitFailed: string;
  readonly submitErrorMessages: Readonly<Record<string, string>>;
}

export interface DisposeMetalHoldingScreenProps {
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
  readonly rateEvidenceError?: string | null;
  readonly isLoading?: boolean;
  readonly isRateLoading?: boolean;
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

function dateValidationMessage(
  code: string | undefined,
  copy: DisposeMetalHoldingCopy
): string {
  if (code === "dispose_date_before_acquisition") {
    return copy.dateBeforeAcquisition;
  }
  if (code === "dispose_date_invalid") {
    return copy.dateInvalid;
  }
  return copy.dateRequired;
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
  rateEvidenceError = null,
  isLoading = false,
  isRateLoading = false,
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
  const { isDark } = useTheme();
  const iconColor = isDark ? palette.slate[300] : palette.slate[500];
  const checkColor = isDark ? palette.nileGreen[400] : palette.nileGreen[700];
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const validationSummaryRef = useRef<View>(null);
  const firstCategoryRef = useRef<DisposeChoiceButtonHandle>(null);
  const firstTreatmentRef = useRef<DisposeChoiceButtonHandle>(null);
  const dateFieldRef = useRef<TextInput>(null);
  const notesFieldRef = useRef<TextInput>(null);
  const rateEvidenceErrorRef = useRef<View>(null);
  const submitErrorRef = useRef<Text>(null);
  const submit = useCallback((): void => {
    if (!isSubmitting && !isRateLoading) onSubmit();
  }, [isSubmitting, isRateLoading, onSubmit]);
  const requestExit = useCallback((): void => {
    if (!isSubmitting) onRequestExit();
  }, [isSubmitting, onRequestExit]);
  const handleDisposalDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date): void => {
      if (event.type === "dismissed") {
        setIsDatePickerOpen(false);
        return;
      }
      setIsDatePickerOpen(Platform.OS === "ios");
      if (selectedDate) onDateChange(toDisposalDateOnlyString(selectedDate));
    },
    [onDateChange]
  );
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
  const summaryMetadata = { consequenceOrder: DISPOSE_CONSEQUENCE_ORDER };
  const submitErrorMessage = submitError
    ? (copy.submitErrorMessages[submitError] ?? copy.submitFailed)
    : null;
  const validationMessages = useMemo(
    () =>
      [
        validationErrors.category ? copy.categoryRequired : null,
        validationErrors.treatment ? copy.treatmentRequired : null,
        validationErrors.disposalDate
          ? dateValidationMessage(validationErrors.disposalDate, copy)
          : null,
        validationErrors.notes ? copy.notesTooLong : null,
        validationErrors.rateEvidence && rateEvidenceError
          ? copy.rateEvidenceUnavailable
          : null,
      ].filter((message): message is string => message !== null),
    [copy, rateEvidenceError, validationErrors]
  );

  useEffect(() => {
    if (validationMessages.length === 0) return undefined;
    const summaryHandle = findNodeHandle(validationSummaryRef.current);
    if (summaryHandle !== null) {
      AccessibilityInfo.setAccessibilityFocus(summaryHandle);
    }
    const frame = requestAnimationFrame((): void => {
      const firstInvalidTarget = validationErrors.category
        ? firstCategoryRef.current
        : validationErrors.treatment
          ? firstTreatmentRef.current
          : validationErrors.disposalDate
            ? dateFieldRef.current
            : validationErrors.notes
              ? notesFieldRef.current
              : validationErrors.rateEvidence
                ? rateEvidenceErrorRef.current
                : dateFieldRef.current;
      const targetHandle = findNodeHandle(firstInvalidTarget);
      if (targetHandle !== null) {
        AccessibilityInfo.setAccessibilityFocus(targetHandle);
      }
    });
    return (): void => cancelAnimationFrame(frame);
  }, [validationErrors, validationMessages.length]);

  useEffect(() => {
    if (!submitError) return undefined;
    const frame = requestAnimationFrame((): void => {
      const handle = findNodeHandle(submitErrorRef.current);
      if (handle !== null) {
        AccessibilityInfo.setAccessibilityFocus(handle);
      }
    });
    return (): void => cancelAnimationFrame(frame);
  }, [submitError]);

  return (
    <KeyboardAvoidingView
      testID="metal-holding-dispose-screen"
      className="flex-1 bg-slate-25 dark:bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader title={copy.title} showBackButton onBack={requestExit} />
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
            <View testID="dispose-intro-reason-group" className="gap-4">
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
                <Text className="text-base font-bold text-text-primary dark:text-text-primary-dark">
                  {copy.whatHappened}
                  <RequiredMark testID="dispose-required-reason" />
                </Text>
                <View
                  testID="dispose-category-group"
                  accessibilityRole="radiogroup"
                  accessibilityLabel={`${copy.whatHappened}, ${copy.categoryRequired}`}
                  aria-invalid={Boolean(validationErrors.category)}
                  className="flex-row flex-wrap justify-between gap-y-3"
                  {...categoryMetadata}
                >
                  {DISPOSE_CATEGORIES.map((value, index) => (
                    <CategoryTile
                      key={value}
                      id={`dispose-category-${value}`}
                      iconTestID={`dispose-category-icon-${value}`}
                      showsSelectedIndicator
                      label={copy.categoryLabels[value]}
                      isSelected={category === value}
                      isDisabled={isSubmitting}
                      isStacked={isStacked || value === "other"}
                      iconColor={iconColor}
                      reason={value}
                      buttonRef={index === 0 ? firstCategoryRef : undefined}
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
            </View>

            {category === "other" ? (
              <View testID="dispose-treatment-group" className="gap-3">
                <Text className="text-base font-bold text-text-primary dark:text-text-primary-dark">
                  {copy.affectsRecords}
                  <RequiredMark testID="dispose-required-treatment" />
                </Text>
                <View accessibilityRole="radiogroup" className="gap-3">
                  {DISPOSE_TREATMENTS.map((value, index) => (
                    <TreatmentOption
                      key={value}
                      id={`dispose-treatment-${value}`}
                      descriptionTestID={`dispose-treatment-description-${value}`}
                      label={copy.treatmentLabels[value]}
                      description={copy.treatmentDescriptions[value]}
                      isSelected={otherTreatment === value}
                      isDisabled={isSubmitting}
                      buttonRef={index === 0 ? firstTreatmentRef : undefined}
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

            <View className="gap-1">
              <TouchableOpacity
                testID="dispose-date-field"
                accessibilityRole="button"
                accessibilityLabel={copy.dateLabel}
                disabled={isSubmitting}
                onPress={() => setIsDatePickerOpen((isOpen) => !isOpen)}
              >
                <View pointerEvents="none">
                  <TextField
                    variant="outlined"
                    inputRef={dateFieldRef}
                    testID="dispose-date-input"
                    label={copy.dateLabel}
                    required
                    value={formatDisposalDate(disposalDate, locale)}
                    editable={false}
                    aria-invalid={Boolean(validationErrors.disposalDate)}
                    error={
                      validationErrors.disposalDate
                        ? dateValidationMessage(
                            validationErrors.disposalDate,
                            copy
                          )
                        : undefined
                    }
                    trailingAdornment={
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={palette.slate[500]}
                      />
                    }
                    containerClassName=""
                  />
                </View>
              </TouchableOpacity>
            </View>
            {isDatePickerOpen && !isSubmitting ? (
              <DateTimePicker
                testID="dispose-date-picker"
                value={parseDisposalDate(disposalDate) ?? new Date()}
                maximumDate={new Date()}
                mode="date"
                display="default"
                onChange={handleDisposalDateChange}
              />
            ) : null}
            <View className="gap-1">
              <TextField
                inputRef={notesFieldRef}
                testID="dispose-notes-field"
                label={copy.notesLabel}
                value={notes}
                onChangeText={onNotesChange}
                editable={!isSubmitting}
                multiline
                aria-invalid={Boolean(validationErrors.notes)}
                error={validationErrors.notes ? copy.notesTooLong : undefined}
              />
            </View>

            {rateEvidenceError ? (
              <View
                ref={rateEvidenceErrorRef}
                accessibilityRole="alert"
                className="gap-2 rounded-2xl border border-red-600 p-3 dark:border-red-400"
              >
                <Text
                  testID="dispose-rate-evidence-error"
                  className="text-sm text-red-700 dark:text-red-300"
                >
                  {copy.rateEvidenceUnavailable}
                </Text>
                <TouchableOpacity
                  testID="dispose-rate-evidence-retry"
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={onRetry}
                  className="min-h-12 justify-center self-start rounded-2xl border border-red-600 px-4 dark:border-red-400"
                >
                  <Text className="font-semibold text-red-700 dark:text-red-300">
                    {copy.retryLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {hasSummary ? (
              <View
                testID="dispose-live-summary"
                className="gap-2 rounded-2xl border border-nileGreen-100 bg-nileGreen-50 p-4 dark:border-nileGreen-800 dark:bg-slate-900"
                {...summaryMetadata}
              >
                <Text className="text-base font-bold text-nileGreen-900 dark:text-nileGreen-400">
                  {copy.summaryTitle}
                </Text>
                <SummaryRow
                  checkColor={checkColor}
                  testID={`dispose-summary-${treatment}`}
                >
                  {treatment === "write_off"
                    ? copy.writeOffSummary
                    : copy.externalTransferSummary}
                </SummaryRow>
                <SummaryRow checkColor={checkColor}>
                  {copy.activeOwnershipSummary}
                </SummaryRow>
                <SummaryRow
                  checkColor={checkColor}
                  testID="dispose-summary-no-sale-money-account"
                >
                  {copy.noSaleMoneyOrAccountSummary}
                </SummaryRow>
                <SummaryRow
                  checkColor={checkColor}
                  testID="dispose-summary-no-sale-profit-loss"
                >
                  {copy.noSaleProfitLossSummary}
                </SummaryRow>
                <SummaryRow checkColor={checkColor}>
                  {copy.historySummary}
                </SummaryRow>
              </View>
            ) : null}

            {submitErrorMessage ? (
              <View className="gap-3">
                <Text
                  ref={submitErrorRef}
                  testID="dispose-submit-error"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {submitErrorMessage}
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
            accessibilityState={{
              disabled: isSubmitting || isRateLoading,
              busy: isSubmitting || isRateLoading,
            }}
            disabled={isSubmitting || isRateLoading}
            onPress={submit}
            className="min-h-12 items-center justify-center rounded-2xl bg-nileGreen-700 px-5 py-3 dark:bg-nileGreen-500"
            style={
              isSubmitting || isRateLoading ? { opacity: 0.55 } : undefined
            }
          >
            <Text className="text-base font-bold text-slate-25 dark:text-slate-950">
              {isSubmitting
                ? copy.pendingLabel
                : isRateLoading
                  ? copy.ratePendingLabel
                  : copy.submitLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="dispose-cancel"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={requestExit}
            className="min-h-12 items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 dark:border-slate-600"
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
