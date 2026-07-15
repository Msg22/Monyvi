import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { Skeleton } from "@/components/ui/Skeleton";
import { QaSmsStickyFooter } from "./QaSmsStickyFooter";

interface QaSmsExportSummaryProps {
  readonly approvedCandidateCount: number;
  readonly reviewedFamilyCount: number;
  readonly isPreparing: boolean;
  readonly errorCode: string | null;
  readonly onExport: () => void;
  readonly onBack: () => void;
  readonly bottomInset: number;
}

interface SummaryRowProps {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}

function SummaryRow({ icon, label }: SummaryRowProps): React.JSX.Element {
  return (
    <View className="min-h-16 flex-row items-center border-b border-slate-200 px-4 last:border-b-0 dark:border-slate-700">
      <Ionicons name={icon} size={24} color={palette.slate[700]} />
      <Text className="ms-4 text-base text-text-primary dark:text-slate-100">
        {label}
      </Text>
    </View>
  );
}

export function QaSmsExportSummary({
  approvedCandidateCount,
  reviewedFamilyCount,
  isPreparing,
  errorCode,
  onExport,
  onBack,
  bottomInset,
}: QaSmsExportSummaryProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");

  return (
    <View className="flex-1 bg-background px-5 pt-8 dark:bg-background-dark">
      <View className="items-center">
        <View className="h-24 w-24 items-center justify-center rounded-2xl bg-nileGreen-500/10">
          <Ionicons
            name="document-text-outline"
            size={54}
            color={palette.nileGreen[600]}
          />
        </View>
        <Text className="mt-6 text-2xl font-bold text-text-primary dark:text-slate-100">
          {t("export_title")}
        </Text>
      </View>

      {isPreparing ? (
        <View testID="qa-sms-export-skeleton" className="mt-8 gap-3">
          <Skeleton width="100%" height={64} />
          <Skeleton width="100%" height={64} />
          <Skeleton width="100%" height={64} />
        </View>
      ) : (
        <View className="mt-8 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <SummaryRow
            icon="checkmark-circle-outline"
            label={t("approved_candidates", {
              count: approvedCandidateCount,
            })}
          />
          <SummaryRow
            icon="folder-outline"
            label={t("reviewed_families", { count: reviewedFamilyCount })}
          />
          <SummaryRow icon="code-slash-outline" label={t("local_json_file")} />
        </View>
      )}

      <View className="mt-4 flex-row items-center rounded-lg border border-nileGreen-500/30 bg-nileGreen-500/10 p-4">
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color={palette.nileGreen[600]}
        />
        <Text className="ms-3 flex-1 text-sm text-nileGreen-700 dark:text-nileGreen-400">
          {t("export_privacy_note")}
        </Text>
      </View>

      {errorCode ? (
        <View
          accessibilityRole="alert"
          className="mt-4 flex-row rounded-lg border border-red-500/40 bg-red-500/10 p-4"
        >
          <Ionicons
            name="alert-circle-outline"
            size={22}
            color={palette.red[500]}
          />
          <View className="ms-3 flex-1">
            <Text className="font-semibold text-red-700 dark:text-red-300">
              {t("export_failed_title")}
            </Text>
            <Text className="mt-1 text-sm text-red-700 dark:text-red-300">
              {t("export_failed_message")}
            </Text>
          </View>
        </View>
      ) : null}

      <QaSmsStickyFooter
        testID="qa-sms-export-actions"
        bottomInset={bottomInset}
        className="mt-auto pt-5"
      >
        <TouchableOpacity
          disabled={isPreparing}
          className="min-h-14 flex-row items-center justify-center rounded-lg bg-nileGreen-600"
          onPress={onExport}
        >
          <Ionicons
            name="folder-open-outline"
            size={22}
            color={palette.slate[25]}
          />
          <Text className="ms-2 text-base font-semibold text-white">
            {t("choose_folder_export")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="mt-3 min-h-12 items-center justify-center rounded-lg border border-nileGreen-600"
          onPress={onBack}
        >
          <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {t("back_to_review")}
          </Text>
        </TouchableOpacity>
        <Text className="mt-4 text-center text-sm text-text-muted dark:text-slate-400">
          {t("inspect_file_note")}
        </Text>
      </QaSmsStickyFooter>
    </View>
  );
}

export type { QaSmsExportSummaryProps };
