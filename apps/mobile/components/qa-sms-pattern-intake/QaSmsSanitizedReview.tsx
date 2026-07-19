import { Ionicons } from "@expo/vector-icons";
import {
  getQaSmsCoverageCurrencies,
  isQaSmsCurrencySupportedForFamily,
  QA_SMS_MESSAGE_FAMILIES,
  QA_SMS_PLACEHOLDER_TOKENS,
  QA_SMS_SEMANTIC_ROLES_BY_TOKEN,
  type QaRawRangeSelection,
  type QaSanitizedCandidateDraft,
  type QaSmsCurrency,
  type QaSmsMessageFamily,
  type QaSmsPlaceholderToken,
  type QaSmsSemanticRole,
} from "@monyvi/logic";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { Skeleton } from "@/components/ui/Skeleton";
import { QaSmsBottomSheetModal } from "./QaSmsBottomSheetModal";
import { QaSmsStickyFooter } from "./QaSmsStickyFooter";
import {
  QaSmsTapRangeSelector,
  type QaSmsTextRange,
} from "./QaSmsTapRangeSelector";

interface QaSmsSanitizedReviewProps {
  readonly draft: QaSanitizedCandidateDraft;
  readonly position: number;
  readonly total: number;
  readonly isLoading: boolean;
  readonly rawPreview: string | null;
  readonly onClassify: (input: {
    readonly messageFamily: QaSmsMessageFamily;
    readonly currency: QaSmsCurrency;
  }) => void;
  readonly onApprove: () => void;
  readonly onDiscard: () => void;
  readonly onEditPlaceholders: () => void;
  readonly onPreviewCorrections: (
    corrections: readonly QaRawRangeSelection[]
  ) => QaSanitizedCandidateDraft;
  readonly onApplyCorrections: (
    corrections: readonly QaRawRangeSelection[]
  ) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly topInset: number;
  readonly bottomInset: number;
}

interface ClassificationSheetProps {
  readonly visible: boolean;
  readonly initialFamily: QaSmsMessageFamily | null;
  readonly initialCurrency: QaSmsCurrency;
  readonly bottomInset: number;
  readonly onCancel: () => void;
  readonly onSave: (input: {
    readonly messageFamily: QaSmsMessageFamily;
    readonly currency: QaSmsCurrency;
  }) => void;
}

const CORRECTION_HEADER_TOP_PADDING = 8;
const MINIMUM_BOTTOM_PADDING = 12;

type QaDraftValidationCode =
  QaSanitizedCandidateDraft["validationFindings"][number]["code"];

const PLACEHOLDER_ROLE_KEYS: Readonly<Record<QaSmsSemanticRole, string>> = {
  transaction_currency: "placeholder_role_transaction_currency",
  transaction_amount: "placeholder_role_transaction_amount",
  available_balance: "placeholder_role_available_balance",
  card_last4: "placeholder_role_card_last4",
  account_reference: "placeholder_role_account_reference",
  source_account_suffix: "placeholder_role_source_account_suffix",
  transaction_reference: "placeholder_role_transaction_reference",
  message_code: "placeholder_role_message_code",
  otp_code: "placeholder_role_otp_code",
  merchant_name: "placeholder_role_merchant_name",
  atm_terminal: "placeholder_role_atm_terminal",
  counterparty_person: "placeholder_role_counterparty_person",
  phone_number: "placeholder_role_phone_number",
  provider_hotline: "placeholder_role_provider_hotline",
  transaction_date: "placeholder_role_transaction_date",
  transaction_time: "placeholder_role_transaction_time",
  promotional_amount: "placeholder_role_promotional_amount",
  promotional_rate: "placeholder_role_promotional_rate",
  campaign_year: "placeholder_role_campaign_year",
  public_url: "placeholder_role_public_url",
  public_reference: "placeholder_role_public_reference",
};

const VALIDATION_FINDING_KEYS = {
  raw_numeric_value: "finding_raw_numeric_value",
  raw_identifier_value: "finding_raw_identifier_value",
  raw_counterparty_value: "finding_raw_counterparty_value",
  raw_email_value: "finding_raw_email_value",
  raw_phone_value: "finding_raw_phone_value",
  raw_date_value: "finding_raw_date_value",
  raw_time_value: "finding_raw_time_value",
  unverified_sender: "finding_unverified_sender",
  unknown_token: "finding_unknown_token",
  ambiguous_dynamic_value: "finding_ambiguous_dynamic_value",
  unknown_dynamic_value: "finding_unknown_dynamic_value",
  classification_required: "finding_classification_required",
  expected_outcome_required: "finding_expected_outcome_required",
  required_placeholder_missing: "finding_required_placeholder_missing",
} as const satisfies Readonly<Record<QaDraftValidationCode, string>>;

interface PlaceholderCorrectionSheetProps {
  readonly rawPreview: string;
  readonly draft: QaSanitizedCandidateDraft;
  readonly topInset: number;
  readonly bottomInset: number;
  readonly onCancel: () => void;
  readonly onPreview: QaSmsSanitizedReviewProps["onPreviewCorrections"];
  readonly onApply: QaSmsSanitizedReviewProps["onApplyCorrections"];
}

function getValidationFindingText(
  t: ReturnType<typeof useTranslation>["t"],
  finding: QaSanitizedCandidateDraft["validationFindings"][number]
): string {
  const key = VALIDATION_FINDING_KEYS[finding.code];
  if (
    finding.code !== "required_placeholder_missing" ||
    finding.semanticRole === null
  ) {
    return t(key);
  }
  return t(key, {
    placeholder: t(PLACEHOLDER_ROLE_KEYS[finding.semanticRole]),
  });
}

function SanitizedTemplate({
  draft,
}: {
  readonly draft: QaSanitizedCandidateDraft;
}): React.JSX.Element {
  return (
    <Text className="text-base leading-8 text-text-primary dark:text-slate-100">
      {draft.segments.map((segment, index) =>
        segment.kind === "fixed" ? (
          <Text key={`${segment.text}-${index}`}>{segment.text}</Text>
        ) : (
          <Text
            key={`${segment.token}-${index}`}
            className="font-semibold text-nileGreen-700 dark:text-nileGreen-400"
          >
            {`<${segment.token}>`}
          </Text>
        )
      )}
    </Text>
  );
}

function PlaceholderCorrectionSheet({
  rawPreview,
  draft,
  topInset,
  bottomInset,
  onCancel,
  onPreview,
  onApply,
}: PlaceholderCorrectionSheetProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [token, setToken] = useState<QaSmsPlaceholderToken>("AMOUNT");
  const [semanticRole, setSemanticRole] =
    useState<QaSmsSemanticRole>("transaction_amount");
  const [selection, setSelection] = useState<QaSmsTextRange | null>(null);
  const [pendingCorrections, setPendingCorrections] = useState<
    readonly QaRawRangeSelection[]
  >([]);
  const [previewDraft, setPreviewDraft] =
    useState<QaSanitizedCandidateDraft>(draft);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const canAdd = selection !== null && selection.end > selection.start;
  const canApply = pendingCorrections.length > 0;
  const semanticRoles = QA_SMS_SEMANTIC_ROLES_BY_TOKEN[
    token
  ] as readonly QaSmsSemanticRole[];

  function selectToken(nextToken: QaSmsPlaceholderToken): void {
    setToken(nextToken);
    setSemanticRole(QA_SMS_SEMANTIC_ROLES_BY_TOKEN[nextToken][0]);
  }

  function previewCorrections(
    corrections: readonly QaRawRangeSelection[]
  ): boolean {
    try {
      setPreviewDraft(
        corrections.length === 0 ? draft : onPreview(corrections)
      );
      setCorrectionError(null);
      return true;
    } catch {
      setCorrectionError("correction_overlap");
      return false;
    }
  }

  function addCorrection(): void {
    if (!canAdd || selection === null) return;
    const correction: QaRawRangeSelection = {
      startOffset: selection.start,
      endOffset: selection.end,
      token,
      semanticRole,
    };
    const next = [
      ...pendingCorrections.filter(
        (current) =>
          current.startOffset !== correction.startOffset ||
          current.endOffset !== correction.endOffset
      ),
      correction,
    ];
    if (!previewCorrections(next)) return;
    setPendingCorrections(next);
    setSelection(null);
  }

  function removeCorrection(index: number): void {
    const next = pendingCorrections.filter(
      (_correction, correctionIndex) => correctionIndex !== index
    );
    if (!previewCorrections(next)) return;
    setPendingCorrections(next);
  }

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View
        testID="qa-sms-placeholder-correction"
        className="flex-1 bg-background px-5 dark:bg-background-dark"
        style={{
          paddingTop: topInset + CORRECTION_HEADER_TOP_PADDING,
          paddingBottom: Math.max(bottomInset, MINIMUM_BOTTOM_PADDING),
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            accessibilityLabel={t("cancel")}
            className="h-11 w-11 items-center justify-center"
            onPress={onCancel}
          >
            <Ionicons name="arrow-back" size={26} color={palette.slate[700]} />
          </TouchableOpacity>
          <Text className="ms-2 text-2xl font-bold text-text-primary dark:text-slate-100">
            {t("correction_title")}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-5"
          showsVerticalScrollIndicator={false}
        >
          <Text className="mt-2 text-sm text-text-secondary dark:text-slate-400">
            {t("correction_description")}
          </Text>
          <Text className="mt-4 text-sm font-semibold text-text-primary dark:text-slate-100">
            {t("select_private_value_help")}
          </Text>
          <QaSmsTapRangeSelector
            value={rawPreview}
            selection={selection}
            clearSelectionLabel={t("clear_selection")}
            onSelectionChange={setSelection}
          />

          <Text className="mt-5 text-sm font-semibold text-text-primary dark:text-slate-100">
            {t("placeholder_type")}
          </Text>
          <ScrollView
            horizontal
            className="mt-2 max-h-12"
            contentContainerClassName="gap-2"
            showsHorizontalScrollIndicator={false}
          >
            {QA_SMS_PLACEHOLDER_TOKENS.map((value) => (
              <TouchableOpacity
                key={value}
                testID={`qa-sms-correction-token-${value.toLowerCase()}`}
                className={`h-11 items-center justify-center overflow-hidden rounded-lg border px-4 ${
                  token === value
                    ? "border-nileGreen-600"
                    : "border-slate-300 dark:border-slate-700"
                }`}
                onPress={() => selectToken(value)}
              >
                {token === value ? (
                  <View
                    testID={`qa-sms-correction-token-${value.toLowerCase()}-selected-background`}
                    className="absolute inset-0 bg-nileGreen-500/10"
                  />
                ) : null}
                <Text className="font-semibold text-text-primary dark:text-slate-100">
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {semanticRoles.length > 1 ? (
            <>
              <Text className="mt-4 text-sm font-semibold text-text-primary dark:text-slate-100">
                {t("placeholder_meaning")}
              </Text>
              <View className="mt-2 flex-row overflow-hidden rounded-lg border border-slate-400">
                {semanticRoles.map((role) => (
                  <TouchableOpacity
                    key={role}
                    testID={`qa-sms-correction-role-${role}`}
                    className="relative min-h-12 flex-1 items-center justify-center overflow-hidden border-e border-slate-400 px-2 last:border-e-0"
                    onPress={() => setSemanticRole(role)}
                  >
                    {semanticRole === role ? (
                      <View
                        testID={`qa-sms-correction-role-${role}-selected-background`}
                        pointerEvents="none"
                        className="absolute inset-0 bg-nileGreen-500/10"
                      />
                    ) : null}
                    <Text className="z-10 text-center text-xs font-semibold text-text-primary dark:text-slate-100">
                      {t(PLACEHOLDER_ROLE_KEYS[role])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          <TouchableOpacity
            testID="qa-sms-add-correction"
            disabled={!canAdd}
            className={`mt-4 min-h-12 items-center justify-center rounded-lg border ${
              canAdd
                ? "border-nileGreen-600"
                : "border-slate-300 dark:border-slate-700"
            }`}
            onPress={addCorrection}
          >
            <Text
              className={`font-semibold ${
                canAdd
                  ? "text-nileGreen-700 dark:text-nileGreen-400"
                  : "text-text-muted dark:text-slate-500"
              }`}
            >
              {t("add_placeholder")}
            </Text>
          </TouchableOpacity>

          {correctionError ? (
            <Text className="mt-3 text-sm text-red-700 dark:text-red-300">
              {t(correctionError)}
            </Text>
          ) : null}

          <Text className="mt-5 text-sm font-semibold text-text-primary dark:text-slate-100">
            {t("sanitized_template_preview")}
          </Text>
          <View className="mt-2 min-h-[96px] rounded-lg border border-slate-300 p-4 dark:border-slate-700">
            <SanitizedTemplate draft={previewDraft} />
          </View>

          {previewDraft.validationFindings.length > 0 ? (
            <View className="mt-3 rounded-lg border border-gold-600/50 bg-gold-100 p-3 dark:bg-gold-800">
              {previewDraft.validationFindings.map((finding) => (
                <Text
                  key={`${finding.code}:${finding.semanticRole ?? "candidate"}:${finding.segmentIndex ?? "candidate"}`}
                  className="pb-1 text-sm text-gold-800 last:pb-0 dark:text-gold-100"
                >
                  {getValidationFindingText(t, finding)}
                </Text>
              ))}
            </View>
          ) : null}

          <Text className="mt-5 text-sm font-semibold text-text-primary dark:text-slate-100">
            {t("pending_changes", { count: pendingCorrections.length })}
          </Text>
          <View className="mt-2 gap-2">
            {pendingCorrections.map((correction, index) => (
              <View
                key={`${correction.startOffset}:${correction.endOffset}`}
                className="flex-row items-center rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <View className="flex-1">
                  <Text className="font-semibold text-text-primary dark:text-slate-100">
                    {`<${correction.token}>`}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-1 text-sm text-text-muted dark:text-slate-400"
                  >
                    {t(PLACEHOLDER_ROLE_KEYS[correction.semanticRole])}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`qa-sms-remove-correction-${index}`}
                  accessibilityLabel={t("remove_pending_change")}
                  className="h-10 w-10 items-center justify-center"
                  onPress={() => removeCorrection(index)}
                >
                  <Ionicons name="close" size={22} color={palette.slate[500]} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className="flex-row gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <TouchableOpacity
            className="min-h-14 flex-1 items-center justify-center rounded-lg border border-nileGreen-600"
            onPress={onCancel}
          >
            <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
              {t("cancel")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="qa-sms-apply-corrections"
            disabled={!canApply}
            className={`min-h-14 flex-1 items-center justify-center rounded-lg ${
              canApply ? "bg-nileGreen-600" : "bg-slate-300 dark:bg-slate-700"
            }`}
            onPress={() => {
              onApply(pendingCorrections);
              onCancel();
            }}
          >
            <Text className="font-semibold text-white">
              {t("apply_changes", { count: pendingCorrections.length })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ClassificationSheet({
  visible,
  initialFamily,
  initialCurrency,
  bottomInset,
  onCancel,
  onSave,
}: ClassificationSheetProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [family, setFamily] = useState<QaSmsMessageFamily | null>(
    initialFamily
  );
  const [currency, setCurrency] = useState<QaSmsCurrency>(initialCurrency);

  useEffect(() => {
    if (!visible) return;
    setFamily(initialFamily);
    setCurrency(initialCurrency);
  }, [initialCurrency, initialFamily, visible]);

  const canSave =
    family !== null && isQaSmsCurrencySupportedForFamily(family, currency);

  return (
    <QaSmsBottomSheetModal
      visible={visible}
      onClose={onCancel}
      bottomInset={bottomInset}
      testID="qa-sms-classification-sheet"
      contentClassName="max-h-[88%]"
    >
      <View className="h-1.5 w-16 self-center rounded-full bg-slate-400" />
      <Text className="mt-7 text-2xl font-bold text-text-primary dark:text-slate-100">
        {t("classify_title")}
      </Text>
      <Text className="mt-2 text-base text-text-secondary dark:text-slate-400">
        {t("classify_description")}
      </Text>

      <ScrollView
        className="mt-5 max-h-[430px] rounded-xl border border-slate-200 px-3 dark:border-slate-700"
        showsVerticalScrollIndicator={false}
      >
        {QA_SMS_MESSAGE_FAMILIES.map((messageFamily) => {
          const isSelected = family === messageFamily;
          return (
            <TouchableOpacity
              key={messageFamily}
              testID={`qa-sms-family-${messageFamily.replaceAll("_", "-")}`}
              className="min-h-14 flex-row items-center border-b border-slate-200 last:border-b-0 dark:border-slate-700"
              onPress={() => {
                setFamily(messageFamily);
                if (
                  !isQaSmsCurrencySupportedForFamily(messageFamily, currency)
                ) {
                  setCurrency(getQaSmsCoverageCurrencies(messageFamily)[0]);
                }
              }}
            >
              <View
                className={`h-7 w-7 items-center justify-center rounded-full border-2 ${
                  isSelected ? "border-nileGreen-600" : "border-slate-400"
                }`}
              >
                {isSelected ? (
                  <View className="h-4 w-4 rounded-full bg-nileGreen-600" />
                ) : null}
              </View>
              <Text
                className={`ms-4 text-base ${
                  isSelected
                    ? "font-semibold text-nileGreen-700 dark:text-nileGreen-400"
                    : "text-text-primary dark:text-slate-100"
                }`}
              >
                {t(`family_${messageFamily}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View className="mt-5 flex-row overflow-hidden rounded-lg border border-slate-400">
        {(["EGP", "USD", null] as const).map((value) => {
          const isSelected = currency === value;
          const isSupported =
            family === null || isQaSmsCurrencySupportedForFamily(family, value);
          const testId = value === null ? "na" : value.toLowerCase();
          return (
            <TouchableOpacity
              key={value ?? "na"}
              testID={`qa-sms-currency-${testId}`}
              disabled={!isSupported}
              className={`relative min-h-12 flex-1 items-center justify-center overflow-hidden border-e border-slate-400 last:border-e-0 ${
                isSupported ? "" : "bg-slate-100 dark:bg-slate-800"
              }`}
              onPress={() => setCurrency(value)}
            >
              {isSelected ? (
                <View
                  pointerEvents="none"
                  testID={`qa-sms-currency-${testId}-selected-background`}
                  className="absolute inset-0 bg-nileGreen-500/10"
                />
              ) : null}
              <Text
                className={`text-base ${
                  isSelected
                    ? "font-semibold text-nileGreen-700 dark:text-nileGreen-400"
                    : !isSupported
                      ? "text-slate-400 dark:text-slate-600"
                      : "text-text-secondary dark:text-slate-300"
                }`}
              >
                {value ?? t("currency_not_applicable")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="mt-3 text-sm leading-5 text-text-muted dark:text-slate-400">
        {t("currency_not_applicable_help")}
      </Text>

      <View className="mt-5 flex-row gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <TouchableOpacity
          className="min-h-14 flex-1 items-center justify-center rounded-lg border border-nileGreen-600"
          onPress={onCancel}
        >
          <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {t("cancel")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="qa-sms-save-classification"
          disabled={!canSave || family === null}
          className={`min-h-14 flex-1 items-center justify-center rounded-lg ${
            canSave ? "bg-nileGreen-600" : "bg-slate-300 dark:bg-slate-700"
          }`}
          onPress={() => {
            if (family !== null && canSave)
              onSave({ messageFamily: family, currency });
          }}
        >
          <Text className="text-base font-semibold text-white">
            {t("save_classification")}
          </Text>
        </TouchableOpacity>
      </View>
    </QaSmsBottomSheetModal>
  );
}

function ReviewSkeleton(): React.JSX.Element {
  return (
    <View testID="qa-sms-review-skeleton" className="gap-4 px-5 pt-5">
      <Skeleton width="100%" height={110} />
      <Skeleton width="100%" height={170} />
      <Skeleton width="100%" height={52} />
    </View>
  );
}

export function QaSmsSanitizedReview({
  draft,
  position,
  total,
  isLoading,
  rawPreview,
  onClassify,
  onApprove,
  onDiscard,
  onEditPlaceholders,
  onPreviewCorrections,
  onApplyCorrections,
  onPrevious,
  onNext,
  topInset,
  bottomInset,
}: QaSmsSanitizedReviewProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [isClassificationOpen, setClassificationOpen] = useState(false);
  const [isCorrectionOpen, setCorrectionOpen] = useState(false);
  const familyLabel = draft.messageFamily
    ? t(`family_${draft.messageFamily}`)
    : t("classification_required");
  const canApprove =
    draft.status === "validated" && draft.validationFindings.length === 0;
  const isPreviousDisabled = position <= 1;
  const isNextDisabled = position >= total;
  const template = useMemo(
    () =>
      draft.segments.map((segment, index) =>
        segment.kind === "fixed" ? (
          <Text key={`${segment.text}-${index}`}>{segment.text}</Text>
        ) : (
          <Text
            key={`${segment.token}-${index}`}
            className="font-semibold text-nileGreen-700 dark:text-nileGreen-400"
          >
            {`<${segment.token}>`}
          </Text>
        )
      ),
    [draft.segments]
  );

  if (isLoading) return <ReviewSkeleton />;

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        <Text className="mt-3 text-center text-base text-text-secondary dark:text-slate-400">
          {t("step_review")}
        </Text>
        <View className="mt-2 h-1.5 flex-row gap-1.5">
          <View className="flex-1 rounded-full bg-nileGreen-600" />
          <View className="flex-1 rounded-full bg-nileGreen-600" />
          <View className="flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
        </View>

        <TouchableOpacity
          testID="qa-sms-classification-summary"
          className="mt-5 min-h-[92px] flex-row items-center rounded-lg border border-slate-200 px-4 dark:border-slate-700"
          onPress={() => setClassificationOpen(true)}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-nileGreen-500/10">
            <Ionicons
              name="pricetag-outline"
              size={24}
              color={palette.nileGreen[600]}
            />
          </View>
          <View className="ms-4 flex-1">
            <Text className="text-base font-semibold text-text-primary dark:text-slate-100">
              {t("family_label")} - {familyLabel}
            </Text>
            <Text className="mt-1 text-base text-text-secondary dark:text-slate-400">
              {t("currency_label")} -{" "}
              {draft.currency ?? t("currency_not_applicable")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={palette.slate[500]}
          />
        </TouchableOpacity>

        <View className="mt-4 min-h-[72px] flex-row items-center rounded-lg border border-slate-200 px-4 dark:border-slate-700">
          <Ionicons
            name="shield-checkmark-outline"
            size={25}
            color={palette.nileGreen[600]}
          />
          <View className="ms-4">
            <Text className="text-sm text-text-muted dark:text-slate-400">
              {t("verified_sender")}
            </Text>
            <Text className="mt-1 text-base font-semibold text-text-primary dark:text-slate-100">
              {draft.verifiedSenderAlias ?? t("sender_not_verified")}
            </Text>
          </View>
        </View>

        <View className="mb-3 mt-6 flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-lg font-semibold text-text-primary dark:text-slate-100">
            {t("sanitized_template")}
          </Text>
          <View className="rounded-md border border-nileGreen-600 bg-nileGreen-500/10 px-3 py-1">
            <Text
              testID="qa-sms-template-currency"
              className="text-sm font-semibold text-nileGreen-800 dark:text-nileGreen-400"
            >
              {draft.currency ?? t("currency_not_applicable")}
            </Text>
          </View>
        </View>
        <View className="min-h-[140px] justify-center rounded-lg border border-dashed border-slate-300 p-5 dark:border-slate-700">
          <Text className="text-base leading-9 text-text-primary dark:text-slate-100">
            {template}
          </Text>
        </View>

        <View className="mt-4 flex-row items-center rounded-lg border border-nileGreen-500/30 bg-nileGreen-500/10 p-4">
          <Ionicons
            name="shield-checkmark"
            size={24}
            color={palette.nileGreen[600]}
          />
          <Text className="ms-3 text-sm font-medium text-nileGreen-700 dark:text-nileGreen-400">
            {draft.validationFindings.length === 0
              ? t("privacy_passed")
              : t("privacy_blocked")}
          </Text>
        </View>
        {draft.validationFindings.length > 0 ? (
          <View
            testID="qa-sms-validation-findings"
            accessibilityRole="alert"
            className="mt-3 rounded-lg border border-gold-600/50 bg-gold-100 p-4 dark:bg-gold-800"
          >
            {draft.validationFindings.map((finding) => (
              <View
                key={`${finding.code}:${finding.segmentIndex ?? "candidate"}`}
                className="flex-row items-start pb-2 last:pb-0"
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={palette.gold[600]}
                />
                <Text className="ms-2 flex-1 text-sm leading-5 text-gold-800 dark:text-gold-100">
                  {getValidationFindingText(t, finding)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          className="mt-4 min-h-12 flex-row items-center justify-center rounded-lg border border-nileGreen-600"
          disabled={rawPreview === null}
          onPress={() => {
            onEditPlaceholders();
            setCorrectionOpen(true);
          }}
        >
          <Ionicons
            name="create-outline"
            size={21}
            color={palette.nileGreen[600]}
          />
          <Text className="ms-2 text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {t("edit_placeholders")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="qa-sms-discard-candidate"
          className="mt-3 min-h-12 items-center justify-center rounded-lg border border-red-500"
          onPress={onDiscard}
        >
          <Text className="text-base font-semibold text-red-700 dark:text-red-300">
            {t("discard_candidate")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!canApprove}
          className={`mb-5 mt-3 min-h-14 flex-row items-center justify-center rounded-lg ${
            canApprove ? "bg-nileGreen-600" : "bg-slate-300 dark:bg-slate-700"
          }`}
          onPress={onApprove}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={22}
            color={palette.slate[25]}
          />
          <Text className="ms-2 text-base font-semibold text-white">
            {t("approve_candidate")}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <QaSmsStickyFooter
        testID="qa-sms-review-pagination"
        bottomInset={bottomInset}
        className="flex-row items-center justify-center gap-10 border-t border-slate-200 px-5 pt-3 dark:border-slate-800"
      >
        <TouchableOpacity
          testID="qa-sms-previous-candidate"
          disabled={isPreviousDisabled}
          accessibilityState={{ disabled: isPreviousDisabled }}
          onPress={onPrevious}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={
              isPreviousDisabled ? palette.slate[400] : palette.nileGreen[600]
            }
          />
        </TouchableOpacity>
        <Text className="text-sm text-text-secondary dark:text-slate-400">
          {t("candidate_position", { position, total })}
        </Text>
        <TouchableOpacity
          testID="qa-sms-next-candidate"
          disabled={isNextDisabled}
          accessibilityState={{ disabled: isNextDisabled }}
          onPress={onNext}
        >
          <Ionicons
            name="chevron-forward"
            size={26}
            color={isNextDisabled ? palette.slate[400] : palette.nileGreen[600]}
          />
        </TouchableOpacity>
      </QaSmsStickyFooter>

      <ClassificationSheet
        visible={isClassificationOpen}
        initialFamily={draft.messageFamily}
        initialCurrency={draft.currency}
        bottomInset={bottomInset}
        onCancel={() => setClassificationOpen(false)}
        onSave={(classification) => {
          onClassify(classification);
          setClassificationOpen(false);
        }}
      />
      {isCorrectionOpen && rawPreview !== null ? (
        <PlaceholderCorrectionSheet
          rawPreview={rawPreview}
          draft={draft}
          topInset={topInset}
          bottomInset={bottomInset}
          onCancel={() => setCorrectionOpen(false)}
          onPreview={onPreviewCorrections}
          onApply={onApplyCorrections}
        />
      ) : null}
    </View>
  );
}

export type { QaSmsSanitizedReviewProps };
