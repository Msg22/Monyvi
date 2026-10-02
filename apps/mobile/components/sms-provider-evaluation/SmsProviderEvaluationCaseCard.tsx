import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { palette } from "@/constants/colors";
import type {
  SmsEvaluationCaseViewModel,
  SmsEvaluationExpectedDisplay,
  SmsEvaluationFieldViewModel,
  SmsEvaluationParsedDisplay,
} from "./presentation";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function formatPrimitive(value: unknown, t: TranslateFn): string {
  if (value === undefined || value === null) {
    return t("sms_provider_evaluation.not_provided");
  }
  if (typeof value === "boolean") {
    return value
      ? t("sms_provider_evaluation.yes")
      : t("sms_provider_evaluation.no");
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return Object.prototype.toString.call(value);
}

function formatExpected(
  value: SmsEvaluationExpectedDisplay,
  t: TranslateFn
): string {
  if (value.kind === "not_asserted") {
    return t("sms_provider_evaluation.not_asserted");
  }
  if (value.kind === "diagnostic") {
    return t("sms_provider_evaluation.diagnostic_range", {
      minimum: value.minimum,
      maximum: value.maximum,
    });
  }
  return value.values.map((item) => formatPrimitive(item, t)).join(" / ");
}

function formatParsed(
  value: SmsEvaluationParsedDisplay,
  t: TranslateFn
): string {
  if (value.kind === "unavailable") {
    return t("sms_provider_evaluation.unavailable");
  }
  if (value.kind === "not_provided") {
    return t("sms_provider_evaluation.not_provided");
  }
  return formatPrimitive(value.value, t);
}

function OutcomeBadge({
  item,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly t: TranslateFn;
}): React.JSX.Element {
  const background =
    item.outcome === "matched"
      ? "bg-nileGreen-50 dark:bg-nileGreen-900"
      : item.outcome === "mismatched"
        ? "bg-red-100 dark:bg-slate-700"
        : "bg-gold-100 dark:bg-gold-800/30";
  const text =
    item.outcome === "matched"
      ? "text-nileGreen-600 dark:text-nileGreen-400"
      : item.outcome === "mismatched"
        ? "text-red-600 dark:text-red-500"
        : "text-gold-600 dark:text-gold-400";
  return (
    <View className={`rounded-lg px-2.5 py-1 ${background}`}>
      <Text className={`text-xs font-semibold ${text}`}>
        {t(`sms_provider_evaluation.outcome.${item.outcome}`)}
      </Text>
    </View>
  );
}

function ComparisonValue({
  label,
  value,
  isIssue,
}: {
  readonly label: string;
  readonly value: string;
  readonly isIssue: boolean;
}): React.JSX.Element {
  return (
    <View className="flex-1">
      <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </Text>
      <Text
        className={
          isIssue
            ? "mt-1 text-xs text-red-600 dark:text-red-500"
            : "mt-1 text-xs text-slate-900 dark:text-slate-25"
        }
      >
        {value}
      </Text>
    </View>
  );
}

function FieldComparisonRow({
  field,
  isCompact,
  t,
}: {
  readonly field: SmsEvaluationFieldViewModel;
  readonly isCompact: boolean;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="border-t border-slate-200 py-3 dark:border-slate-700">
      <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {t(`sms_provider_evaluation.fields.${field.key}`)}
      </Text>
      <View className={isCompact ? "mt-2 gap-3" : "mt-2 flex-row gap-4"}>
        <ComparisonValue
          label={t("sms_provider_evaluation.expected")}
          value={formatExpected(field.expected, t)}
          isIssue={false}
        />
        <ComparisonValue
          label={t("sms_provider_evaluation.parsed")}
          value={formatParsed(field.parsed, t)}
          isIssue={field.isMismatch}
        />
      </View>
      {field.expected.kind === "diagnostic" ? (
        <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t("sms_provider_evaluation.diagnostic_only")}
        </Text>
      ) : null}
    </View>
  );
}

function CaseMetadata({
  item,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="mt-4 gap-1">
      <Text className="text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.sender")}: {item.sender}
      </Text>
      <Text className="text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.provider")}: {item.providerName} (
        {item.providerId})
      </Text>
      <Text className="text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.case_id")}: {item.caseId}
      </Text>
    </View>
  );
}

function actualLabel(item: SmsEvaluationCaseViewModel, t: TranslateFn): string {
  if (item.actualKind === "unavailable") {
    return t("sms_provider_evaluation.unavailable");
  }
  return item.actualKind === "no_transaction"
    ? t("sms_provider_evaluation.no_transaction")
    : t("sms_provider_evaluation.transaction");
}

function OutcomeComparison({
  item,
  isCompact,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly isCompact: boolean;
  readonly t: TranslateFn;
}): React.JSX.Element {
  const expected =
    item.expectedKind === "transaction"
      ? t("sms_provider_evaluation.transaction")
      : t("sms_provider_evaluation.no_transaction");
  return (
    <View className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
        {t("sms_provider_evaluation.outcome_comparison")}
      </Text>
      <View className={isCompact ? "mt-3 gap-3" : "mt-3 flex-row gap-4"}>
        <ComparisonValue
          label={t("sms_provider_evaluation.expected")}
          value={expected}
          isIssue={false}
        />
        <ComparisonValue
          label={t("sms_provider_evaluation.parsed")}
          value={actualLabel(item, t)}
          isIssue={item.outcome === "mismatched"}
        />
      </View>
    </View>
  );
}

function MismatchReasons({
  item,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly t: TranslateFn;
}): React.JSX.Element | null {
  if (item.mismatchFields.length === 0) return null;
  return (
    <View className="mt-4 rounded-xl bg-red-100 p-3 dark:bg-slate-700">
      <Text className="text-xs font-semibold text-red-600 dark:text-red-500">
        {t("sms_provider_evaluation.mismatch_reasons")}
      </Text>
      {item.mismatchFields.map((field) => (
        <Text
          key={field}
          className="mt-1 text-xs text-red-600 dark:text-red-500"
        >
          • {t(`sms_provider_evaluation.mismatch.${field}`, {
            defaultValue: field,
          })}
        </Text>
      ))}
    </View>
  );
}

function NotEvaluatedEvidence({
  item,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly t: TranslateFn;
}): React.JSX.Element | null {
  if (item.outcome !== "not_evaluated") return null;
  return (
    <View className="mt-4 rounded-xl bg-gold-100 p-3 dark:bg-gold-800/30">
      <Text className="text-xs font-semibold text-gold-600 dark:text-gold-400">
        {t("sms_provider_evaluation.not_evaluated_detail")}
      </Text>
      <Text className="mt-1 text-xs text-gold-600 dark:text-gold-400">
        {t(
          `sms_provider_evaluation.classification.${item.finalClassification}`,
          {
            defaultValue: item.finalClassification,
          }
        )}
      </Text>
      <BatchEvidence item={item} t={t} />
    </View>
  );
}

function BatchEvidence({
  item,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly t: TranslateFn;
}): React.JSX.Element | null {
  if (item.batch === null) return null;
  return (
    <>
      <Text className="mt-1 text-xs text-gold-600 dark:text-gold-400">
        {t("sms_provider_evaluation.batch")}: {item.batch.batchId}
        {item.batch.httpStatus ? ` · HTTP ${item.batch.httpStatus}` : ""}
      </Text>
      {item.batch.refusalReason ? (
        <Text className="mt-1 text-xs text-gold-600 dark:text-gold-400">
          {t("sms_provider_evaluation.reason")}:{" "}
          {t(`sms_provider_evaluation.reasons.${item.batch.refusalReason}`, {
            defaultValue: t("sms_provider_evaluation.reasons.unknown"),
          })}
        </Text>
      ) : null}
    </>
  );
}

function ExpandedDetails({
  item,
  isCompact,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly isCompact: boolean;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="border-t border-slate-200 px-4 pb-4 dark:border-slate-700">
      <Text className="mt-4 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.message")}
      </Text>
      <Text className="mt-2 text-sm text-slate-900 dark:text-slate-25">
        {item.body}
      </Text>
      <CaseMetadata item={item} t={t} />
      <OutcomeComparison item={item} isCompact={isCompact} t={t} />
      {item.fields.length > 0 ? (
        <View className="mt-4">
          <Text className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-25">
            {t("sms_provider_evaluation.field_comparison")}
          </Text>
          {item.fields.map((field) => (
            <FieldComparisonRow
              key={field.key}
              field={field}
              isCompact={isCompact}
              t={t}
            />
          ))}
        </View>
      ) : null}
      <MismatchReasons item={item} t={t} />
      <NotEvaluatedEvidence item={item} t={t} />
      <Text className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        {t("sms_provider_evaluation.final_parser_note")}
      </Text>
    </View>
  );
}

function CaseSummary({
  item,
  isExpanded,
  onToggle,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      accessibilityLabel={t("sms_provider_evaluation.toggle_case", {
        provider: item.providerName,
      })}
      onPress={onToggle}
      className="min-h-11 p-4"
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
            {item.providerName} · {item.templateGroup}
          </Text>
          <Text
            className="mt-2 text-sm text-slate-600 dark:text-slate-300"
            numberOfLines={isExpanded ? undefined : 2}
          >
            {item.body}
          </Text>
        </View>
        <OutcomeBadge item={item} t={t} />
      </View>
      {!isExpanded ? (
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="flex-1 text-xs text-slate-500 dark:text-slate-400">
            {t("sms_provider_evaluation.tap_to_compare")}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={palette.slate[500]}
          />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function SmsProviderEvaluationCaseCard({
  item,
  isExpanded,
  isCompact,
  onToggle,
  t,
}: {
  readonly item: SmsEvaluationCaseViewModel;
  readonly isExpanded: boolean;
  readonly isCompact: boolean;
  readonly onToggle: () => void;
  readonly t: TranslateFn;
}): React.JSX.Element {
  return (
    <View className="rounded-2xl bg-white dark:bg-slate-800">
      <CaseSummary
        item={item}
        isExpanded={isExpanded}
        onToggle={onToggle}
        t={t}
      />
      {isExpanded ? (
        <ExpandedDetails item={item} isCompact={isCompact} t={t} />
      ) : null}
    </View>
  );
}
