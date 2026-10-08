import { useLocale } from "@/context/LocaleContext";
import { formatLocalizedCount } from "@/utils/localized-number-display";
import { PermissionRecoveryModal } from "@/components/permissions/PermissionRecoveryModal";
import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";
import {
  AddTransactionModeTabs,
  type AddTransactionMode,
} from "@/components/add-transaction/AddTransactionModeTabs";
import {
  ManualTransactionEntry,
  type ManualTransactionEntryHandle,
} from "@/components/add-transaction/ManualTransactionEntry";
import {
  VoiceTransactionEntry,
  type VoiceTransactionEntryState,
} from "@/components/add-transaction/VoiceTransactionEntry";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useAccounts } from "@/hooks/useAccounts";
import { useAiProcessingConsent } from "@/hooks/useAiProcessingConsent";
import { useCategories } from "@/hooks/useCategories";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useVoiceAiAvailability } from "@/hooks/useVoiceAiAvailability";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import { toCategoryTreeSources } from "@/utils/category-tree-source";
import { logger } from "@/utils/logger";
import { buildCategoryTree } from "@monyvi/logic";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, findNodeHandle, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

function resolveMode(value: string | undefined): AddTransactionMode {
  return value === "voice" ? "voice" : "manual";
}

function resolveOriginTabIndex(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

type MicrophoneRecoveryMode = "request" | "blocked" | null;

export default function AddTransaction(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    retry?: string;
    originTabIndex?: string;
  }>();
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");

  const requestedMode = resolveMode(params.mode);
  const [mode, setMode] = useState<AddTransactionMode>(requestedMode);
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const [isVoiceConsentVisible, setIsVoiceConsentVisible] = useState(false);
  const [isVoiceStartPending, setIsVoiceStartPending] = useState(false);
  const [microphoneRecoveryMode, setMicrophoneRecoveryMode] =
    useState<MicrophoneRecoveryMode>(null);

  const manualEntryRef = useRef<ManualTransactionEntryHandle>(null);
  const previousRequestedModeRef = useRef<AddTransactionMode>(requestedMode);
  const pendingRequestedModeRef = useRef<AddTransactionMode | null>(null);
  const manualModeHeadingRef = useRef<React.ElementRef<typeof Text>>(null);
  const voiceModeHeadingRef = useRef<React.ElementRef<typeof Text>>(null);
  const pendingModeFocusRef = useRef<AddTransactionMode | null>(null);
  const retryConsumedRef = useRef(false);
  const shouldResumeConsentAfterPrivacyRef = useRef(false);
  const isRouteMountedRef = useRef(true);
  const voiceStartGenerationRef = useRef(0);
  const voiceStartPendingRef = useRef(false);

  const aiConsent = useAiProcessingConsent();
  const { preferredCurrency } = usePreferredCurrency();
  const { accounts } = useAccounts();
  const { categories: allCategories } = useCategories({
    topLevelOnly: false,
  });

  const categoryTree = useMemo(
    () => buildCategoryTree(toCategoryTreeSources(allCategories)),
    [allCategories]
  );

  const accountInputs = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
      })),
    [accounts]
  );

  const originTabIndex = useMemo(
    () => resolveOriginTabIndex(params.originTabIndex),
    [params.originTabIndex]
  );

  // Kept active for the whole unified route so Manual can show the approved
  // compact Voice allowance strip. Failure here never blocks Manual behavior.
  const voiceAvailability = useVoiceAiAvailability(true);

  const ensureAiProcessingConsent = useCallback(async (): Promise<boolean> => {
    if (aiConsent.isLoading) return false;

    try {
      const status = await getAiProcessingConsentStatus();
      if (status.isConsented) return true;
    } catch (error: unknown) {
      logger.error("voice.aiConsentFreshStatus.failed", error);
    }

    setIsVoiceConsentVisible(true);
    return false;
  }, [aiConsent.isLoading]);

  const voiceFlow = useVoiceTransactionFlow({
    preferredCurrency,
    categories: categoryTree,
    accounts: accountInputs,
    categoryRecords: allCategories,
    originTabIndex,
    ensureAiProcessingConsent,
    onAiProcessingConsentRequired: () => {
      setIsVoiceConsentVisible(true);
    },
    voiceAvailability,
  });

  const isModeSwitchLocked =
    isVoiceStartPending || voiceFlow.isModeSwitchLocked;

  const invalidatePendingVoiceStart = useCallback((): void => {
    voiceStartGenerationRef.current += 1;
    voiceStartPendingRef.current = false;

    if (isRouteMountedRef.current) {
      setIsVoiceStartPending(false);
    }
  }, []);

  useEffect(() => {
    isRouteMountedRef.current = true;

    return () => {
      isRouteMountedRef.current = false;
      voiceStartGenerationRef.current += 1;
      voiceStartPendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const previousRequestedMode = previousRequestedModeRef.current;

    if (requestedMode !== previousRequestedMode) {
      previousRequestedModeRef.current = requestedMode;

      if (isModeSwitchLocked) {
        pendingRequestedModeRef.current = requestedMode;
        return;
      }

      pendingRequestedModeRef.current = null;
      setMode(requestedMode);
      return;
    }

    if (!isModeSwitchLocked && pendingRequestedModeRef.current !== null) {
      const pendingMode = pendingRequestedModeRef.current;
      pendingRequestedModeRef.current = null;
      setMode(pendingMode);
    }
  }, [isModeSwitchLocked, requestedMode]);

  useEffect(() => {
    if (voiceFlow.isMicrophonePermissionError) {
      setMicrophoneRecoveryMode("blocked");
    }
  }, [voiceFlow.isMicrophonePermissionError]);

  const requestVoiceStart = useCallback(async (): Promise<void> => {
    if (
      voiceStartPendingRef.current ||
      voiceFlow.isModeSwitchLocked ||
      aiConsent.isLoading
    ) {
      return;
    }

    const generation = ++voiceStartGenerationRef.current;
    voiceStartPendingRef.current = true;
    setIsVoiceStartPending(true);

    try {
      const hasConsent = await ensureAiProcessingConsent();
      if (
        !isRouteMountedRef.current ||
        generation !== voiceStartGenerationRef.current ||
        !hasConsent
      ) {
        return;
      }

      if (!voiceFlow.hasPermission) {
        setMicrophoneRecoveryMode("request");
        return;
      }

      await voiceFlow.startFlow({
        skipAiProcessingConsent: true,
      });
    } finally {
      if (
        isRouteMountedRef.current &&
        generation === voiceStartGenerationRef.current
      ) {
        voiceStartPendingRef.current = false;
        setIsVoiceStartPending(false);
      }
    }
  }, [
    aiConsent.isLoading,
    ensureAiProcessingConsent,
    voiceFlow.hasPermission,
    voiceFlow.isModeSwitchLocked,
    voiceFlow.startFlow,
  ]);

  useEffect(() => {
    if (params.retry !== "true") {
      retryConsumedRef.current = false;
      return;
    }

    if (
      retryConsumedRef.current ||
      requestedMode !== "voice" ||
      aiConsent.isLoading
    ) {
      return;
    }

    retryConsumedRef.current = true;
    router.setParams({ retry: undefined });
    void requestVoiceStart();
  }, [
    aiConsent.isLoading,
    params.retry,
    requestVoiceStart,
    requestedMode,
    router,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldResumeConsentAfterPrivacyRef.current) return;

      shouldResumeConsentAfterPrivacyRef.current = false;

      if (!aiConsent.isLoading && !aiConsent.isConsented) {
        setIsVoiceConsentVisible(true);
      }
    }, [aiConsent.isConsented, aiConsent.isLoading])
  );

  const handleModeChange = useCallback(
    (nextMode: AddTransactionMode): void => {
      if (isModeSwitchLocked || nextMode === mode) {
        return;
      }

      setMicrophoneRecoveryMode(null);
      pendingModeFocusRef.current = nextMode;
      setMode(nextMode);
    },
    [isModeSwitchLocked, mode]
  );

  const handleBack = useCallback(async (): Promise<void> => {
    invalidatePendingVoiceStart();

    if (mode === "voice") {
      await voiceFlow.discardRecording();
    }

    if (isRouteMountedRef.current) {
      router.back();
    }
  }, [invalidatePendingVoiceStart, mode, router, voiceFlow.discardRecording]);

  useEffect(() => {
    if (pendingModeFocusRef.current !== mode) {
      return;
    }

    pendingModeFocusRef.current = null;

    const frame = requestAnimationFrame(() => {
      const target =
        mode === "manual"
          ? manualModeHeadingRef.current
          : voiceModeHeadingRef.current;

      if (!target) return;

      const node = findNodeHandle(target);
      if (node !== null) {
        AccessibilityInfo.setAccessibilityFocus(node);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const handleMicrophoneRecoveryPrimary = useCallback((): void => {
    const recoveryMode = microphoneRecoveryMode;

    if (recoveryMode === null) return;

    setMicrophoneRecoveryMode(null);

    if (recoveryMode === "blocked") {
      void voiceFlow.openMicrophoneSettings();
      return;
    }

    // This is the only path that reaches the native permission request.
    void voiceFlow.startFlow({
      skipAiProcessingConsent: true,
    });
  }, [
    microphoneRecoveryMode,
    voiceFlow.openMicrophoneSettings,
    voiceFlow.startFlow,
  ]);

  const handleMicrophoneRecoveryCancel = useCallback((): void => {
    setMicrophoneRecoveryMode(null);
    handleModeChange("manual");
  }, [handleModeChange]);

  const handleTryAgain = useCallback(async (): Promise<void> => {
    if (voiceFlow.canRetrySubmission) {
      await voiceFlow.retrySubmission();
      return;
    }

    if (voiceFlow.flowStatus === "error") {
      await voiceFlow.retryRecording();
      return;
    }

    await requestVoiceStart();
  }, [
    requestVoiceStart,
    voiceFlow.canRetrySubmission,
    voiceFlow.flowStatus,
    voiceFlow.retryRecording,
    voiceFlow.retrySubmission,
  ]);

  const voiceState = useMemo<VoiceTransactionEntryState>(() => {
    if (microphoneRecoveryMode === "request") {
      return "permission-explanation";
    }

    if (voiceFlow.isFinalizing) {
      return "processing";
    }

    switch (voiceFlow.flowStatus) {
      case "recording":
        return "recording";
      case "paused":
        return "paused";
      case "completed":
        return "completed";
      case "analyzing":
        return "processing";
      case "error":
        return voiceFlow.isMicrophonePermissionError
          ? "permission-denied"
          : "error";
    }

    if (voiceFlow.refusalReason === "already_processed_result_unavailable") {
      return "replay";
    }

    const hasReadyAuthoritativeAvailability =
      voiceAvailability.availability !== null &&
      voiceAvailability.availability.reason === null &&
      (voiceAvailability.availability.remaining === null ||
        voiceAvailability.availability.remaining > 0);

    if (
      voiceAvailability.availability?.reason === "daily_limit" ||
      voiceAvailability.availability?.remaining === 0 ||
      (voiceFlow.refusalReason === "daily_limit" &&
        !hasReadyAuthoritativeAvailability)
    ) {
      return "daily-limit";
    }

    if (
      voiceAvailability.availability?.reason === "burst_limit" ||
      (voiceFlow.refusalReason === "burst_limit" &&
        !hasReadyAuthoritativeAvailability)
    ) {
      return "burst-limit";
    }

    if (voiceAvailability.error?.kind === "consent_required") {
      return "idle";
    }

    if (voiceAvailability.error !== null) {
      return "unavailable";
    }

    if (voiceAvailability.availability === null) {
      return "loading";
    }

    return "idle";
  }, [
    microphoneRecoveryMode,
    voiceAvailability.availability,
    voiceAvailability.error,
    voiceFlow.flowStatus,
    voiceFlow.isFinalizing,
    voiceFlow.isMicrophonePermissionError,
    voiceFlow.refusalReason,
  ]);

  const isManualMode = mode === "manual";
  const availability = voiceAvailability.availability;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <PageHeader
        title={t("new_transaction")}
        showDrawer={false}
        showBackButton
        backIcon="arrow"
        onBack={() => {
          void handleBack();
        }}
        rightAction={
          isManualMode
            ? {
                label: t("save"),
                loading: isManualSubmitting,
                onPress: () => {
                  void manualEntryRef.current?.save();
                },
              }
            : undefined
        }
      />

      <AddTransactionModeTabs
        mode={mode}
        disabled={isModeSwitchLocked}
        manualLabel={t("add_transaction_mode_manual")}
        voiceLabel={t("add_transaction_mode_voice")}
        onModeChange={handleModeChange}
      />

      <View className="mt-3 flex-1">
        <View
          className={isManualMode ? "flex-1" : "hidden"}
          accessibilityElementsHidden={!isManualMode}
          importantForAccessibility={
            isManualMode ? "auto" : "no-hide-descendants"
          }
          pointerEvents={isManualMode ? "auto" : "none"}
        >
          <Text
            ref={manualModeHeadingRef}
            accessible
            accessibilityRole="header"
            accessibilityLabel={t("add_transaction_mode_manual")}
            className="absolute h-px w-px opacity-0"
          >
            {t("add_transaction_mode_manual")}
          </Text>
          <ManualVoiceAllowanceStrip
            remaining={availability?.remaining ?? null}
            dailyLimit={availability?.dailyLimit ?? null}
            isUnavailable={voiceAvailability.error !== null}
          />

          <View className="flex-1">
            <ManualTransactionEntry
              ref={manualEntryRef}
              onSubmittingChange={setIsManualSubmitting}
            />
          </View>
        </View>

        <View
          className={isManualMode ? "hidden" : "flex-1"}
          accessibilityElementsHidden={isManualMode}
          importantForAccessibility={
            isManualMode ? "no-hide-descendants" : "auto"
          }
          pointerEvents={isManualMode ? "none" : "auto"}
        >
          <Text
            ref={voiceModeHeadingRef}
            accessible
            accessibilityRole="header"
            accessibilityLabel={t("add_transaction_mode_voice")}
            className="absolute h-px w-px opacity-0"
          >
            {t("add_transaction_mode_voice")}
          </Text>
          <VoiceTransactionEntry
            state={voiceState}
            remaining={availability?.remaining ?? null}
            dailyLimit={availability?.dailyLimit ?? null}
            durationMs={voiceFlow.durationMs}
            errorMessage={voiceFlow.errorMessage}
            onStart={() => {
              void requestVoiceStart();
            }}
            onPause={voiceFlow.pauseRecording}
            onResume={voiceFlow.resumeRecording}
            onSubmit={() => {
              void voiceFlow.submitRecording();
            }}
            onDiscard={() => {
              void voiceFlow.discardRecording();
            }}
            onTryAgain={() => {
              void handleTryAgain();
            }}
            onUseManual={() => {
              handleModeChange("manual");
            }}
            onRefreshAvailability={() => {
              void voiceAvailability.refresh();
            }}
            onOpenSettings={() => {
              void voiceFlow.openMicrophoneSettings();
            }}
            onPermissionContinue={handleMicrophoneRecoveryPrimary}
            onPermissionCancel={handleMicrophoneRecoveryCancel}
          />
        </View>
      </View>

      <AiProcessingConsentSheet
        visible={isVoiceConsentVisible}
        onContinue={async () => {
          if (voiceStartPendingRef.current || voiceFlow.isModeSwitchLocked) {
            return;
          }

          const generation = ++voiceStartGenerationRef.current;
          voiceStartPendingRef.current = true;
          setIsVoiceStartPending(true);
          let didGrantConsent = false;

          try {
            await aiConsent.grantConsent();

            if (
              !isRouteMountedRef.current ||
              generation !== voiceStartGenerationRef.current
            ) {
              return;
            }

            didGrantConsent = true;
            shouldResumeConsentAfterPrivacyRef.current = false;
            setIsVoiceConsentVisible(false);

            if (!voiceFlow.hasPermission) {
              setMicrophoneRecoveryMode("request");
              return;
            }

            await voiceFlow.startFlow({
              skipAiProcessingConsent: true,
            });
          } catch {
            if (
              !isRouteMountedRef.current ||
              generation !== voiceStartGenerationRef.current
            ) {
              return;
            }

            shouldResumeConsentAfterPrivacyRef.current = false;
            setIsVoiceConsentVisible(didGrantConsent ? false : true);
          } finally {
            if (
              isRouteMountedRef.current &&
              generation === voiceStartGenerationRef.current
            ) {
              voiceStartPendingRef.current = false;
              setIsVoiceStartPending(false);
            }
          }
        }}
        onNotNow={() => {
          shouldResumeConsentAfterPrivacyRef.current = false;
          setIsVoiceConsentVisible(false);
        }}
        onPrivacyDetails={() => {
          shouldResumeConsentAfterPrivacyRef.current = true;
          setIsVoiceConsentVisible(false);
          router.push("/privacy-details");
        }}
      />

      <PermissionRecoveryModal
        visible={microphoneRecoveryMode !== null}
        icon={
          microphoneRecoveryMode === "blocked"
            ? "settings-outline"
            : "mic-outline"
        }
        title={tCommon("voice_recording_label")}
        message={
          microphoneRecoveryMode === "blocked"
            ? tCommon("voice_microphone_permission_error")
            : tCommon("voice_recording_hint")
        }
        primaryLabel={
          microphoneRecoveryMode === "blocked"
            ? tCommon("open_settings")
            : tCommon("continue")
        }
        cancelLabel={t("voice_action_use_manual")}
        onPrimaryPress={handleMicrophoneRecoveryPrimary}
        onCancel={handleMicrophoneRecoveryCancel}
      />
    </View>
  );
}

function ManualVoiceAllowanceStrip({
  remaining,
  dailyLimit,
  isUnavailable,
}: {
  readonly remaining: number | null;
  readonly dailyLimit: number | null;
  readonly isUnavailable: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation("transactions");
  const { language } = useLocale();

  const hasMeteredAllowance = remaining !== null && dailyLimit !== null;

  if (!hasMeteredAllowance && !isUnavailable) {
    return null;
  }

  const formattedRemaining =
    remaining === null ? null : formatLocalizedCount(remaining, language);
  const formattedLimit =
    dailyLimit === null ? null : formatLocalizedCount(dailyLimit, language);

  return (
    <View
      className="mx-4 mb-1 mt-3 min-h-[68px] justify-center rounded-2xl border border-slate-200 bg-slate-25 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
      accessibilityLiveRegion="polite"
    >
      {formattedRemaining !== null && formattedLimit !== null ? (
        <>
          <Text className="text-sm font-semibold text-slate-800 dark:text-slate-25">
            {t("voice_limit_heading")}
          </Text>

          <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t("voice_limit_remaining", {
              remaining: formattedRemaining,
              limit: formattedLimit,
            })}
          </Text>
        </>
      ) : (
        <Text className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t("voice_limit_unavailable")}
        </Text>
      )}
    </View>
  );
}
