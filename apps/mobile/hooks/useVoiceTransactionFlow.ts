import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { t } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import type { Category } from "@monyvi/db";
import { voiceRequestKeySchema, type VoiceQuotaRefusal } from "@monyvi/logic";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  isVoiceParserError,
  isVoiceQuotaParserError,
  parseVoiceWithAi,
} from "@/services/ai-voice-parser-service";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import { getDeviceTimeZone } from "@/utils/device-time-zone";
import { logger } from "@/utils/logger";
export type VoiceFlowStatus =
  | "idle"
  | "recording"
  | "paused"
  | "completed"
  | "analyzing"
  | "success"
  | "error";
type FlowErrorKind = "microphone-permission" | "generic";
interface ParserContextSnapshot {
  readonly preferredCurrency: string;
  readonly categories: string;
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly currency: string;
  }>;
  readonly categoryRecords: readonly Category[];
}
interface RetainedSubmission extends ParserContextSnapshot {
  readonly ownerUserId: string;
  readonly audioUri: string;
  readonly requestKey: string;
  readonly callerTimeZone: string;
}
interface FlowOperation {
  readonly generation: number;
  readonly userId: string;
  readonly signal: AbortSignal;
}
export interface VoiceTransactionFlowResult {
  readonly flowStatus: VoiceFlowStatus;
  readonly isOverlayVisible: boolean;
  readonly durationMs: number;
  readonly errorMessage: string | null;
  readonly isMicrophonePermissionError: boolean;
  readonly hasPermission: boolean;
  readonly isModeSwitchLocked: boolean;
  readonly isFinalizing: boolean;
  readonly refusalReason: VoiceQuotaRefusal["reason"] | null;
  readonly canRetrySubmission: boolean;
  readonly startFlow: (options?: StartFlowOptions) => Promise<void>;
  readonly pauseRecording: () => void;
  readonly resumeRecording: () => void;
  readonly submitRecording: () => Promise<void>;
  readonly retrySubmission: () => Promise<void>;
  readonly discardRecording: () => Promise<void>;
  readonly retryRecording: () => Promise<void>;
  readonly openMicrophoneSettings: () => Promise<void>;
}
interface FlowConfig {
  readonly preferredCurrency: string;
  readonly categories: string;
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly currency: string;
  }>;
  readonly categoryRecords: readonly Category[];
  readonly originTabIndex?: number;
  readonly autoStart?: boolean;
  readonly canAutoStart?: boolean;
  readonly ensureAiProcessingConsent?: () => boolean | Promise<boolean>;
  readonly hasFreshAiProcessingConsent?: () => boolean | Promise<boolean>;
  readonly onAiProcessingConsentRequired?: () => void | Promise<void>;
  readonly voiceAvailability: UseVoiceAiAvailabilityResult;
}
interface StartFlowOptions {
  readonly skipAiProcessingConsent?: boolean;
}
function microphonePermissionError(): string {
  return t("common:voice_microphone_permission_error");
}
function recordingStartError(): string {
  return t("common:voice_recording_start_failed");
}
function settingsOpenError(): string {
  return t("common:voice_settings_open_failed");
}
function recordingTooShortError(): string {
  return t("transactions:voice_recording_too_short");
}
function recordingFinalizeError(): string {
  return t("transactions:voice_recording_finalize_failed");
}
function emptyVoiceResultError(): string {
  return t("transactions:voice_no_transactions_found");
}
function quotaRefusalMessage(reason: VoiceQuotaRefusal["reason"]): string {
  switch (reason) {
    case "daily_limit":
      return t("transactions:voice_limit_exhausted");
    case "burst_limit":
      return t("transactions:voice_limit_burst");
    case "already_processed_result_unavailable":
      return t("transactions:voice_replay_unavailable");
  }
}
function createRequestKey(): string {
  return voiceRequestKeySchema.parse(randomUUID());
}
function isAvailabilityBlocked(
  availability: UseVoiceAiAvailabilityResult["availability"] | null
): boolean {
  if (availability === null) return true;
  if (availability.reason !== null) return true;
  return availability.remaining !== null && availability.remaining <= 0;
}
export function useVoiceTransactionFlow(
  config: FlowConfig
): VoiceTransactionFlowResult {
  const recorder = useVoiceRecorder();
  const { userId, isResolvingUser } = useCurrentUser();
  const [flowStatus, setFlowStatus] = useState<VoiceFlowStatus>("idle");
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FlowErrorKind | null>(null);
  const [refusalReason, setRefusalReason] = useState<
    VoiceQuotaRefusal["reason"] | null
  >(null);
  const [canRetrySubmission, setCanRetrySubmission] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const mountedRef = useRef(true);
  const currentUserIdRef = useRef(userId);
  const isResolvingUserRef = useRef(isResolvingUser);
  currentUserIdRef.current = userId;
  isResolvingUserRef.current = isResolvingUser;
  const operationGenerationRef = useRef(0);
  const operationAbortRef = useRef<AbortController | null>(null);
  const startPendingGenerationRef = useRef<number | null>(null);
  const submissionPendingGenerationRef = useRef<number | null>(null);
  const flowStatusRef = useRef<VoiceFlowStatus>("idle");
  const originTabIndexRef = useRef(config.originTabIndex ?? 0);
  const requestKeyRef = useRef<string | null>(null);
  const requestOwnerUserIdRef = useRef<string | null>(null);
  const callerTimeZoneRef = useRef<string | null>(null);
  const retainedSubmissionRef = useRef<RetainedSubmission | null>(null);
  const updateFlowStatus = useCallback((next: VoiceFlowStatus): void => {
    flowStatusRef.current = next;
    setFlowStatus(next);
  }, []);
  const clearSubmissionIdentity = useCallback((): void => {
    requestKeyRef.current = null;
    requestOwnerUserIdRef.current = null;
    callerTimeZoneRef.current = null;
    retainedSubmissionRef.current = null;
    setCanRetrySubmission(false);
  }, []);
  const invalidateOperations = useCallback((): void => {
    operationGenerationRef.current += 1;
    operationAbortRef.current?.abort();
    operationAbortRef.current = null;
  }, []);
  const beginOperation = useCallback((): FlowOperation | null => {
    const expectedUserId = userId;
    if (
      !mountedRef.current ||
      isResolvingUserRef.current ||
      expectedUserId === null ||
      currentUserIdRef.current !== expectedUserId
    ) {
      return null;
    }
    invalidateOperations();
    const controller = new AbortController();
    const generation = operationGenerationRef.current;
    operationAbortRef.current = controller;
    return {
      generation,
      userId: expectedUserId,
      signal: controller.signal,
    };
  }, [invalidateOperations, userId]);
  const isOperationCurrent = useCallback(
    (operation: FlowOperation): boolean =>
      mountedRef.current &&
      !operation.signal.aborted &&
      !isResolvingUserRef.current &&
      currentUserIdRef.current === operation.userId &&
      operationGenerationRef.current === operation.generation,
    []
  );
  const previousActorRef = useRef({
    userId,
    isResolvingUser,
  });
  useEffect(() => {
    const previous = previousActorRef.current;
    if (
      previous.userId === userId &&
      previous.isResolvingUser === isResolvingUser
    ) {
      return;
    }
    previousActorRef.current = {
      userId,
      isResolvingUser,
    };
    invalidateOperations();
    startPendingGenerationRef.current = null;
    submissionPendingGenerationRef.current = null;
    requestKeyRef.current = null;
    requestOwnerUserIdRef.current = null;
    callerTimeZoneRef.current = null;
    retainedSubmissionRef.current = null;
    setIsFinalizing(false);
    setCanRetrySubmission(false);
    setRefusalReason(null);
    setErrorMessage(null);
    setErrorKind(null);
    setIsOverlayVisible(false);
    updateFlowStatus("idle");
    void recorder.discard();
  }, [
    invalidateOperations,
    isResolvingUser,
    recorder.discard,
    updateFlowStatus,
    userId,
  ]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateOperations();
      startPendingGenerationRef.current = null;
      submissionPendingGenerationRef.current = null;
      requestKeyRef.current = null;
      requestOwnerUserIdRef.current = null;
      callerTimeZoneRef.current = null;
      retainedSubmissionRef.current = null;
      void recorder.discard();
    };
  }, [invalidateOperations, recorder.discard]);
  useEffect(() => {
    if (
      recorder.status === "completed" &&
      flowStatusRef.current === "recording"
    ) {
      updateFlowStatus("completed");
    }
  }, [recorder.status, updateFlowStatus]);
  const hasFreshAiProcessingConsent =
    useCallback(async (): Promise<boolean> => {
      if (config.hasFreshAiProcessingConsent) {
        return config.hasFreshAiProcessingConsent();
      }
      try {
        const status = await getAiProcessingConsentStatus();
        return status.isConsented;
      } catch (error: unknown) {
        logger.error("voice.aiConsentStatus.failed", error);
        return false;
      }
    }, [config.hasFreshAiProcessingConsent]);
  const discardForOperation = useCallback(
    async (operation: FlowOperation): Promise<boolean> => {
      await recorder.discard();
      return isOperationCurrent(operation);
    },
    [isOperationCurrent, recorder]
  );
  const stopForConsentLoss = useCallback(
    async (operation: FlowOperation): Promise<boolean> => {
      if (!config.ensureAiProcessingConsent) {
        return false;
      }
      const canUseAi = await hasFreshAiProcessingConsent();
      if (!isOperationCurrent(operation)) {
        return true;
      }
      if (canUseAi) {
        return false;
      }
      if (!(await discardForOperation(operation))) {
        return true;
      }
      clearSubmissionIdentity();
      setRefusalReason(null);
      setErrorMessage(null);
      setErrorKind(null);
      setIsOverlayVisible(false);
      updateFlowStatus("idle");
      return true;
    },
    [
      clearSubmissionIdentity,
      config.ensureAiProcessingConsent,
      discardForOperation,
      hasFreshAiProcessingConsent,
      isOperationCurrent,
      updateFlowStatus,
    ]
  );
  const refreshBeforeProvider = useCallback(
    async (operation: FlowOperation): Promise<boolean> => {
      if (!isOperationCurrent(operation)) {
        return false;
      }
      const availability = await config.voiceAvailability.refresh();
      return (
        isOperationCurrent(operation) && !isAvailabilityBlocked(availability)
      );
    },
    [config.voiceAvailability, isOperationCurrent]
  );
  const startFlow = useCallback(
    async (options?: StartFlowOptions): Promise<void> => {
      if (
        flowStatusRef.current !== "idle" ||
        startPendingGenerationRef.current !== null ||
        submissionPendingGenerationRef.current !== null
      ) {
        return;
      }
      const operation = beginOperation();
      if (operation === null) return;
      startPendingGenerationRef.current = operation.generation;
      try {
        if (
          !options?.skipAiProcessingConsent &&
          config.ensureAiProcessingConsent
        ) {
          const canUseAi = await config.ensureAiProcessingConsent();
          if (!isOperationCurrent(operation)) {
            return;
          }
          if (!canUseAi) return;
        }
        const callerTimeZone = getDeviceTimeZone();
        if (callerTimeZone === null || !isOperationCurrent(operation)) {
          return;
        }
        const availability = await config.voiceAvailability.refresh();
        if (!isOperationCurrent(operation)) {
          return;
        }
        if (isAvailabilityBlocked(availability)) {
          setIsOverlayVisible(false);
          updateFlowStatus("idle");
          return;
        }
        if (!recorder.hasPermission) {
          const granted = await recorder.requestPermission();
          if (!isOperationCurrent(operation)) {
            await recorder.discard();
            return;
          }
          if (!granted) {
            setErrorMessage(microphonePermissionError());
            setErrorKind("microphone-permission");
            updateFlowStatus("error");
            setIsOverlayVisible(true);
            return;
          }
        }
        const requestKey = createRequestKey();
        requestKeyRef.current = requestKey;
        requestOwnerUserIdRef.current = operation.userId;
        callerTimeZoneRef.current = callerTimeZone;
        retainedSubmissionRef.current = null;
        setCanRetrySubmission(false);
        setRefusalReason(null);
        setErrorMessage(null);
        setErrorKind(null);
        setIsOverlayVisible(true);
        originTabIndexRef.current = config.originTabIndex ?? 0;
        updateFlowStatus("recording");
        try {
          await recorder.start();
        } catch {
          if (!isOperationCurrent(operation)) {
            await recorder.discard();
            return;
          }
          clearSubmissionIdentity();
          setErrorMessage(recordingStartError());
          setErrorKind("generic");
          updateFlowStatus("error");
          return;
        }
        if (!isOperationCurrent(operation)) {
          await recorder.discard();
        }
      } finally {
        if (startPendingGenerationRef.current === operation.generation) {
          startPendingGenerationRef.current = null;
        }
      }
    },
    [
      beginOperation,
      clearSubmissionIdentity,
      config.ensureAiProcessingConsent,
      config.originTabIndex,
      config.voiceAvailability,
      isOperationCurrent,
      recorder,
      updateFlowStatus,
    ]
  );
  const startFlowRef = useRef(startFlow);
  startFlowRef.current = startFlow;
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (!config.autoStart) {
      autoStartFiredRef.current = false;
      return;
    }
    if (config.canAutoStart === false) {
      return;
    }
    if (!autoStartFiredRef.current && flowStatusRef.current === "idle") {
      autoStartFiredRef.current = true;
      void startFlowRef.current();
    }
  }, [config.autoStart, config.canAutoStart]);
  const pauseRecording = useCallback((): void => {
    if (
      !mountedRef.current ||
      isResolvingUserRef.current ||
      userId === null ||
      currentUserIdRef.current !== userId ||
      requestOwnerUserIdRef.current !== userId ||
      flowStatusRef.current !== "recording"
    ) {
      return;
    }
    recorder.pause();
    updateFlowStatus("paused");
  }, [recorder, updateFlowStatus, userId]);
  const resumeRecording = useCallback((): void => {
    if (
      !mountedRef.current ||
      isResolvingUserRef.current ||
      userId === null ||
      currentUserIdRef.current !== userId ||
      requestOwnerUserIdRef.current !== userId ||
      flowStatusRef.current !== "paused"
    ) {
      return;
    }
    recorder.resume();
    updateFlowStatus("recording");
  }, [recorder, updateFlowStatus, userId]);
  const processSubmission = useCallback(
    async (
      operation: FlowOperation,
      submission: RetainedSubmission
    ): Promise<void> => {
      if (
        !isOperationCurrent(operation) ||
        submission.ownerUserId !== operation.userId
      ) {
        return;
      }
      setIsFinalizing(false);
      updateFlowStatus("analyzing");
      if (await stopForConsentLoss(operation)) {
        return;
      }
      if (!isOperationCurrent(operation)) {
        return;
      }
      const mayStartProvider = await refreshBeforeProvider(operation);
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (!mayStartProvider) {
        if (!(await discardForOperation(operation))) {
          return;
        }
        clearSubmissionIdentity();
        setErrorMessage(null);
        setErrorKind(null);
        setIsOverlayVisible(false);
        updateFlowStatus("idle");
        return;
      }
      const aiResult = await parseVoiceWithAi({
        audioUri: submission.audioUri,
        requestKey: submission.requestKey,
        callerTimeZone: submission.callerTimeZone,
        preferredCurrency: submission.preferredCurrency,
        categories: submission.categories,
        accounts: submission.accounts,
        categoryRecords: submission.categoryRecords,
        signal: operation.signal,
      });
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (isVoiceQuotaParserError(aiResult)) {
        config.voiceAvailability.reconcileAuthoritativeSnapshot(
          aiResult.availability
        );
        if (!isOperationCurrent(operation)) {
          return;
        }
        setRefusalReason(aiResult.kind);
        setErrorMessage(quotaRefusalMessage(aiResult.kind));
        setErrorKind("generic");
        setCanRetrySubmission(false);
      }
      await config.voiceAvailability.refresh();
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (isVoiceQuotaParserError(aiResult)) {
        if (!(await discardForOperation(operation))) {
          return;
        }
        clearSubmissionIdentity();
        setIsOverlayVisible(false);
        updateFlowStatus("idle");
        return;
      }
      if (await stopForConsentLoss(operation)) {
        return;
      }
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (isVoiceParserError(aiResult)) {
        if (aiResult.kind === "network" || aiResult.kind === "timeout") {
          retainedSubmissionRef.current = submission;
          setCanRetrySubmission(true);
          setErrorMessage(aiResult.message);
          setErrorKind("generic");
          updateFlowStatus("error");
          return;
        }
        if (!(await discardForOperation(operation))) {
          return;
        }
        clearSubmissionIdentity();
        if (aiResult.kind === "consent_required") {
          setErrorMessage(null);
          setErrorKind(null);
          setIsOverlayVisible(false);
          updateFlowStatus("idle");
          if (isOperationCurrent(operation)) {
            await config.onAiProcessingConsentRequired?.();
          }
          return;
        }
        setErrorMessage(aiResult.message);
        setErrorKind("generic");
        updateFlowStatus("error");
        return;
      }
      await recorder.reset();
      if (!isOperationCurrent(operation)) {
        return;
      }
      clearSubmissionIdentity();
      if (aiResult.transactions.length === 0) {
        setRefusalReason(null);
        setErrorMessage(emptyVoiceResultError());
        setErrorKind("generic");
        setCanRetrySubmission(false);
        setIsOverlayVisible(true);
        updateFlowStatus("error");
        return;
      }
      setRefusalReason(null);
      setErrorMessage(null);
      setErrorKind(null);
      setCanRetrySubmission(false);
      setIsOverlayVisible(false);
      updateFlowStatus("success");
      router.push({
        pathname: "/voice-review",
        params: {
          transactions: JSON.stringify(aiResult.transactions),
          transcript: aiResult.transcript,
          originalTranscript: aiResult.originalTranscript,
          detectedLanguage: aiResult.detectedLanguage,
          originTabIndex: String(originTabIndexRef.current),
        },
      });
      if (isOperationCurrent(operation)) {
        updateFlowStatus("idle");
      }
    },
    [
      clearSubmissionIdentity,
      config.onAiProcessingConsentRequired,
      config.voiceAvailability,
      discardForOperation,
      isOperationCurrent,
      recorder,
      refreshBeforeProvider,
      stopForConsentLoss,
      updateFlowStatus,
    ]
  );
  const submitRecording = useCallback(async (): Promise<void> => {
    if (
      submissionPendingGenerationRef.current !== null ||
      startPendingGenerationRef.current !== null ||
      !(
        flowStatusRef.current === "recording" ||
        flowStatusRef.current === "paused" ||
        flowStatusRef.current === "completed"
      )
    ) {
      return;
    }
    const operation = beginOperation();
    if (operation === null) return;
    submissionPendingGenerationRef.current = operation.generation;
    setIsFinalizing(true);
    updateFlowStatus("completed");
    setCanRetrySubmission(false);
    try {
      if (recorder.durationMs < 1500) {
        if (!(await discardForOperation(operation))) {
          return;
        }
        clearSubmissionIdentity();
        setErrorMessage(recordingTooShortError());
        setErrorKind("generic");
        updateFlowStatus("error");
        return;
      }
      let audioUri: string;
      if (recorder.status === "completed" && recorder.audioUri) {
        audioUri = recorder.audioUri;
      } else {
        const finalized = await recorder.stop();
        if (!isOperationCurrent(operation)) {
          await recorder.discard();
          return;
        }
        if (finalized === null) {
          clearSubmissionIdentity();
          setErrorMessage(recordingFinalizeError());
          setErrorKind("generic");
          updateFlowStatus("error");
          return;
        }
        audioUri = finalized.uri;
      }
      if (!isOperationCurrent(operation)) {
        await recorder.discard();
        return;
      }
      const requestKey = requestKeyRef.current;
      const requestOwnerUserId = requestOwnerUserIdRef.current;
      const callerTimeZone = callerTimeZoneRef.current;
      if (
        requestKey === null ||
        requestOwnerUserId !== operation.userId ||
        callerTimeZone === null
      ) {
        if (!(await discardForOperation(operation))) {
          return;
        }
        clearSubmissionIdentity();
        setErrorMessage(recordingFinalizeError());
        setErrorKind("generic");
        updateFlowStatus("error");
        return;
      }
      const submission: RetainedSubmission = {
        ownerUserId: operation.userId,
        audioUri,
        requestKey,
        callerTimeZone,
        preferredCurrency: config.preferredCurrency,
        categories: config.categories,
        accounts: config.accounts.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
        })),
        categoryRecords: [...config.categoryRecords],
      };
      retainedSubmissionRef.current = submission;
      await processSubmission(operation, submission);
    } finally {
      if (submissionPendingGenerationRef.current === operation.generation) {
        setIsFinalizing(false);
        submissionPendingGenerationRef.current = null;
      }
    }
  }, [
    beginOperation,
    clearSubmissionIdentity,
    config.accounts,
    config.categories,
    config.categoryRecords,
    config.preferredCurrency,
    discardForOperation,
    isOperationCurrent,
    processSubmission,
    recorder,
    updateFlowStatus,
  ]);
  const retrySubmission = useCallback(async (): Promise<void> => {
    if (
      flowStatusRef.current !== "error" ||
      !canRetrySubmission ||
      submissionPendingGenerationRef.current !== null ||
      startPendingGenerationRef.current !== null
    ) {
      return;
    }
    const operation = beginOperation();
    if (operation === null) return;
    const retained = retainedSubmissionRef.current;
    if (retained === null || retained.ownerUserId !== operation.userId) {
      invalidateOperations();
      clearSubmissionIdentity();
      return;
    }
    submissionPendingGenerationRef.current = operation.generation;
    updateFlowStatus("analyzing");
    setCanRetrySubmission(false);
    setErrorMessage(null);
    setErrorKind(null);
    try {
      await processSubmission(operation, retained);
    } finally {
      if (submissionPendingGenerationRef.current === operation.generation) {
        submissionPendingGenerationRef.current = null;
      }
    }
  }, [
    beginOperation,
    canRetrySubmission,
    clearSubmissionIdentity,
    invalidateOperations,
    processSubmission,
    updateFlowStatus,
  ]);
  const discardRecording = useCallback(async (): Promise<void> => {
    const operation = beginOperation();
    if (operation === null) {
      await recorder.discard();
      return;
    }
    updateFlowStatus("completed");
    if (!(await discardForOperation(operation))) {
      return;
    }
    clearSubmissionIdentity();
    setRefusalReason(null);
    setErrorMessage(null);
    setErrorKind(null);
    setIsOverlayVisible(false);
    updateFlowStatus("idle");
  }, [
    beginOperation,
    clearSubmissionIdentity,
    discardForOperation,
    recorder,
    updateFlowStatus,
  ]);
  const retryRecording = useCallback(async (): Promise<void> => {
    if (
      flowStatusRef.current !== "error" ||
      startPendingGenerationRef.current !== null ||
      submissionPendingGenerationRef.current !== null
    ) {
      return;
    }
    const operation = beginOperation();
    if (operation === null) return;
    updateFlowStatus("completed");
    if (!(await discardForOperation(operation))) {
      return;
    }
    clearSubmissionIdentity();
    setRefusalReason(null);
    setErrorMessage(null);
    setErrorKind(null);
    setIsOverlayVisible(false);
    updateFlowStatus("idle");
    if (isOperationCurrent(operation)) {
      await startFlow();
    }
  }, [
    beginOperation,
    clearSubmissionIdentity,
    discardForOperation,
    isOperationCurrent,
    startFlow,
    updateFlowStatus,
  ]);
  const openMicrophoneSettings = useCallback(async (): Promise<void> => {
    const operation = beginOperation();
    if (operation === null) return;
    try {
      await Linking.openSettings();
      if (!isOperationCurrent(operation)) {
        return;
      }
      setIsOverlayVisible(false);
      updateFlowStatus("idle");
      setErrorMessage(null);
      setErrorKind(null);
    } catch {
      if (!isOperationCurrent(operation)) {
        return;
      }
      setErrorMessage(settingsOpenError());
      setErrorKind("generic");
      updateFlowStatus("error");
      setIsOverlayVisible(true);
    }
  }, [beginOperation, isOperationCurrent, updateFlowStatus]);
  const isModeSwitchLocked =
    flowStatus === "recording" ||
    flowStatus === "paused" ||
    flowStatus === "completed" ||
    flowStatus === "analyzing";
  return {
    flowStatus,
    isOverlayVisible,
    durationMs: recorder.durationMs,
    errorMessage,
    isMicrophonePermissionError: errorKind === "microphone-permission",
    hasPermission: recorder.hasPermission,
    isFinalizing,
    isModeSwitchLocked,
    refusalReason,
    canRetrySubmission,
    startFlow,
    pauseRecording,
    resumeRecording,
    submitRecording,
    retrySubmission,
    discardRecording,
    retryRecording,
    openMicrophoneSettings,
  };
}
