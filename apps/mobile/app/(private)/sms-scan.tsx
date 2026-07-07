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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { SUPPORTED_CURRENCIES, type ParsedSmsTransaction } from "@monyvi/logic";
import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";
import { PermissionRecoveryModal } from "@/components/permissions/PermissionRecoveryModal";
import {
  getPermissionRecoveryContent,
  getRecoveryModeForPermissionStatus,
} from "@/components/settings/permission-recovery-content";
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
  const { t: tSettings } = useTranslation("settings");
  const {
    status: permissionStatus,
    isLoading: isPermissionLoading,
    requestPermission,
    openSettings,
  } = useSmsPermission();
  const [isPermissionRecoveryVisible, setIsPermissionRecoveryVisible] =
    useState(true);
  const { status, progress, result, transactions, error, startScan } =
    useSmsScan();
  const aiConsent = useAiProcessingConsent();
  const [isConsentSheetVisible, setIsConsentSheetVisible] =
    React.useState(false);
  const [scanRestartNonce, setScanRestartNonce] = React.useState(0);
  const shouldResumeConsentAfterPrivacyDetails = useRef(false);
  const scanInitiated = useRef(false);
  const previousPermissionStatusRef = useRef(permissionStatus);
  const pendingScanAfterAbortRef = useRef(false);
  const scanAbortControllerRef = useRef<AbortController | null>(null);

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
    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
      pendingScanAfterAbortRef.current = true;
      scanInitiated.current = false;
      return;
    }

    const minDate =
      scanMode === "incremental" && lastSyncTimestamp
        ? lastSyncTimestamp
        : undefined;

    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;

    let existingFingerprints: ReadonlySet<string> = new Set();
    try {
      existingFingerprints = await loadExistingSmsFingerprints();
    } catch (err: unknown) {
      logger.warn("smsScan.loadExistingFingerprintsFailed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (abortController.signal.aborted) {
      if (scanAbortControllerRef.current === abortController) {
        scanAbortControllerRef.current = null;
        if (pendingScanAfterAbortRef.current) {
          pendingScanAfterAbortRef.current = false;
          setScanRestartNonce((value) => value + 1);
        }
      }
      return;
    }

    startScan({
      minDate,
      existingFingerprints,
      aiContext,
      abortSignal: abortController.signal,
    })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        logger.error("smsScan.startFailed", err);
      })
      .finally(() => {
        if (scanAbortControllerRef.current === abortController) {
          scanAbortControllerRef.current = null;
          if (pendingScanAfterAbortRef.current) {
            pendingScanAfterAbortRef.current = false;
            setScanRestartNonce((value) => value + 1);
          }
        }
      });
  }, [startScan, scanMode, lastSyncTimestamp, aiContext]);

  // Auto-start scan on mount — waits until permission is granted and categories loaded
  useEffect(() => {
    if (aiConsent.isLoading) return;
    if (!aiConsent.isConsented) {
      scanAbortControllerRef.current?.abort();
      scanInitiated.current = false;
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
    scanRestartNonce,
  ]);

  useEffect(() => {
    return () => {
      scanAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (previousPermissionStatusRef.current === permissionStatus) {
      return;
    }

    previousPermissionStatusRef.current = permissionStatus;

    if (!isPermissionLoading && permissionStatus !== "granted") {
      setIsPermissionRecoveryVisible(true);
    }
  }, [isPermissionLoading, permissionStatus]);

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

  const handleShowPermissionRecovery = (): void => {
    setIsPermissionRecoveryVisible(true);
  };

  const handlePermissionRecoveryCancel = (): void => {
    setIsPermissionRecoveryVisible(false);
  };

  const handlePermissionRecoveryPrimaryPress = (): void => {
    if (permissionStatus === "blocked") {
      setIsPermissionRecoveryVisible(false);
      openSettings().catch((err: unknown) => {
        logger.warn("Failed to open settings from SMS permission modal", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

    requestPermission()
      .then((result) => {
        setIsPermissionRecoveryVisible(result !== "granted");
      })
      .catch((err: unknown) => {
        logger.warn("Failed to request SMS permission from modal", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  const handleConsentContinue = async (): Promise<void> => {
    try {
      await aiConsent.grantConsent();
      setIsConsentSheetVisible(false);
    } catch (err: unknown) {
      logger.error("smsScan.aiConsentGrantFailed", err);
      setIsConsentSheetVisible(true);
    }
  };

  const consentSheet = (
    <AiProcessingConsentSheet
      visible={isConsentSheetVisible}
      onContinue={handleConsentContinue}
      onNotNow={(): void => {
        setIsConsentSheetVisible(false);
        router.back();
      }}
      onPrivacyDetails={(): void => {
        shouldResumeConsentAfterPrivacyDetails.current = true;
        setIsConsentSheetVisible(false);
        router.push("/ai-privacy-details");
      }}
    />
  );

  const permissionRecoveryContent = getPermissionRecoveryContent(
    {
      kind: "sms-sync",
      mode: getRecoveryModeForPermissionStatus(permissionStatus),
    },
    tSettings
  );

  // ── Permission gate ──
  // The native permission dialog is only opened from the app-side rationale
  // modal so users see the explanation first.
  // All hooks are called above unconditionally to satisfy the Rules of Hooks.
  if (aiConsent.isLoading) {
    return (
      <SmsPermissionGate
        status="undetermined"
        isLoading={true}
        onRequest={handleShowPermissionRecovery}
        onOpenSettings={handleShowPermissionRecovery}
        onBack={handleBackPress}
      />
    );
  }

  if (!aiConsent.isConsented) {
    return consentSheet;
  }

  if (isPermissionLoading || permissionStatus !== "granted") {
    const gateStatus =
      permissionStatus === "denied" || permissionStatus === "blocked"
        ? permissionStatus
        : "undetermined";

    return (
      <>
        <SmsPermissionGate
          status={gateStatus}
          isLoading={isPermissionLoading}
          onRequest={handleShowPermissionRecovery}
          onOpenSettings={handleShowPermissionRecovery}
          onBack={handleBackPress}
        />
        {!isPermissionLoading && (
          <PermissionRecoveryModal
            visible={isPermissionRecoveryVisible}
            icon={permissionRecoveryContent.icon}
            onPrimaryPress={handlePermissionRecoveryPrimaryPress}
            onCancel={handlePermissionRecoveryCancel}
            title={permissionRecoveryContent.title}
            message={permissionRecoveryContent.message}
            primaryLabel={permissionRecoveryContent.primaryLabel}
            cancelLabel={tSettings("permission_not_now")}
          />
        )}
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
