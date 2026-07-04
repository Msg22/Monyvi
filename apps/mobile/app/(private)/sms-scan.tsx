/**
 * SMS Scan Route
 *
 * Expo Router page that wraps SmsScanProgress + useSmsScan.
 * Auto-starts scanning on mount and navigates to review on completion.
 *
 * Supports two scan modes (set via SmsScanContext):
 *   - "incremental" (default): passes lastSyncTimestamp as minDate
 *   - "full": scans all messages (no minDate)
 *
 * @module sms-scan
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { SUPPORTED_CURRENCIES, type ParsedSmsTransaction } from "@monyvi/logic";
import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";
import { SmsScanProgress } from "@/components/sms-sync/SmsScanProgress";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAllCategories } from "@/context/CategoriesContext";
import { useSmsScanContext } from "@/context/SmsScanContext";
import { useSmsScan } from "@/hooks/useSmsScan";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { useSmsSync } from "@/hooks/useSmsSync";
import { useAiProcessingConsent } from "@/hooks/useAiProcessingConsent";
import { loadExistingSmsFingerprints } from "@/services/sms-sync-service";
import { palette } from "@/constants/colors";
import { logger } from "@/utils/logger";
import { toCategoryTreeSources } from "@/utils/category-tree-source";
import type { ParseSmsContext } from "@/services/ai-sms-parser-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the top N most frequent category system names from parsed
 * transactions, sorted by frequency (descending).
 */
function getTopCategories(
  transactions: readonly ParsedSmsTransaction[],
  limit: number = 5
): readonly string[] {
  if (transactions.length === 0) return [];
  const frequency = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.categoryDisplayName) {
      frequency.set(
        tx.categoryDisplayName,
        (frequency.get(tx.categoryDisplayName) ?? 0) + 1
      );
    }
  }
  // Exclude generic "Other" category from top categories
  const OTHER_CATEGORY_DISPLAY_NAME = "other";
  return Array.from(frequency.entries())
    .filter(([name]) => name.toLowerCase() !== OTHER_CATEGORY_DISPLAY_NAME)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

// ---------------------------------------------------------------------------
// Permission Gate
// ---------------------------------------------------------------------------

/**
 * Shown when SMS permission is not yet granted.
 * Provides a button to request permission or open settings (if blocked).
 */
function SmsPermissionGate({
  status,
  isLoading,
  onRequest,
  onOpenSettings,
  onBack,
}: {
  readonly status: "undetermined" | "denied" | "blocked";
  readonly isLoading: boolean;
  readonly onRequest: () => void;
  readonly onOpenSettings: () => void;
  readonly onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900"
        edges={["top", "bottom"]}
      >
        <Skeleton width={200} height={24} borderRadius={8} />
        <Skeleton
          width={280}
          height={16}
          borderRadius={4}
          style={{ marginTop: 16 }}
        />
      </SafeAreaView>
    );
  }

  const isBlocked = status === "blocked";

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["top", "bottom"]}
    >
      <View className="flex-1 items-center justify-center px-8">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-nileGreen-500/10">
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={40}
            color={palette.nileGreen[500]}
          />
        </View>

        <Text className="mb-3 text-center text-xl font-semibold text-slate-800 dark:text-slate-25">
          {t("sms_scan_title")}
        </Text>

        <Text className="mb-8 text-center text-base text-slate-600 dark:text-slate-300">
          {t("sms_scan_instructions")}
        </Text>

        {isBlocked ? (
          <TouchableOpacity
            className="mb-4 w-full rounded-xl bg-nileGreen-500 py-4"
            activeOpacity={0.8}
            onPress={onOpenSettings}
          >
            <Text className="text-center text-base font-semibold text-slate-25">
              {tCommon("open_settings")}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className="mb-4 w-full rounded-xl bg-nileGreen-500 py-4"
            activeOpacity={0.8}
            onPress={onRequest}
          >
            <Text className="text-center text-base font-semibold text-slate-25">
              {t("allow_sms_access")}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity activeOpacity={0.7} onPress={onBack}>
          <Text className="text-base text-slate-600 dark:text-slate-300">
            {tCommon("back")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SMS Scan Progress Screen.
 *
 * Includes a permission gate: if READ_SMS is not granted, the user is
 * prompted to allow access before scanning begins. This keeps the
 * permission logic in the route so all callers benefit from it.
 *
 * Automatically starts scanning on mount (after permission) and displays
 * live progress. On completion with results, "Review Transactions"
 * navigates to the review page. Empty or error states provide
 * back/retry options.
 *
 * When scanMode is "incremental" and lastSyncTimestamp exists, only messages
 * newer than that timestamp are scanned. "full" scans all messages.
 */
export default function SmsScanScreen(): React.JSX.Element {
  const router = useRouter();
  const {
    status: permissionStatus,
    isLoading: isPermissionLoading,
    requestPermission,
    openSettings,
  } = useSmsPermission();
  const { status, progress, result, transactions, error, startScan } =
    useSmsScan();
  const aiConsent = useAiProcessingConsent();
  const [isConsentSheetVisible, setIsConsentSheetVisible] =
    React.useState(false);
  const shouldResumeConsentAfterPrivacyDetails = useRef(false);

  const { setTransactions, scanMode } = useSmsScanContext();
  const { lastSyncTimestamp } = useSmsSync();
  const { categories: allCategories, isLoading: isCategoriesLoading } =
    useAllCategories();
  const isAiContextReady = !isCategoriesLoading;

  // Build AI context from existing user data
  const aiContext = useMemo(
    (): ParseSmsContext => ({
      categories: toCategoryTreeSources(allCategories),
      supportedCurrencies: SUPPORTED_CURRENCIES.map((c) => c.code),
    }),
    [allCategories]
  );

  // Shared scan initiation logic (used by both auto-start and retry)
  const initiateScan = useCallback(async (): Promise<void> => {
    const minDate =
      scanMode === "incremental" && lastSyncTimestamp
        ? lastSyncTimestamp
        : undefined;

    let existingFingerprints: ReadonlySet<string> = new Set();
    try {
      existingFingerprints = await loadExistingSmsFingerprints();
    } catch (err: unknown) {
      logger.warn("smsScan.loadExistingFingerprintsFailed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    startScan({ minDate, existingFingerprints, aiContext }).catch(
      (err: unknown) => {
        logger.error("smsScan.startFailed", err);
      }
    );
  }, [startScan, scanMode, lastSyncTimestamp, aiContext]);

  // Track whether scan has been initiated to prevent double-start
  const scanInitiated = useRef(false);

  // Auto-start scan on mount — waits until permission is granted and categories loaded
  useEffect(() => {
    if (aiConsent.isLoading) return;
    if (!aiConsent.isConsented) {
      setIsConsentSheetVisible(true);
      return;
    }
    if (permissionStatus !== "granted") return;
    if (!isAiContextReady) return;
    if (!scanInitiated.current) {
      scanInitiated.current = true;
      initiateScan().catch((err: unknown) => {
        logger.error("smsScan.autoStartFailed", err);
      });
    }
  }, [
    aiConsent.isConsented,
    aiConsent.isLoading,
    initiateScan,
    isAiContextReady,
    permissionStatus,
  ]);

  const handleReviewPress = (): void => {
    if (transactions.length > 0) {
      setTransactions(transactions);
      router.push("/sms-review");
    }
  };

  const handleBackPress = (): void => {
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      if (!shouldResumeConsentAfterPrivacyDetails.current) {
        return;
      }

      shouldResumeConsentAfterPrivacyDetails.current = false;
      if (!aiConsent.isLoading && !aiConsent.isConsented) {
        setIsConsentSheetVisible(true);
      }
    }, [aiConsent.isConsented, aiConsent.isLoading])
  );

  const handleRetryPress = (): void => {
    initiateScan().catch((err: unknown) => {
      logger.error("smsScan.retryFailed", err);
    });
  };

  // Compute top unique category system names from parsed transactions
  const topCategories = useMemo(
    () => getTopCategories(transactions),
    [transactions]
  );
  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of allCategories) {
      map.set(category.systemName, category.displayName);
    }
    return map;
  }, [allCategories]);

  // ── iOS short-circuit ──
  // SMS import is Android-only (iOS has no equivalent of READ_SMS). Avoid
  // trapping iOS users in the permission gate where useSmsPermission returns
  // a permanent "denied" status and "Allow" would resolve back to "denied"
  // indefinitely. Navigate the user back instead.
  useEffect(() => {
    if (Platform.OS !== "android") {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace("/(private)/(tabs)");
    }
  }, [router]);

  if (Platform.OS !== "android") {
    return <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900" />;
  }

  // Shared error handlers for permission gate callbacks — log failures
  // instead of silently swallowing them, per project coding guidelines.
  const handleGateRequest = (): void => {
    if (!aiConsent.isConsented) {
      setIsConsentSheetVisible(true);
      return;
    }

    requestPermission().catch((err: unknown) => {
      logger.warn("Failed to request SMS permission from gate", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const handleConsentContinue = (): void => {
    aiConsent
      .grantConsent()
      .then(() => {
        setIsConsentSheetVisible(false);
        if (permissionStatus !== "granted") {
          return requestPermission();
        }
        return undefined;
      })
      .catch((err: unknown) => {
        logger.error("smsScan.aiConsentGrantFailed", err);
        setIsConsentSheetVisible(false);
      });
  };

  const consentSheet = (
    <AiProcessingConsentSheet
      visible={isConsentSheetVisible}
      variant="sms-permission-with-ai-consent"
      onContinue={handleConsentContinue}
      onNotNow={() => {
        setIsConsentSheetVisible(false);
        router.back();
      }}
      onPrivacyDetails={() => {
        shouldResumeConsentAfterPrivacyDetails.current = true;
        setIsConsentSheetVisible(false);
        router.push("/ai-privacy-details");
      }}
    />
  );
  const handleGateOpenSettings = (): void => {
    openSettings().catch((err: unknown) => {
      logger.warn("Failed to open settings from gate", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  // ── Permission gate ──
  // While the initial permission check (or auto-request for first-time users)
  // is in flight, show a skeleton loading state instead of the gate UI.
  // Only render the visible gate when the user has explicitly denied or
  // blocked the permission — first-time users see the native dialog directly.
  // All hooks are called above (unconditionally) to satisfy Rules of Hooks.
  if (isPermissionLoading || permissionStatus === "undetermined") {
    return (
      <>
        <SmsPermissionGate
          status="undetermined"
          isLoading
          onRequest={handleGateRequest}
          onOpenSettings={handleGateOpenSettings}
          onBack={handleBackPress}
        />
        {consentSheet}
      </>
    );
  }

  if (permissionStatus === "denied" || permissionStatus === "blocked") {
    return (
      <>
        <SmsPermissionGate
          status={permissionStatus}
          isLoading={false}
          onRequest={handleGateRequest}
          onOpenSettings={handleGateOpenSettings}
          onBack={handleBackPress}
        />
        {consentSheet}
      </>
    );
  }

  return (
    <>
      <SafeAreaView
        className="flex-1 bg-slate-50 dark:bg-slate-900"
        edges={["top", "bottom"]}
      >
        <SmsScanProgress
          status={status}
          progress={progress}
          transactionsFound={result?.totalFound ?? 0}
          totalScanned={result?.totalScanned ?? 0}
          durationMs={result?.durationMs ?? 0}
          topCategories={topCategories}
          categoryNameMap={categoryNameMap}
          error={error}
          onReviewPress={handleReviewPress}
          onBackPress={handleBackPress}
          onRetryPress={handleRetryPress}
        />
      </SafeAreaView>
      {consentSheet}
    </>
  );
}
