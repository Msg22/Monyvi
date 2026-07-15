import { Ionicons } from "@expo/vector-icons";
import type {
  QaCoverageDeclaration,
  QaCoverageStatus,
  QaSmsCurrency,
  QaSmsMessageFamily,
} from "@monyvi/logic";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { PageHeader } from "@/components/navigation/PageHeader";
import { QaSmsStickyFooter } from "./QaSmsStickyFooter";

interface QaSmsCoverageReviewProps {
  readonly declarations: readonly QaCoverageDeclaration[];
  readonly pendingCount: number;
  readonly onUpdate: (
    messageFamily: QaSmsMessageFamily,
    currency: QaSmsCurrency,
    status: QaCoverageStatus
  ) => void;
  readonly onMarkPendingUnavailable: () => void;
  readonly onContinue: () => void;
  readonly bottomInset: number;
}

interface CoverageEditorProps {
  readonly declaration: QaCoverageDeclaration | null;
  readonly bottomInset: number;
  readonly onCancel: () => void;
  readonly onSave: (status: QaCoverageStatus) => void;
}

interface CoverageGroupDefinition {
  readonly id: string;
  readonly families: readonly QaSmsMessageFamily[];
}

interface CoverageGroup extends CoverageGroupDefinition {
  readonly declarations: readonly QaCoverageDeclaration[];
}

const COVERAGE_STATUSES: readonly QaCoverageStatus[] = [
  "candidate_collected",
  "unavailable_in_qa_dataset",
  "pending",
];

const COVERAGE_GROUPS: readonly CoverageGroupDefinition[] = [
  { id: "card_purchase", families: ["card_purchase"] },
  { id: "atm_withdrawal", families: ["atm_withdrawal"] },
  { id: "incoming_ipn_transfer", families: ["incoming_ipn_transfer"] },
  { id: "outgoing_ipn_transfer", families: ["outgoing_ipn_transfer"] },
  { id: "bank_to_wallet_transfer", families: ["bank_to_wallet_transfer"] },
  { id: "refund_or_reversal", families: ["refund_or_reversal"] },
  { id: "failed_transaction", families: ["failed_transaction"] },
  { id: "otp_informational", families: ["otp", "informational"] },
  { id: "promotional", families: ["promotional"] },
] as const;

function getGroupStatus(
  declarations: readonly QaCoverageDeclaration[]
): QaCoverageStatus {
  if (declarations.some(({ status }) => status === "pending")) return "pending";
  if (
    declarations.every(({ status }) => status === "unavailable_in_qa_dataset")
  ) {
    return "unavailable_in_qa_dataset";
  }
  return "candidate_collected";
}

function getStatusClass(status: QaCoverageStatus): string {
  return status === "pending"
    ? "text-gold-600 dark:text-gold-400"
    : status === "unavailable_in_qa_dataset"
      ? "text-text-muted dark:text-slate-400"
      : "text-nileGreen-700 dark:text-nileGreen-400";
}

function CoverageEditor({
  declaration,
  bottomInset,
  onCancel,
  onSave,
}: CoverageEditorProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [status, setStatus] = useState<QaCoverageStatus>("pending");

  useEffect(() => {
    if (declaration) setStatus(declaration.status);
  }, [declaration]);

  return (
    <Modal
      visible={declaration !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View
        testID="qa-sms-coverage-editor"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        <PageHeader
          title={t("coverage_update_title")}
          variant="review"
          includeTopSafeAreaInset
          showBackButton
          onBack={onCancel}
        />
        <View className="flex-1 px-5 pt-4">
          {declaration ? (
            <View className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <Text className="text-lg font-semibold text-text-primary dark:text-slate-100">
                {t(`family_${declaration.messageFamily}`)} ·{" "}
                {declaration.currency ?? t("currency_not_applicable")}
              </Text>
              <Text className="mt-1 text-sm text-text-secondary dark:text-slate-400">
                {t("family_label")} · {t("currency_label")}
              </Text>
            </View>
          ) : null}
          <View className="mt-5 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {COVERAGE_STATUSES.map((value) => {
              const isSelected = status === value;
              const isCandidateDisabled =
                value === "candidate_collected" &&
                declaration?.candidateIds.length === 0;
              const isCandidateReferencesDisabled =
                (value === "unavailable_in_qa_dataset" ||
                  value === "pending") &&
                (declaration?.candidateIds.length ?? 0) > 0;
              const isDisabled =
                isCandidateDisabled || isCandidateReferencesDisabled;
              return (
                <TouchableOpacity
                  key={value}
                  testID={`qa-sms-coverage-status-${value}`}
                  disabled={isDisabled}
                  accessibilityState={{ disabled: isDisabled }}
                  className="min-h-20 flex-row items-center border-b border-slate-200 px-4 last:border-b-0 dark:border-slate-700"
                  onPress={() => setStatus(value)}
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
                  <View className="ms-4 flex-1">
                    <Text className="text-base font-semibold text-text-primary dark:text-slate-100">
                      {t(`coverage_${value}`)}
                    </Text>
                    <Text className="mt-1 text-sm text-text-muted dark:text-slate-400">
                      {t(`coverage_${value}_help`)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <QaSmsStickyFooter
            testID="qa-sms-coverage-editor-actions"
            bottomInset={bottomInset}
            className="mt-auto flex-row gap-3 pt-4"
          >
            <TouchableOpacity
              className="min-h-14 flex-1 items-center justify-center rounded-lg border border-nileGreen-600"
              onPress={onCancel}
            >
              <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                {t("cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="qa-sms-save-coverage-status"
              className="min-h-14 flex-1 items-center justify-center rounded-lg bg-nileGreen-600"
              onPress={() => onSave(status)}
            >
              <Text className="font-semibold text-white">
                {t("coverage_save")}
              </Text>
            </TouchableOpacity>
          </QaSmsStickyFooter>
        </View>
      </View>
    </Modal>
  );
}

export function QaSmsCoverageReview({
  declarations,
  pendingCount,
  onUpdate,
  onMarkPendingUnavailable,
  onContinue,
  bottomInset,
}: QaSmsCoverageReviewProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");
  const [editing, setEditing] = useState<QaCoverageDeclaration | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const groups = useMemo(
    () =>
      COVERAGE_GROUPS.map((group) => ({
        ...group,
        declarations: declarations.filter(({ messageFamily }) =>
          group.families.includes(messageFamily)
        ),
      })).filter(({ declarations: rows }) => rows.length > 0),
    [declarations]
  );

  const getGroupLabel = (group: CoverageGroup): string =>
    group.id === "otp_informational"
      ? `${t("family_otp")} / ${t("family_informational")}`
      : t(`family_${group.families[0]}`);

  const getScopeLabel = (declaration: QaCoverageDeclaration): string =>
    declaration.currency ?? t(`family_${declaration.messageFamily}`);

  return (
    <View className="flex-1 bg-background px-5 pt-3 dark:bg-background-dark">
      <Text className="text-center text-base text-text-secondary dark:text-slate-400">
        {t("step_coverage")}
      </Text>
      <View className="mt-2 h-1.5 flex-row gap-1.5">
        <View className="flex-1 rounded-full bg-nileGreen-600" />
        <View className="flex-1 rounded-full bg-nileGreen-600" />
        <View className="flex-1 rounded-full bg-nileGreen-600" />
      </View>
      <Text className="mt-5 text-base text-text-secondary dark:text-slate-400">
        {t("coverage_description")}
      </Text>

      <FlatList
        testID="qa-sms-coverage-list"
        className="mt-4 flex-1 rounded-lg border border-slate-200 dark:border-slate-700"
        data={groups}
        keyExtractor={({ id }) => id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: group }) => {
          const isExpanded = expandedGroupId === group.id;
          const status = getGroupStatus(group.declarations);
          const candidateCount = group.declarations.reduce(
            (count, declaration) => count + declaration.candidateIds.length,
            0
          );
          return (
            <View className="border-b border-slate-200 dark:border-slate-700">
              <TouchableOpacity
                testID={`qa-sms-coverage-group-${group.id}`}
                className="min-h-[68px] flex-row items-center px-4"
                onPress={() => setExpandedGroupId(isExpanded ? null : group.id)}
              >
                <Ionicons
                  name="document-text-outline"
                  size={23}
                  color={palette.slate[500]}
                />
                <View className="ms-3 flex-1">
                  <Text className="text-base font-medium text-text-primary dark:text-slate-100">
                    {getGroupLabel(group)}
                  </Text>
                  <Text className={`mt-1 text-sm ${getStatusClass(status)}`}>
                    {candidateCount > 0 ? `${candidateCount} · ` : ""}
                    {t(`coverage_${status}`)}
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={palette.slate[500]}
                />
              </TouchableOpacity>

              {isExpanded
                ? group.declarations.map((declaration) => (
                    <TouchableOpacity
                      key={`${declaration.messageFamily}:${declaration.currency ?? "na"}`}
                      testID={`qa-sms-coverage-${declaration.messageFamily}-${declaration.currency?.toLowerCase() ?? "na"}`}
                      className="min-h-14 flex-row items-center border-t border-slate-200 px-4 ps-14 dark:border-slate-700"
                      onPress={() => setEditing(declaration)}
                    >
                      <Text className="flex-1 text-sm font-medium text-text-secondary dark:text-slate-300">
                        {getScopeLabel(declaration)}
                      </Text>
                      <Text
                        className={`text-sm ${getStatusClass(declaration.status)}`}
                      >
                        {t(`coverage_${declaration.status}`)}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={palette.slate[500]}
                      />
                    </TouchableOpacity>
                  ))
                : null}
            </View>
          );
        }}
      />

      <QaSmsStickyFooter
        testID="qa-sms-coverage-actions"
        bottomInset={bottomInset}
        className="pt-3"
      >
        {pendingCount > 0 ? (
          <View className="mb-3 gap-3">
            <View className="flex-row items-center rounded-lg border border-gold-500 bg-gold-100 p-4 dark:bg-gold-800">
              <Ionicons
                name="warning-outline"
                size={23}
                color={palette.gold[600]}
              />
              <Text className="ms-3 flex-1 text-sm text-gold-800 dark:text-gold-100">
                {t("coverage_pending_warning", { count: pendingCount })}
              </Text>
            </View>
            <TouchableOpacity
              testID="qa-sms-mark-pending-unavailable"
              className="min-h-12 items-center justify-center rounded-lg border border-nileGreen-600"
              onPress={onMarkPendingUnavailable}
            >
              <Text className="font-semibold text-nileGreen-700 dark:text-nileGreen-400">
                {t("coverage_mark_pending_unavailable", {
                  count: pendingCount,
                })}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          testID="qa-sms-coverage-continue"
          disabled={pendingCount > 0}
          className={`min-h-14 items-center justify-center rounded-lg ${
            pendingCount > 0
              ? "bg-slate-200 dark:bg-slate-800"
              : "bg-nileGreen-600"
          }`}
          onPress={onContinue}
        >
          <Text
            className={`text-base font-semibold ${
              pendingCount > 0 ? "text-slate-500" : "text-white"
            }`}
          >
            {t("continue_to_export")}
          </Text>
        </TouchableOpacity>
      </QaSmsStickyFooter>

      <CoverageEditor
        declaration={editing}
        bottomInset={bottomInset}
        onCancel={() => setEditing(null)}
        onSave={(status) => {
          if (editing)
            onUpdate(editing.messageFamily, editing.currency, status);
          setEditing(null);
        }}
      />
    </View>
  );
}

export type { QaSmsCoverageReviewProps };
