import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/constants/colors";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { SmsSafeguardQaDiagnosticsViewModel } from "@/services/sms-safeguard-qa-diagnostics-service";

interface SafeguardQaDiagnosticsPanelProps {
  readonly diagnostics: SmsSafeguardQaDiagnosticsViewModel | null;
}

interface ScanCountsProps {
  readonly counts: SmsSafeguardQaDiagnosticsViewModel["currentScan"];
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}

function formatBytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KiB`;
}

function ScanCounts({ counts, t }: ScanCountsProps): React.JSX.Element {
  return (
    <View className="gap-1.5">
      <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
        {t("qa_safeguard_local_results", {
          count: counts.localResultCount,
        })}
      </Text>
      <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
        {t("qa_safeguard_ai_results", { count: counts.aiResultCount })}
      </Text>
      <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
        {t("qa_safeguard_deferred_results", {
          count: counts.deferredAiCount,
        })}
      </Text>
      <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
        {t("qa_safeguard_oversized_results", {
          count: counts.oversizedCount,
        })}
      </Text>
      <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
        {t("qa_safeguard_unresolved_results", {
          count: counts.unresolvedCount,
        })}
      </Text>
    </View>
  );
}

export function SafeguardQaDiagnosticsPanel({
  diagnostics,
}: SafeguardQaDiagnosticsPanelProps): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const [isExpanded, setIsExpanded] = useState(false);
  if (diagnostics === null) return null;

  return (
    <View className="mt-4 rounded-lg border border-nileGreen-500/50 bg-nileGreen-500/10 px-3 py-2 dark:border-nileGreen-400/50 dark:bg-nileGreen-500/10">
      <TouchableOpacity
        accessibilityLabel={t("qa_safeguard_expand")}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        activeOpacity={0.75}
        className="flex-row items-center justify-between"
        onPress={() => setIsExpanded((current) => !current)}
      >
        <View className="flex-1 pe-3">
          <Text className="text-xs font-bold text-nileGreen-700 dark:text-nileGreen-300">
            {t("qa_safeguard_panel_title")}
          </Text>
          <Text className="mt-0.5 text-xs text-text-secondary dark:text-text-secondary-dark">
            {diagnostics.profileId} v{diagnostics.profileVersion}
          </Text>
        </View>
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={palette.nileGreen[600]}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View className="mt-3 gap-2 border-t border-nileGreen-500/30 pt-3">
          <Text className="text-xs font-semibold text-text-primary dark:text-text-primary-dark">
            {t("qa_safeguard_tests_title")}
          </Text>
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {t(`qa_safeguard_purpose_${diagnostics.purpose}`)}
          </Text>
          <Text className="pt-1 text-xs font-bold text-text-primary dark:text-text-primary-dark">
            {t("qa_safeguard_expected_title")}
          </Text>
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {t(`qa_safeguard_expected_${diagnostics.expected.guidance}`)}
          </Text>
          {diagnostics.expected.firstScan !== undefined && (
            <ScanCounts counts={diagnostics.expected.firstScan} t={t} />
          )}
          <Text className="pt-1 text-xs font-bold text-text-primary dark:text-text-primary-dark">
            {t("qa_safeguard_must_not_title")}
          </Text>
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {t(`qa_safeguard_must_not_${diagnostics.expected.mustNotHappen}`)}
          </Text>
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {t("qa_safeguard_privacy_guardrail")}
          </Text>
          <Text className="pt-1 text-xs font-bold text-text-primary dark:text-text-primary-dark">
            {t("qa_safeguard_observed_title")}
          </Text>
          <ScanCounts counts={diagnostics.currentScan} t={t} />
          {diagnostics.observedBoundary !== undefined &&
            diagnostics.observedBoundary !== null && (
              <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
                {t("qa_safeguard_observed_boundary", {
                  boundary: t(
                    `qa_safeguard_boundary_${diagnostics.observedBoundary}`
                  ),
                })}
              </Text>
            )}
          <Text className="pt-1 text-xs font-bold text-text-primary dark:text-text-primary-dark">
            {t("qa_safeguard_limits_title")}
          </Text>
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {t("qa_safeguard_limits", {
              request: diagnostics.limits.maxCandidatesPerRequest,
              scan: diagnostics.limits.maxCandidatesPerScan,
              rolling: diagnostics.limits.maxCandidatesPerRollingWindow,
              payload: formatBytes(diagnostics.limits.maxPayloadBytes),
              tokens: diagnostics.limits.maxEstimatedInputTokens,
            })}
          </Text>
        </View>
      )}
    </View>
  );
}
