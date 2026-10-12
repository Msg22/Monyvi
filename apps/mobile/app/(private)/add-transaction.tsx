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
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useVoiceAiAvailability } from "@/hooks/useVoiceAiAvailability";
import { useVoiceExamplesPreference } from "@/hooks/useVoiceExamplesPreference";
import {
  useVoiceTransactionFlow,
  type VoiceStartResult,
} from "@/hooks/useVoiceTransactionFlow";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import { toCategoryTreeSources } from "@/utils/category-tree-source";
import { logger } from "@/utils/logger";
import { timeVoiceStartupStage } from "@/utils/voice-startup-timing";
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

  const requestedMode = resolveMode(params.mode);
  const [mode, setMode] = useState<AddTransactionMode>(requestedMode);
  // Voice-first navigation does not construct the expensive hidden Manual
  // form. Once selected, Manual stays mounted so its unsaved draft survives.
  const [hasMountedManual, setHasMountedManual] = useState(
    requestedMode === "manual"
  );
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
  const { userId, isResolvingUser } = useCurrentUser();
  const voiceExamplesPreference = useVoiceExamplesPreference(
    isResolvingUser ? null : userId
  );
  const actorRef = useRef({ userId, isResolvingUser });
  actorRef.current = { userId, isResolvingUser };

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

  // Voice availability remains authoritative to the Voice surface only.
  // Manual never renders quota/errors and remains usable when Voice is blocked.
  const voiceAvailability = useVoiceAiAvailability(true);

  const ensureAiProcessingConsent = useCallback(async (): Promise<boolean> => {
    if (aiConsent.isLoading) return false;
    const generation = voiceStartGenerationRef.current;
    const actor = actorRef.current.userId;
    const isCurrent = (): boolean =>
      isRouteMountedRef.current &&
      generation === voiceStartGenerationRef.current &&
      actor === actorRef.current.userId &&
      !actorRef.current.isResolvingUser;

    try {
      const status = await getAiProcessingConsentStatus();
      if (!isCurrent()) return false;
      if (status.isConsented) return true;
    } catch (error: unknown) {
      logger.error("voice.aiConsentFreshStatus.failed", error);
    }

    if (isCurrent()) setIsVoiceConsentVisible(true);
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

  const {
    isModeSwitchLocked: flowIsModeSwitchLocked,
    permissionStatus: flowPermissionStatus,
    isMicrophonePermissionError: flowIsMicrophonePermissionError,
    discardRecording: flowDiscardRecording,
    startFlow: flowStartFlow,
    openMicrophoneSettings: flowOpenMicrophoneSettings,
    flowStatus: flowFlowStatus,
    canRetrySubmission: flowCanRetrySubmission,
    retrySubmission: flowRetrySubmission,
    isFinalizing: flowIsFinalizing,
    refusalReason: flowRefusalReason,
    durationMs: flowDurationMs,
    errorMessage: flowErrorMessage,
    pauseRecording: flowPauseRecording,
    resumeRecording: flowResumeRecording,
    submitRecording: flowSubmitRecording,
  } = voiceFlow;

  const isModeSwitchLocked =
    isManualSubmitting || isVoiceStartPending || flowIsModeSwitchLocked;

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
    invalidatePendingVoiceStart();
    setMicrophoneRecoveryMode(null);
    setIsVoiceConsentVisible(false);
  }, [invalidatePendingVoiceStart, userId, isResolvingUser]);

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
    if (isVoiceStartPending || flowIsModeSwitchLocked) return;
    if (flowPermissionStatus === "granted") {
      setMicrophoneRecoveryMode(null);
      if (flowIsMicrophonePermissionError) void flowDiscardRecording();
      return;
    }
    if (flowIsMicrophonePermissionError) {
      if (flowPermissionStatus === "denied")
        setMicrophoneRecoveryMode("request");
      if (flowPermissionStatus === "blocked")
        setMicrophoneRecoveryMode("blocked");
    }
  }, [
    isVoiceStartPending,
    flowIsModeSwitchLocked,
    flowIsMicrophonePermissionError,
    flowPermissionStatus,
    flowDiscardRecording,
  ]);

  const applyVoiceStartResult = useCallback(
    (result: VoiceStartResult): void => {
      if (result.kind === "permission") {
        setMicrophoneRecoveryMode(
          result.permissionStatus === "blocked"
            ? "blocked"
            : result.permissionStatus === "denied"
              ? "request"
              : null
        );
      } else {
        setMicrophoneRecoveryMode(null);
      }
    },
    []
  );

  const requestVoiceStart = useCallback(
    async (options?: {
      readonly requestPermission?: boolean;
      readonly retryRecording?: boolean;
    }): Promise<void> => {
      if (
        voiceStartPendingRef.current ||
        flowIsModeSwitchLocked ||
        aiConsent.isLoading ||
        actorRef.current.userId === null ||
        actorRef.current.isResolvingUser
      ) {
        return;
      }

      const generation = ++voiceStartGenerationRef.current;
      const actor = actorRef.current.userId;
      const isCurrent = (): boolean =>
        isRouteMountedRef.current &&
        generation === voiceStartGenerationRef.current &&
        actorRef.current.userId === actor &&
        !actorRef.current.isResolvingUser;
      voiceStartPendingRef.current = true;
      setIsVoiceStartPending(true);

      try {
        const hasConsent = await timeVoiceStartupStage(
          "consent",
          ensureAiProcessingConsent
        );
        if (!isCurrent() || !hasConsent) return;

        // Flow owns the fresh authoritative request and can overlap it with
        // the non-prompting permission read only after consent is confirmed.
        setMicrophoneRecoveryMode(null);
        const result = await flowStartFlow({
          skipAiProcessingConsent: true,
          ...(options?.requestPermission
            ? { requestMicrophonePermission: true }
            : {}),
          ...(options?.retryRecording ? { retryRecording: true } : {}),
        });
        if (!isCurrent()) return;
        applyVoiceStartResult(result);
      } catch (error: unknown) {
        logger.error("voice.routeStart.failed", error);
      } finally {
        if (
          isRouteMountedRef.current &&
          generation === voiceStartGenerationRef.current
        ) {
          voiceStartPendingRef.current = false;
          setIsVoiceStartPending(false);
        }
      }
    },
    [
      aiConsent.isLoading,
      applyVoiceStartResult,
      ensureAiProcessingConsent,
      flowIsModeSwitchLocked,
      flowStartFlow,
    ]
  );

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
      if (nextMode === "manual") setHasMountedManual(true);
      pendingModeFocusRef.current = nextMode;
      setMode(nextMode);
    },
    [isModeSwitchLocked, mode]
  );

  const handleBack = useCallback(async (): Promise<void> => {
    // The Manual entry owns the in-flight local-first write and its single
    // post-save navigation. Back cannot race that pending submission.
    if (isManualSubmitting) return;
    invalidatePendingVoiceStart();

    if (mode === "voice") {
      await flowDiscardRecording();
    }

    if (isRouteMountedRef.current) {
      router.back();
    }
  }, [
    invalidatePendingVoiceStart,
    isManualSubmitting,
    mode,
    router,
    flowDiscardRecording,
  ]);

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
      void flowOpenMicrophoneSettings();
      return;
    }

    // This is the only path that reaches the native permission request.
    void requestVoiceStart({
      requestPermission: true,
      retryRecording: flowFlowStatus === "error",
    });
  }, [
    microphoneRecoveryMode,
    flowOpenMicrophoneSettings,
    flowFlowStatus,
    requestVoiceStart,
  ]);

  const handleMicrophoneRecoveryCancel = useCallback((): void => {
    setMicrophoneRecoveryMode(null);
    handleModeChange("manual");
  }, [handleModeChange]);

  const handleTryAgain = useCallback(async (): Promise<void> => {
    if (flowCanRetrySubmission) {
      await flowRetrySubmission();
      return;
    }

    await requestVoiceStart({
      ...(flowFlowStatus === "error" ? { retryRecording: true } : {}),
    });
  }, [
    requestVoiceStart,
    flowCanRetrySubmission,
    flowFlowStatus,
    flowRetrySubmission,
  ]);

  const handleVoiceCancel = useCallback(async (): Promise<void> => {
    invalidatePendingVoiceStart();
    setMicrophoneRecoveryMode(null);
    setIsVoiceConsentVisible(false);
    await flowDiscardRecording();
  }, [invalidatePendingVoiceStart, flowDiscardRecording]);

  const voiceState = useMemo<VoiceTransactionEntryState>(() => {
    if (
      isVoiceStartPending &&
      (flowFlowStatus === "idle" ||
        flowFlowStatus === "error" ||
        flowFlowStatus === "starting")
    )
      return "starting";
    if (microphoneRecoveryMode === "request") {
      return "permission-explanation";
    }
    if (microphoneRecoveryMode === "blocked") return "permission-denied";

    if (flowIsFinalizing) {
      return "completed";
    }

    switch (flowFlowStatus) {
      case "recording":
        return "recording";
      case "paused":
        return "paused";
      case "completed":
        return "completed";
      case "analyzing":
        return "processing";
      case "starting":
        return "starting";
      case "error":
        return flowIsMicrophonePermissionError &&
          flowPermissionStatus !== "unknown"
          ? "permission-denied"
          : "error";
    }
    if (isVoiceStartPending) return "starting";

    if (flowRefusalReason === "already_processed_result_unavailable") {
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
      (flowRefusalReason === "daily_limit" &&
        !hasReadyAuthoritativeAvailability)
    ) {
      return "daily-limit";
    }

    if (
      voiceAvailability.availability?.reason === "burst_limit" ||
      (flowRefusalReason === "burst_limit" &&
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
    isVoiceStartPending,
    voiceAvailability.availability,
    voiceAvailability.error,
    flowFlowStatus,
    flowIsFinalizing,
    flowIsMicrophonePermissionError,
    flowPermissionStatus,
    flowRefusalReason,
  ]);

  const isManualMode = mode === "manual";
  const shouldMountManual = hasMountedManual || isManualMode;
  // Also latch route-parameter changes that select Manual after Voice-first
  // navigation; no form or financial internals need restructuring.
  useEffect(() => {
    if (isManualMode && !hasMountedManual) setHasMountedManual(true);
  }, [hasMountedManual, isManualMode]);
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
          <View className="flex-1">
            {shouldMountManual ? (
              <ManualTransactionEntry
                ref={manualEntryRef}
                isActive={isManualMode}
                onSubmittingChange={setIsManualSubmitting}
              />
            ) : null}
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
            showExamples={
              !isManualMode &&
              voiceExamplesPreference.isReady &&
              !voiceExamplesPreference.hasDismissed
            }
            onDismissExamples={() => {
              void voiceExamplesPreference.dismissExamples();
            }}
            remaining={availability?.remaining ?? null}
            dailyLimit={availability?.dailyLimit ?? null}
            durationMs={flowDurationMs}
            errorMessage={flowErrorMessage}
            onStart={() => {
              void requestVoiceStart();
            }}
            onPause={flowPauseRecording}
            onResume={flowResumeRecording}
            onSubmit={() => {
              void flowSubmitRecording();
            }}
            onDiscard={() => {
              void handleVoiceCancel();
            }}
            onTryAgain={() => {
              void handleTryAgain();
            }}
            onUseManual={() => {
              handleModeChange("manual");
            }}
            onRefreshAvailability={() => {
              void requestVoiceStart();
            }}
            onOpenSettings={() => {
              void flowOpenMicrophoneSettings();
            }}
            onPermissionContinue={handleMicrophoneRecoveryPrimary}
            onPermissionCancel={handleMicrophoneRecoveryCancel}
          />
        </View>
      </View>

      <AiProcessingConsentSheet
        visible={isVoiceConsentVisible}
        onContinue={async () => {
          if (voiceStartPendingRef.current || flowIsModeSwitchLocked) {
            return;
          }

          const generation = ++voiceStartGenerationRef.current;
          const actor = actorRef.current.userId;
          const isCurrent = (): boolean =>
            isRouteMountedRef.current &&
            generation === voiceStartGenerationRef.current &&
            actor !== null &&
            actor === actorRef.current.userId &&
            !actorRef.current.isResolvingUser;
          voiceStartPendingRef.current = true;
          setIsVoiceStartPending(true);
          let didGrantConsent = false;

          try {
            await timeVoiceStartupStage("consent", () =>
              aiConsent.grantConsent()
            );

            if (!isCurrent()) {
              return;
            }

            didGrantConsent = true;
            shouldResumeConsentAfterPrivacyRef.current = false;
            setIsVoiceConsentVisible(false);

            setMicrophoneRecoveryMode(null);
            const result = await flowStartFlow({
              skipAiProcessingConsent: true,
              supersedePendingAvailability: true,
            });
            if (isCurrent()) applyVoiceStartResult(result);
          } catch {
            if (!isCurrent()) {
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
          invalidatePendingVoiceStart();
          shouldResumeConsentAfterPrivacyRef.current = false;
          setIsVoiceConsentVisible(false);
        }}
        onPrivacyDetails={() => {
          shouldResumeConsentAfterPrivacyRef.current = true;
          setIsVoiceConsentVisible(false);
          router.push("/privacy-details");
        }}
      />
    </View>
  );
}
