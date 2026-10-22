/**
 * #395 review transcript fixtures — presentational catalogue.
 *
 * Renders shaped fixture data and fires callbacks only. No services, queries,
 * DB, or business calculations here.
 *
 * @module review-transcript-fixtures/TranscriptFixtureCatalog
 */

import { palette } from "@/constants/colors";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

import type { ReviewTranscriptFixtureCatalogItem } from "@/hooks/useReviewTranscriptFixtures";
import type { ReviewTranscriptFixtureSetupResult } from "@/services/review-transcript-fixtures-setup-service";
import type { ReviewTranscriptFixtureLaunchUnavailableReason } from "@/services/review-transcript-fixtures-launcher-service";

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

export interface TranscriptFixtureCatalogProps {
  readonly t: TranslateFn;
  readonly status: "loading" | "ready" | "unavailable";
  readonly items: readonly ReviewTranscriptFixtureCatalogItem[];
  readonly preferredCurrency: string | null;
  readonly isPreparing: boolean;
  readonly setupResult: ReviewTranscriptFixtureSetupResult | null;
  readonly launchErrorReason: ReviewTranscriptFixtureLaunchUnavailableReason | null;
  readonly isLaunchingId: string | null;
  readonly bottomInset: number;
  readonly onBack: () => void;
  readonly onPrepareAccounts: () => void;
  readonly onLaunch: (scenarioId: string) => void;
}

const SETUP_BLOCK_REASON_KEYS: Record<string, string> = {
  runtime_unavailable: "review_fixtures_setup_reason_runtime_unavailable",
  already_preparing: "review_fixtures_setup_reason_already_preparing",
  no_primary_account: "review_fixtures_setup_reason_no_primary_account",
  owner_changed: "review_fixtures_setup_reason_owner_changed",
  creation_failed: "review_fixtures_setup_reason_creation_failed",
};

const SETUP_ROLE_STATUS_KEYS: Record<string, string> = {
  existing: "review_fixtures_setup_role_existing",
  created: "review_fixtures_setup_role_created",
  failed: "review_fixtures_setup_role_failed",
};

const LAUNCH_ERROR_KEYS: Record<string, string> = {
  runtime_unavailable: "review_fixtures_launch_error_runtime_unavailable",
  already_launching: "review_fixtures_launch_error_already_launching",
  scenario_unknown: "review_fixtures_launch_error_scenario_unknown",
  owner_changed: "review_fixtures_launch_error_owner_changed",
  build_failed: "review_fixtures_launch_error_build_failed",
  session_failed: "review_fixtures_launch_error_session_failed",
};

function FixtureRow({
  t,
  item,
  isLaunching,
  isDisabled,
  onLaunch,
}: {
  readonly t: TranslateFn;
  readonly item: ReviewTranscriptFixtureCatalogItem;
  readonly isLaunching: boolean;
  readonly isDisabled: boolean;
  readonly onLaunch: (scenarioId: string) => void;
}): React.JSX.Element {
  const hasMissingRoles = item.missingRoleLabels.length > 0;
  return (
    <View
      testID={`review-fixture-row-${item.id}`}
      className="mb-3 rounded-2xl bg-white p-4 dark:bg-slate-800"
    >
      <Text className="text-base font-semibold text-slate-900 dark:text-slate-50">
        {item.label}
      </Text>
      <Text
        className="mt-1 text-sm text-slate-600 dark:text-slate-300"
        // eslint-disable-next-line react-native/no-inline-styles
        style={
          item.detectedLanguage === "ar"
            ? { writingDirection: "rtl" }
            : undefined
        }
      >
        {item.transcript}
      </Text>
      <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t("review_fixtures_row_summary", {
          rows: item.rowCount,
          language: item.detectedLanguage.toUpperCase(),
        })}
      </Text>
      {item.roleLabels.length > 0 && (
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("review_fixtures_row_prerequisites", {
            roles: item.roleLabels.join(", "),
          })}
        </Text>
      )}
      {hasMissingRoles && (
        <Text className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {t("review_fixtures_row_missing_roles", {
            roles: item.missingRoleLabels.join(", "),
          })}
        </Text>
      )}
      <TouchableOpacity
        testID={`review-fixture-launch-${item.id}`}
        onPress={() => onLaunch(item.id)}
        disabled={isDisabled}
        accessibilityState={{ disabled: isDisabled }}
        style={isDisabled ? { opacity: 0.62 } : undefined}
        className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-nileGreen-600 py-2.5"
      >
        <Ionicons name="mic-outline" size={16} color={palette.slate[25]} />
        <Text className="text-sm font-semibold text-white">
          {isLaunching
            ? t("review_fixtures_launching")
            : t("review_fixtures_launch")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SetupPanel({
  t,
  setupResult,
}: {
  readonly t: TranslateFn;
  readonly setupResult: ReviewTranscriptFixtureSetupResult | null;
}): React.JSX.Element | null {
  if (setupResult === null) return null;
  return (
    <View
      testID="review-fixtures-setup-result"
      className="mb-3 rounded-2xl bg-white p-4 dark:bg-slate-800"
    >
      {setupResult.status === "blocked" && (
        <Text className="text-sm text-red-600 dark:text-red-400">
          {t(
            SETUP_BLOCK_REASON_KEYS[setupResult.reason ?? "creation_failed"] ??
              "review_fixtures_setup_reason_creation_failed"
          )}
        </Text>
      )}
      {setupResult.roles.map((role) => (
        <Text
          key={role.roleKey}
          className="mt-1 text-xs text-slate-500 dark:text-slate-400"
        >
          {t(
            SETUP_ROLE_STATUS_KEYS[role.status] ??
              "review_fixtures_setup_role_failed",
            { label: role.label }
          )}
        </Text>
      ))}
    </View>
  );
}

export function TranscriptFixtureCatalog(
  props: TranscriptFixtureCatalogProps
): React.JSX.Element {
  const {
    t,
    status,
    items,
    preferredCurrency,
    isPreparing,
    setupResult,
    launchErrorReason,
    isLaunchingId,
    bottomInset,
    onBack,
    onPrepareAccounts,
    onLaunch,
  } = props;

  const header = (
    <PageHeader
      title={t("review_fixtures_title")}
      showDrawer={false}
      showBackButton
      onBack={onBack}
    />
  );

  if (status === "unavailable") {
    return (
      <View
        testID="review-fixtures-unavailable"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        {header}
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="flask-outline" size={44} color={palette.slate[400]} />
          <Text className="mt-4 text-center text-base text-slate-500 dark:text-slate-400">
            {t("review_fixtures_unavailable")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      testID="review-fixtures-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {header}
      {status === "loading" ? (
        <View className="px-4">
          <Skeleton width="100%" height={96} borderRadius={16} />
          <View className="mt-3">
            <Skeleton width="100%" height={96} borderRadius={16} />
          </View>
        </View>
      ) : (
        <FlatList
          testID="review-fixtures-list"
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: bottomInset + 32,
          }}
          ListHeaderComponent={
            <View>
              <View className="mb-3 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950">
                <Text className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  {t("review_fixtures_development_only")}
                </Text>
                <Text className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {t("review_fixtures_warning")}
                </Text>
                {preferredCurrency !== null && (
                  <Text className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    {t("review_fixtures_preferred_currency", {
                      currency: preferredCurrency,
                    })}
                  </Text>
                )}
              </View>

              {launchErrorReason !== null && (
                <View
                  testID="review-fixtures-launch-error"
                  className="mb-3 rounded-2xl bg-red-50 p-4 dark:bg-red-950"
                >
                  <Text className="text-sm text-red-700 dark:text-red-300">
                    {t(
                      LAUNCH_ERROR_KEYS[launchErrorReason] ??
                        "review_fixtures_launch_error_session_failed"
                    )}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                testID="review-fixtures-prepare-accounts"
                onPress={onPrepareAccounts}
                disabled={isPreparing}
                accessibilityState={{ disabled: isPreparing }}
                style={isPreparing ? { opacity: 0.62 } : undefined}
                className="mb-3 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-300 py-3 dark:border-slate-600"
              >
                <Ionicons
                  name="construct-outline"
                  size={16}
                  color={palette.slate[500]}
                />
                <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {isPreparing
                    ? t("review_fixtures_preparing")
                    : t("review_fixtures_prepare_accounts")}
                </Text>
              </TouchableOpacity>

              <SetupPanel t={t} setupResult={setupResult} />
            </View>
          }
          renderItem={({ item }) => (
            <FixtureRow
              t={t}
              item={item}
              isLaunching={isLaunchingId === item.id}
              isDisabled={isLaunchingId !== null}
              onLaunch={onLaunch}
            />
          )}
        />
      )}
    </View>
  );
}
