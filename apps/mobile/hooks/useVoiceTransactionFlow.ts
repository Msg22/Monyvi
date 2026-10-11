import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { voiceRequestKeySchema } from "@monyvi/logic";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import type * as Flow from "./voice-transaction-flow-types";
import {
  emptyVoiceResultError,
  isAvailabilityBlocked,
  microphonePermissionError,
  quotaRefusalMessage,
  recordingFinalizeError,
  recordingStartError,
  recordingTooShortError,
  settingsOpenError,
} from "./voice-flow-feedback";
import {
  isVoiceParserError,
  isVoiceQuotaParserError,
  parseVoiceWithAi,
} from "@/services/ai-voice-parser-service";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import { getDeviceTimeZone } from "@/utils/device-time-zone";
import { logger } from "@/utils/logger";
export type {
  VoiceFlowStatus,
  VoiceStartResult,
  VoiceTransactionFlowResult,
} from "./voice-transaction-flow-types";
function createRequestKey(): string {
  return voiceRequestKeySchema.parse(randomUUID());
}
export function useVoiceTransactionFlow(
  config: Flow.FlowConfig
): Flow.VoiceTransactionFlowResult {
  const {
    originTabIndex: cfgOriginTabIndex,
    hasFreshAiProcessingConsent: cfgHasFreshAiProcessingConsent,
    ensureAiProcessingConsent: cfgEnsureAiProcessingConsent,
    voiceAvailability: cfgVoiceAvailability,
    autoStart: cfgAutoStart,
    canAutoStart: cfgCanAutoStart,
    onAiProcessingConsentRequired: cfgOnAiProcessingConsentRequired,
    preferredCurrency: cfgPreferredCurrency,
    categories: cfgCategories,
    accounts: cfgAccounts,
    categoryRecords: cfgCategoryRecords,
  } = config;
  const {
    refresh: refreshVoiceAvailability,
    reconcileAuthoritativeSnapshot: reconcileVoiceAvailability,
  } = cfgVoiceAvailability;

  const recorder = useVoiceRecorder();
  const { userId, isResolvingUser } = useCurrentUser();
  const [flowStatus, setFlowStatus] = useState<Flow.VoiceFlowStatus>("idle");
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<Flow.FlowErrorKind | null>(null);
  const [refusalReason, setRefusalReason] = useState<
    Flow.RefusalReason | null
  >(null);
  const [canRetrySubmission, setCanRetrySubmission] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isStartPending, setIsStartPending] = useState(false);
  const mountedRef = useRef(true);
  const currentUserIdRef = useRef(userId);
  const isResolvingUserRef = useRef(isResolvingUser);
  currentUserIdRef.current = userId;
  isResolvingUserRef.current = isResolvingUser;
  const operationGenerationRef = useRef(0);
  const operationAbortRef = useRef<AbortController | null>(null);
  const startPendingGenerationRef = useRef<number | null>(null);
  const submissionPendingGenerationRef = useRef<number | null>(null);
  const resumePendingRef = useRef<Flow.ResumePermissionOperation | null>(null);
  const flowStatusRef = useRef<Flow.VoiceFlowStatus>("idle");
  const originTabIndexRef = useRef(cfgOriginTabIndex ?? 0);
  const requestKeyRef = useRef<string | null>(null);
  const requestOwnerUserIdRef = useRef<string | null>(null);
  const callerTimeZoneRef = useRef<string | null>(null);
  const retainedSubmissionRef = useRef<Flow.RetainedSubmission | null>(null);
  const discardRef = useRef(recorder.discard);
  discardRef.current = recorder.discard;
  const updateFlowStatus = useCallback((next: Flow.VoiceFlowStatus): void => {
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
  const beginOperation = useCallback((): Flow.FlowOperation | null => {
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
    (operation: Flow.FlowOperation): boolean =>
      mountedRef.current &&
      !operation.signal.aborted &&
      !isResolvingUserRef.current &&
      currentUserIdRef.current === operation.userId &&
      operationGenerationRef.current === operation.generation,
    []
  );
  const getStaleStartResult = useCallback(
    (operation: Flow.FlowOperation): Flow.VoiceStartResult =>
      currentUserIdRef.current !== operation.userId ||
      isResolvingUserRef.current
        ? { kind: "not-started", reason: "actor-changed" }
        : { kind: "not-started", reason: "cancelled" },
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
    setIsStartPending(false);
    setIsFinalizing(false);
    setCanRetrySubmission(false);
    setRefusalReason(null);
    setErrorMessage(null);
    setErrorKind(null);
    setIsOverlayVisible(false);
    updateFlowStatus("idle");
    void discardRef.current();
  }, [invalidateOperations, isResolvingUser, updateFlowStatus, userId]);
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
    };
  }, [invalidateOperations]);
  useEffect(() => {
    if (recorder.status === "completed" && flowStatusRef.current === "recording")
      updateFlowStatus("completed");
    if (
      recorder.status === "error" &&
      recorder.audioUri === null &&
      userId !== null &&
      !isResolvingUser &&
      requestOwnerUserIdRef.current === userId &&
      submissionPendingGenerationRef.current === null &&
      ["recording", "paused", "completed"].includes(flowStatusRef.current)
    ) {
      clearSubmissionIdentity();
      setErrorMessage(recordingFinalizeError());
      setErrorKind("generic");
      setIsOverlayVisible(true);
      updateFlowStatus("error");
    }
  }, [recorder.status, recorder.audioUri, userId, isResolvingUser,
    clearSubmissionIdentity, updateFlowStatus]);
  const hasFreshAiProcessingConsent =
    useCallback(async (): Promise<boolean> => {
      if (cfgHasFreshAiProcessingConsent) {
        return cfgHasFreshAiProcessingConsent();
      }
      try {
        const status = await getAiProcessingConsentStatus();
        return status.isConsented;
      } catch (error: unknown) {
        logger.error("voice.aiConsentStatus.failed", error);
        return false;
      }
    }, [cfgHasFreshAiProcessingConsent]);
  const discardForOperation = useCallback(
    async (operation: Flow.FlowOperation): Promise<boolean> => {
      await recorder.discard();
      return isOperationCurrent(operation);
    },
    [isOperationCurrent, recorder]
  );
  const stopForConsentLoss = useCallback(
    async (operation: Flow.FlowOperation): Promise<boolean> => {
      if (!cfgEnsureAiProcessingConsent) {
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
      cfgEnsureAiProcessingConsent,
      discardForOperation,
      hasFreshAiProcessingConsent,
      isOperationCurrent,
      updateFlowStatus,
    ]
  );
  const refreshBeforeProvider = useCallback(
    async (operation: Flow.FlowOperation): Promise<boolean> => {
      if (!isOperationCurrent(operation)) {
        return false;
      }
      const availability = await refreshVoiceAvailability();
      return (
        isOperationCurrent(operation) && !isAvailabilityBlocked(availability)
      );
    },
    [refreshVoiceAvailability, isOperationCurrent]
  );
  const startFlow = useCallback(
    async (options?: Flow.StartFlowOptions): Promise<Flow.VoiceStartResult> => {
      if (
        (flowStatusRef.current !== "idle" &&
          !(options?.retryRecording && flowStatusRef.current === "error")) ||
        startPendingGenerationRef.current !== null ||
        submissionPendingGenerationRef.current !== null
      ) {
        return { kind: "not-started", reason: "cancelled" };
      }
      const operation = beginOperation();
      if (operation === null) {
        return currentUserIdRef.current !== userId || isResolvingUserRef.current
          ? { kind: "not-started", reason: "actor-changed" }
          : { kind: "not-started", reason: "cancelled" };
      }
      startPendingGenerationRef.current = operation.generation;
      setIsStartPending(true);
      updateFlowStatus("starting");
      try {
        if (options?.retryRecording) {
          if (!(await discardForOperation(operation))) {
            return getStaleStartResult(operation);
          }
          clearSubmissionIdentity();
          setErrorMessage(null);
          setErrorKind(null);
          setRefusalReason(null);
        }
        if (!options?.skipAiProcessingConsent && cfgEnsureAiProcessingConsent) {
          const canUseAi = await cfgEnsureAiProcessingConsent();
          if (!isOperationCurrent(operation)) {
            return getStaleStartResult(operation);
          }
          if (!canUseAi) {
            updateFlowStatus("idle");
            return { kind: "not-started", reason: "consent" };
          }
        }
        const callerTimeZone = getDeviceTimeZone();
        if (!isOperationCurrent(operation)) {
          return getStaleStartResult(operation);
        }
        if (callerTimeZone === null) {
          updateFlowStatus("idle");
          return { kind: "not-started", reason: "availability" };
        }
        const availability =
          options?.availabilitySnapshot ?? (await refreshVoiceAvailability());
        if (!isOperationCurrent(operation)) {
          return getStaleStartResult(operation);
        }
        if (isAvailabilityBlocked(availability)) {
          setIsOverlayVisible(false);
          updateFlowStatus("idle");
          return { kind: "not-started", reason: "availability" };
        }
        const permission = await recorder.refreshPermission();
        if (!isOperationCurrent(operation)) {
          return getStaleStartResult(operation);
        }
        const requestedStatus =
          options?.requestMicrophonePermission === true &&
          permission === "denied"
            ? await recorder.requestPermissionStatus()
            : permission;
        if (!isOperationCurrent(operation)) {
          return getStaleStartResult(operation);
        }
        if (requestedStatus !== "granted") {
          setErrorMessage(null);
          setErrorKind(null);
          setIsOverlayVisible(false);
          updateFlowStatus("idle");
          return { kind: "permission", permissionStatus: requestedStatus };
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
        originTabIndexRef.current = cfgOriginTabIndex ?? 0;
        let didNativeRecordStart = false;
        try {
          await recorder.start({
            signal: operation.signal,
            onStarted: (): void => {
              if (isOperationCurrent(operation)) {
                didNativeRecordStart = true;
                updateFlowStatus("recording");
              }
            },
          });
        } catch {
          if (!isOperationCurrent(operation)) {
            return getStaleStartResult(operation);
          }
          clearSubmissionIdentity();
          setErrorMessage(recordingStartError());
          setErrorKind("generic");
          updateFlowStatus("error");
          return { kind: "not-started", reason: "start-failed" };
        }
        if (!isOperationCurrent(operation)) {
          return getStaleStartResult(operation);
        }
        if (!didNativeRecordStart) {
          clearSubmissionIdentity();
          setErrorMessage(recordingStartError());
          setErrorKind("generic");
          updateFlowStatus("error");
          await recorder.discard();
          return { kind: "not-started", reason: "start-failed" };
        }
        return { kind: "started" };
      } catch (error: unknown) {
        if (!isOperationCurrent(operation)) {
          return getStaleStartResult(operation);
        }
        logger.error("voice.startFlow.failed", error);
        clearSubmissionIdentity();
        setErrorMessage(recordingStartError());
        setErrorKind("generic");
        updateFlowStatus("error");
        return { kind: "not-started", reason: "start-failed" };
      } finally {
        if (startPendingGenerationRef.current === operation.generation) {
          startPendingGenerationRef.current = null;
          if (mountedRef.current) {
            setIsStartPending(false);
          }
        }
      }
    },
    [
      beginOperation,
      clearSubmissionIdentity,
      cfgEnsureAiProcessingConsent,
      cfgOriginTabIndex,
      refreshVoiceAvailability,
      discardForOperation,
      getStaleStartResult,
      isOperationCurrent,
      recorder,
      updateFlowStatus,
      userId,
    ]
  );
  const startFlowRef = useRef(startFlow);
  startFlowRef.current = startFlow;
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (!cfgAutoStart) {
      autoStartFiredRef.current = false;
      return;
    }
    if (cfgCanAutoStart === false) {
      return;
    }
    if (!autoStartFiredRef.current && flowStatusRef.current === "idle") {
      autoStartFiredRef.current = true;
      void startFlowRef.current();
    }
  }, [cfgAutoStart, cfgCanAutoStart]);
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
    if (recorder.pause()) updateFlowStatus("paused");
  }, [recorder, updateFlowStatus, userId]);
  useEffect(() => {
    if (
      recorder.status === "paused" &&
      flowStatusRef.current === "recording" &&
      !isResolvingUser &&
      userId !== null &&
      requestOwnerUserIdRef.current === userId
    )
      updateFlowStatus("paused");
  }, [isResolvingUser, recorder.status, updateFlowStatus, userId]);
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
    const pending = {
      userId,
      generation: operationGenerationRef.current,
    };
    if (
      resumePendingRef.current?.userId === pending.userId &&
      resumePendingRef.current.generation === pending.generation
    ) {
      return;
    }
    resumePendingRef.current = pending;
    void (async (): Promise<void> => {
      try {
        const permission = await recorder.refreshPermission();
        if (
          !mountedRef.current ||
          isResolvingUserRef.current ||
          currentUserIdRef.current !== pending.userId ||
          operationGenerationRef.current !== pending.generation ||
          requestOwnerUserIdRef.current !== pending.userId ||
          flowStatusRef.current !== "paused"
        ) {
          return;
        }
        if (permission === "unknown") {
          return;
        }
        if (permission !== "granted") {
          setErrorMessage(microphonePermissionError());
          setErrorKind("microphone-permission");
          setIsOverlayVisible(true);
          updateFlowStatus("error");
          return;
        }
        if (recorder.resume()) updateFlowStatus("recording");
      } catch (error: unknown) {
        logger.error("voice.resumePermission.failed", error);
      } finally {
        if (resumePendingRef.current === pending) {
          resumePendingRef.current = null;
        }
      }
    })();
  }, [recorder, updateFlowStatus, userId]);
  const processSubmission = useCallback(
    async (
      operation: Flow.FlowOperation,
      submission: Flow.RetainedSubmission,
      isRetainedRetry = false
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
      if (!isRetainedRetry) {
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
        reconcileVoiceAvailability(aiResult.availability);
        if (!isOperationCurrent(operation)) {
          return;
        }
        setRefusalReason(aiResult.kind);
        setErrorMessage(quotaRefusalMessage(aiResult.kind));
        setErrorKind("generic");
        setCanRetrySubmission(false);
      }
      await refreshVoiceAvailability();
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
        if (
          (aiResult.kind === "network" || aiResult.kind === "timeout") &&
          aiResult.retryableSameRequest === true
        ) {
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
            await cfgOnAiProcessingConsentRequired?.();
          }
          return;
        }
        setErrorMessage(aiResult.message);
        setErrorKind("generic");
        updateFlowStatus("error");
        return;
      }
      if (!(await discardForOperation(operation))) {
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
      cfgOnAiProcessingConsentRequired,
      refreshVoiceAvailability,
      reconcileVoiceAvailability,
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
      const submission: Flow.RetainedSubmission = {
        ownerUserId: operation.userId,
        audioUri,
        requestKey,
        callerTimeZone,
        preferredCurrency: cfgPreferredCurrency,
        categories: cfgCategories,
        accounts: cfgAccounts.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
        })),
        categoryRecords: [...cfgCategoryRecords],
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
    cfgAccounts,
    cfgCategories,
    cfgCategoryRecords,
    cfgPreferredCurrency,
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
      await processSubmission(operation, retained, true);
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
    startPendingGenerationRef.current = null;
    setIsStartPending(false);
    const operation = beginOperation();
    if (operation === null) {
      await recorder.discard();
      return;
    }
    updateFlowStatus("idle");
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
  const retryRecording = useCallback(
    async (): Promise<void> => {
      await startFlow({ retryRecording: true });
    },
    [startFlow]
  );
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
    isStartPending ||
    ["recording", "paused", "completed", "analyzing"].includes(flowStatus);
  return {
    flowStatus,
    isOverlayVisible,
    durationMs: recorder.durationMs,
    errorMessage,
    isMicrophonePermissionError: errorKind === "microphone-permission",
    hasPermission: recorder.hasPermission,
    permissionStatus: recorder.permissionStatus,
    refreshPermission: recorder.refreshPermission,
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
