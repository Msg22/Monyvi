import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Ref,
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
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { shouldUseCompactLayout } from "@/constants/ui";
import type {
  DisposeCategory,
  DisposeRateRole,
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
  rateEvidenceTitle: "dispose.rateEvidenceTitle",
  rateRoles: Object.freeze({
    terminal_metal: "dispose.rateRoles.terminalMetal",
    terminal_purchase_currency: "dispose.rateRoles.terminalPurchaseCurrency",
  }),
  rateFreshness: Object.freeze({
    fresh: "dispose.rateFreshness.fresh",
    stale: "dispose.rateFreshness.stale",
    unknown: "dispose.rateFreshness.unknown",
  }),
  rateAcknowledgment: "dispose.rateAcknowledgment",
  rateAcknowledgmentRequired: "dispose.rateAcknowledgmentRequired",
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
  readonly rateEvidenceTitle: string;
  readonly rateRoles: Readonly<Record<DisposeRateRole, string>>;
  readonly rateFreshness: Readonly<
    Record<"fresh" | "stale" | "unknown", string>
  >;
  readonly rateAcknowledgment: string;
  readonly rateAcknowledgmentRequired: string;
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

export interface DisposeRateEvidenceDisplay {
  readonly role: DisposeRateRole;
  readonly valueLabel: string;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly sourceLabel: string;
  readonly observedLabel: string;
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
  readonly rateEvidence?: readonly DisposeRateEvidenceDisplay[];
  readonly requiresRateAcknowledgment?: boolean;
  readonly rateAcknowledged?: boolean;
  readonly isLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly loadError?: string | null;
  readonly submitError?: string | null;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onCategoryChange: (category: DisposeCategory) => void;
  readonly onOtherTreatmentChange: (treatment: DisposeTreatment) => void;
  readonly onDateChange: (value: string) => void;
  readonly onNotesChange: (value: string) => void;
  readonly onRateAcknowledgmentChange?: (acknowledged: boolean) => void;
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

type ChoiceButtonHandle = React.ComponentRef<typeof TouchableOpacity>;

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

function ChoiceButton(props: {
  readonly id: string;
  readonly label: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isStacked: boolean;
  readonly buttonRef?: Ref<ChoiceButtonHandle>;
  readonly onPress: () => void;
}): React.JSX.Element {
  const className = props.isStacked
    ? "min-h-12 w-full justify-center rounded-2xl border border-slate-300 bg-slate-25 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
    : "min-h-12 w-[48%] justify-center rounded-2xl border border-slate-300 bg-slate-25 px-4 py-3 dark:border-slate-700 dark:bg-slate-900";
  return (
    <TouchableOpacity
      ref={props.buttonRef}
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
  rateEvidence = [],
  requiresRateAcknowledgment = false,
  rateAcknowledged = false,
  isLoading = false,
  isSubmitting = false,
  loadError = null,
  submitError = null,
  validationErrors = {},
  onCategoryChange,
  onOtherTreatmentChange,
  onDateChange,
  onNotesChange,
  onRateAcknowledgmentChange,
  onSubmit,
  onRequestExit,
  onRetry,
}: DisposeMetalHoldingScreenProps): React.JSX.Element {
  const isStacked = shouldUseCompactLayout(width, fontScale);
  const hasSummary = category !== null && treatment !== null;
  const validationSummaryRef = useRef<View>(null);
  const firstCategoryRef = useRef<ChoiceButtonHandle>(null);
  const firstTreatmentRef = useRef<ChoiceButtonHandle>(null);
  const dateFieldRef = useRef<TextInput>(null);
  const submitErrorRef = useRef<View>(null);
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
        validationErrors.rateAcknowledgment
          ? copy.rateAcknowledgmentRequired
          : null,
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
        ? firstCategoryRef.current
        : validationErrors.treatment
          ? firstTreatmentRef.current
          : validationErrors.rateAcknowledgment
            ? null
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
                testID="dispose-category-group"
                accessibilityRole="radiogroup"
                aria-invalid={Boolean(validationErrors.category)}
                className="flex-row flex-wrap justify-between gap-y-3"
                {...categoryMetadata}
              >
                {CATEGORIES.map((value, index) => (
                  <ChoiceButton
                    key={value}
                    id={`dispose-category-${value}`}
                    label={copy.categoryLabels[value]}
                    isSelected={category === value}
                    isDisabled={isSubmitting}
                    isStacked={isStacked || value === "other"}
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

            {category === "other" ? (
              <View testID="dispose-treatment-group" className="gap-3">
                <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
                  {copy.otherTreatmentLabel}
                </Text>
                <View accessibilityRole="radiogroup" className="gap-3">
                  {TREATMENTS.map((value, index) => (
                    <ChoiceButton
                      key={value}
                      id={`dispose-treatment-${value}`}
                      label={copy.treatmentLabels[value]}
                      isSelected={otherTreatment === value}
                      isDisabled={isSubmitting}
                      isStacked
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

            <TextField
              inputRef={dateFieldRef}
              testID="dispose-date-field"
              label={copy.dateLabel}
              value={disposalDate}
              onChangeText={onDateChange}
              editable={!isSubmitting}
              aria-invalid={Boolean(validationErrors.disposalDate)}
              error={
                validationErrors.disposalDate
                  ? dateValidationMessage(validationErrors.disposalDate, copy)
                  : undefined
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

            {rateEvidence.length > 0 ? (
              <View
                testID="dispose-rate-evidence"
                className="gap-2 rounded-2xl border border-nileGreen-200 bg-nileGreen-50 p-4 dark:border-nileGreen-800 dark:bg-slate-900"
              >
                <Text className="text-base font-bold text-nileGreen-900 dark:text-nileGreen-300">
                  {copy.rateEvidenceTitle}
                </Text>
                {rateEvidence.map((reference) => (
                  <View
                    key={reference.role}
                    testID={`dispose-rate-evidence-${reference.role}`}
                    accessibilityRole="summary"
                    className="gap-1"
                  >
                    <Text className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
                      {copy.rateRoles[reference.role]}: {reference.valueLabel}
                    </Text>
                    <Text
                      testID={`dispose-rate-freshness-${reference.role}`}
                      className="text-xs text-text-secondary dark:text-text-secondary-dark"
                    >
                      {copy.rateFreshness[reference.freshness]} ·{" "}
                      {reference.sourceLabel} · {reference.observedLabel}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {requiresRateAcknowledgment ? (
              <TouchableOpacity
                testID="dispose-rate-acknowledgment"
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: rateAcknowledged,
                  disabled: isSubmitting,
                }}
                disabled={isSubmitting}
                onPress={(): void =>
                  onRateAcknowledgmentChange?.(!rateAcknowledged)
                }
                className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-slate-300 px-4 dark:border-slate-700"
              >
                <Text className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
                  {copy.rateAcknowledgment}
                </Text>
              </TouchableOpacity>
            ) : null}
            {validationErrors.rateAcknowledgment ? (
              <Text
                testID="dispose-rate-acknowledgment-error"
                accessibilityRole="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {copy.rateAcknowledgmentRequired}
              </Text>
            ) : null}

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
