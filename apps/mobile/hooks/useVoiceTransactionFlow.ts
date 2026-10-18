import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Linking } from "react-native";
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
  buildConfigContext,
  buildParserPayload,
  buildSubmissionWithAccountSnapshots,
  checkAiConsentStatus,
  createRequestKey,
  isActorChanged,
  isConfigParserError,
  isModeSwitchActive,
  resolveRetriedSubmission,
  resolveStaleStartResult,
  shouldRetainParserError,
  validateAndSerializeVoiceReviewRoute,
} from "./voice-flow-submission";
import {
  isVoiceParserError,
  isVoiceQuotaParserError,
  parseVoiceWithAi,
} from "@/services/ai-voice-parser-service";
import {
  loadAccountReviewAccountSnapshots,
  type AccountReviewAccountSnapshots,
} from "@/services/account-review-read-model-service";
import { getDeviceTimeZone } from "@/utils/device-time-zone";
import { logger } from "@/utils/logger";
import {
  finishVoiceStartupStage,
  runVoiceStartupPreflight,
  timeVoiceStartupStage,
  voiceStartupClock,
} from "@/utils/voice-startup-timing";
export type {
  VoiceFlowStatus,
  VoiceStartResult,
  VoiceTransactionFlowResult,
} from "./voice-transaction-flow-types";
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
  const [refusalReason, setRefusalReason] = useState<Flow.RefusalReason | null>(
    null
  );
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
  const pauseRef = useRef(recorder.pause);
  pauseRef.current = recorder.pause;
  /** Tracks the last known AppState for offscreen guard checks. */
  const appStateRef = useRef(AppState.currentState);
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
  const resetToIdle = useCallback((): void => {
    clearSubmissionIdentity();
    setRefusalReason(null);
    setErrorMessage(null);
    setErrorKind(null);
    setIsOverlayVisible(false);
    updateFlowStatus("idle");
  }, [clearSubmissionIdentity, updateFlowStatus]);
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
      resolveStaleStartResult(
        currentUserIdRef.current,
        operation.userId,
        isResolvingUserRef.current
      ),
    []
  );
  const previousActorRef = useRef({ userId, isResolvingUser });
  useEffect(() => {
    const prev = previousActorRef.current;
    if (
      !isActorChanged(
        prev.userId,
        prev.isResolvingUser,
        userId,
        isResolvingUser
      )
    ) {
      return;
    }
    previousActorRef.current = { userId, isResolvingUser };
    invalidateOperations();
    startPendingGenerationRef.current = null;
    submissionPendingGenerationRef.current = null;
    setIsStartPending(false);
    setIsFinalizing(false);
    resetToIdle();
    void discardRef.current();
  }, [invalidateOperations, isResolvingUser, resetToIdle, userId]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateOperations();
      startPendingGenerationRef.current = null;
      submissionPendingGenerationRef.current = null;
      resumePendingRef.current = null;
      requestKeyRef.current = null;
      requestOwnerUserIdRef.current = null;
      callerTimeZoneRef.current = null;
      retainedSubmissionRef.current = null;
    };
  }, [invalidateOperations]);
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus): void => {
        appStateRef.current = nextState;
        if (nextState === "inactive" || nextState === "background") {
          resumePendingRef.current = null;
          if (flowStatusRef.current === "recording") {
            pauseRef.current();
            updateFlowStatus("paused");
          } else if (
            flowStatusRef.current === "starting" ||
            startPendingGenerationRef.current !== null
          ) {
            invalidateOperations();
            startPendingGenerationRef.current = null;
            setIsStartPending(false);
            clearSubmissionIdentity();
            setIsOverlayVisible(false);
            updateFlowStatus("idle");
            void discardRef.current().catch((error: unknown) => {
              logger.warn("voice.appStateDiscard.failed", { error });
            });
          }
        }
      }
    );
    return () => {
      subscription.remove();
    };
  }, [clearSubmissionIdentity, invalidateOperations, updateFlowStatus]);
  useEffect(() => {
    if (
      recorder.status === "completed" &&
      flowStatusRef.current === "recording"
    )
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
  }, [
    recorder.status,
    recorder.audioUri,
    userId,
    isResolvingUser,
    clearSubmissionIdentity,
    updateFlowStatus,
  ]);
  const hasFreshAiProcessingConsent = useCallback(
    (): Promise<boolean> =>
      checkAiConsentStatus(cfgHasFreshAiProcessingConsent),
    [cfgHasFreshAiProcessingConsent]
  );
  const discardForOperation = useCallback(
    async (operation: Flow.FlowOperation): Promise<boolean> => {
      await recorder.discard();
      return isOperationCurrent(operation);
    },
    [isOperationCurrent, recorder]
  );
  const stopForConsentLoss = useCallback(
    async (operation: Flow.FlowOperation): Promise<boolean> => {
      if (!cfgEnsureAiProcessingConsent) return false;
      const canUseAi = await hasFreshAiProcessingConsent();
      if (!isOperationCurrent(operation)) return true;
      if (canUseAi) return false;
      if (await discardForOperation(operation)) resetToIdle();
      return true;
    },
    [
      cfgEnsureAiProcessingConsent,
      discardForOperation,
      hasFreshAiProcessingConsent,
      isOperationCurrent,
      resetToIdle,
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
        submissionPendingGenerationRef.current !== null ||
        appStateRef.current === "inactive" ||
        appStateRef.current === "background"
      ) {
        return { kind: "not-started", reason: "cancelled" };
      }
      const operation = beginOperation();
      if (operation === null) {
        return currentUserIdRef.current !== userId || isResolvingUserRef.current
          ? { kind: "not-started", reason: "actor-changed" }
          : { kind: "not-started", reason: "cancelled" };
      }
      const isLive = (): boolean => isOperationCurrent(operation);
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
          const canUseAi = await timeVoiceStartupStage(
            "consent",
            cfgEnsureAiProcessingConsent
          );
          if (!isLive()) return getStaleStartResult(operation);
          if (!canUseAi) {
            updateFlowStatus("idle");
            return { kind: "not-started", reason: "consent" };
          }
        }
        const callerTimeZone = getDeviceTimeZone();
        if (!isLive()) return getStaleStartResult(operation);
        if (callerTimeZone === null) {
          updateFlowStatus("idle");
          return { kind: "not-started", reason: "availability" };
        }
        const [availability, permission] = await runVoiceStartupPreflight(
          () =>
            options?.availabilitySnapshot ??
            refreshVoiceAvailability(
              options?.supersedePendingAvailability
                ? { supersedePending: true }
                : undefined
            ),
          () => recorder.refreshPermission()
        );
        if (!isLive()) return getStaleStartResult(operation);
        if (isAvailabilityBlocked(availability)) {
          setIsOverlayVisible(false);
          updateFlowStatus("idle");
          return { kind: "not-started", reason: "availability" };
        }
        const requestedStatus =
          options?.requestMicrophonePermission === true &&
          permission === "denied"
            ? await recorder.requestPermissionStatus()
            : permission;
        if (!isLive()) return getStaleStartResult(operation);
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
        const nativeStartedAt = voiceStartupClock();
        try {
          await recorder.start({
            signal: operation.signal,
            onStarted: (): void => {
              if (isOperationCurrent(operation)) {
                didNativeRecordStart = true;
                finishVoiceStartupStage("native_start", nativeStartedAt);
                updateFlowStatus("recording");
              }
            },
          });
        } catch {
          if (!isLive()) return getStaleStartResult(operation);
          clearSubmissionIdentity();
          setErrorMessage(recordingStartError());
          setErrorKind("generic");
          updateFlowStatus("error");
          return { kind: "not-started", reason: "start-failed" };
        }
        if (!isLive()) return getStaleStartResult(operation);
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
        if (!isLive()) return getStaleStartResult(operation);
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
      flowStatusRef.current !== "paused" ||
      appStateRef.current === "inactive" ||
      appStateRef.current === "background"
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
          flowStatusRef.current !== "paused" ||
          appStateRef.current === "inactive" ||
          appStateRef.current === "background" ||
          resumePendingRef.current !== pending
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
      if (await stopForConsentLoss(operation)) return;
      if (!isOperationCurrent(operation)) return;
      if (!isRetainedRetry) {
        const mayStartProvider = await refreshBeforeProvider(operation);
        if (!isOperationCurrent(operation)) return;
        if (!mayStartProvider) {
          if (await discardForOperation(operation)) resetToIdle();
          return;
        }
      }
      const aiResult = await parseVoiceWithAi(
        buildParserPayload(submission, operation.signal)
      );
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (isVoiceQuotaParserError(aiResult)) {
        reconcileVoiceAvailability(aiResult.availability);
        if (!isOperationCurrent(operation)) return;
        setRefusalReason(aiResult.kind);
        setErrorMessage(quotaRefusalMessage(aiResult.kind));
        setErrorKind("generic");
        setCanRetrySubmission(false);
        await refreshVoiceAvailability();
        if (!isOperationCurrent(operation)) return;
        if (!(await discardForOperation(operation))) return;
        clearSubmissionIdentity();
        setIsOverlayVisible(false);
        updateFlowStatus("idle");
        return;
      }
      await refreshVoiceAvailability();
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (await stopForConsentLoss(operation)) {
        return;
      }
      if (!isOperationCurrent(operation)) {
        return;
      }
      if (isVoiceParserError(aiResult)) {
        const canRetry =
          shouldRetainParserError(aiResult.kind) &&
          aiResult.retryableSameRequest === true;
        if (canRetry) {
          retainedSubmissionRef.current = {
            ...submission,
            isConfigRetry: isConfigParserError(aiResult.kind),
          };
          setCanRetrySubmission(true);
        } else {
          if (!(await discardForOperation(operation))) return;
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
      const failClosedWithError = (message: string): void => {
        setRefusalReason(null);
        setErrorMessage(message);
        setErrorKind("generic");
        setCanRetrySubmission(false);
        setIsOverlayVisible(true);
        updateFlowStatus("error");
      };
      if (aiResult.transactions.length === 0) {
        failClosedWithError(emptyVoiceResultError());
        return;
      }
      const routeParams = validateAndSerializeVoiceReviewRoute(
        aiResult,
        operation.userId,
        originTabIndexRef.current
      );
      if (!routeParams) {
        failClosedWithError(recordingFinalizeError());
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
        params: routeParams,
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
      refreshBeforeProvider,
      resetToIdle,
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
      const failSubmission = async (
        message: string = recordingFinalizeError()
      ): Promise<void> => {
        if (!(await discardForOperation(operation))) return;
        clearSubmissionIdentity();
        setErrorMessage(message);
        setErrorKind("generic");
        updateFlowStatus("error");
      };
      if (recorder.durationMs < 1500) {
        await failSubmission(recordingTooShortError());
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
          await failSubmission();
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
        await failSubmission();
        return;
      }
      let reviewAccountSnapshots: AccountReviewAccountSnapshots;
      try {
        reviewAccountSnapshots = await loadAccountReviewAccountSnapshots();
      } catch {
        await failSubmission();
        return;
      }
      if (!isOperationCurrent(operation)) {
        await discardForOperation(operation);
        return;
      }
      if (reviewAccountSnapshots.ownerId !== operation.userId) {
        await failSubmission();
        return;
      }
      const submission = buildSubmissionWithAccountSnapshots(
        operation.userId,
        audioUri,
        requestKey,
        callerTimeZone,
        config,
        reviewAccountSnapshots
      );
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
    config,
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
    const submissionToRetry = resolveRetriedSubmission(
      retained,
      buildConfigContext(config)
    );
    try {
      await processSubmission(operation, submissionToRetry, true);
    } finally {
      if (submissionPendingGenerationRef.current === operation.generation) {
        submissionPendingGenerationRef.current = null;
      }
    }
  }, [
    beginOperation,
    canRetrySubmission,
    clearSubmissionIdentity,
    config,
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
    if (!(await discardForOperation(operation))) {
      return;
    }
    resetToIdle();
  }, [beginOperation, discardForOperation, recorder, resetToIdle]);
  const retryRecording = useCallback(async (): Promise<void> => {
    await startFlow({ retryRecording: true });
  }, [startFlow]);
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
  const isModeSwitchLocked = isModeSwitchActive(isStartPending, flowStatus);
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
