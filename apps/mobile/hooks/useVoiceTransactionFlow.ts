/**
 * useVoiceTransactionFlow Hook
 *
 * Orchestrates the full voice-to-transaction flow:
 * 1. Recording (via useVoiceRecorder)
 * 2. AI submission (via ai-voice-parser-service)
 * 3. Navigation to review screen on success
 *
 * Architecture & Design Rationale:
 * - Pattern: Orchestrator / Facade
 * - Why: Coordinates multiple concerns (recording, AI submission,
 *   navigation, error handling) behind a single interface. Components
 *   consume one hook instead of managing three.
 * - SOLID: SRP — orchestration only. DIP — depends on abstractions
 *   (service functions, hook interfaces), not concrete implementations.
 *
 * @module useVoiceTransactionFlow
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { router } from "expo-router";
import { useVoiceRecorder } from "./useVoiceRecorder";
import {
  parseVoiceWithAi,
  isVoiceParserError,
} from "@/services/ai-voice-parser-service";
import type { Category } from "@monyvi/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowStatus =
  | "idle"
  | "recording"
  | "paused"
  | "completed"
  | "analyzing"
  | "success"
  | "error";

interface VoiceTransactionFlowResult {
  /** Current flow status */
  readonly flowStatus: FlowStatus;
  /** Whether the recording overlay should be visible */
  readonly isOverlayVisible: boolean;
  /** Elapsed recording time in milliseconds */
  readonly durationMs: number;
  /** Error message for display */
  readonly errorMessage: string | null;
  /** Whether microphone permission is granted */
  readonly hasPermission: boolean;

  // Actions
  /** Open overlay and start recording */
  readonly startFlow: (options?: StartFlowOptions) => Promise<void>;
  /** Pause recording */
  readonly pauseRecording: () => void;
  /** Resume recording */
  readonly resumeRecording: () => void;
  /** Stop recording and submit to AI */
  readonly submitRecording: () => Promise<void>;
  /** Discard recording and close overlay */
  readonly discardRecording: () => Promise<void>;
  /** Retry recording from error state */
  readonly retryRecording: () => Promise<void>;
}

interface FlowConfig {
  /** User's preferred currency code */
  readonly preferredCurrency: string;
  /** User's category tree string */
  readonly categories: string;
  /** User's accounts for AI matching */
  readonly accounts: ReadonlyArray<{
    id: string;
    name: string;
    currency: string;
  }>;
  /** User's categories from the database — used for AI category → ID resolution */
  readonly categoryRecords: readonly Category[];
  /** Origin tab index (for post-save navigation) */
  readonly originTabIndex?: number;
  /** When true, automatically starts the voice recording on mount */
  readonly autoStart?: boolean;
  /** When false, auto-start waits without consuming the one-shot request. */
  readonly canAutoStart?: boolean;
  /** Ensure AI processing consent before recording starts. */
  readonly ensureAiProcessingConsent?: () => boolean | Promise<boolean>;
}

interface StartFlowOptions {
  readonly skipAiProcessingConsent?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceTransactionFlow(
  config: FlowConfig
): VoiceTransactionFlowResult {
  const recorder = useVoiceRecorder();

  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store origin tab for post-save navigation
  const originTabIndexRef = useRef(config.originTabIndex ?? 0);

  // Track flow status in a ref to avoid stale closure in startFlow guard
  const flowStatusRef = useRef<FlowStatus>("idle");

  /** Update both React state and ref to keep concurrency guard in sync */
  const updateFlowStatus = useCallback((next: FlowStatus): void => {
    flowStatusRef.current = next;
    setFlowStatus(next);
  }, []);

  // ---------------------------------------------------------------------------
  // Sync recorder auto-stop to flow status (FR-004)
  // ---------------------------------------------------------------------------
  // When useVoiceRecorder internally auto-stops at 60s, its status becomes
  // "completed" but the flow's own flowStatus stays "recording". This effect
  // bridges the gap so the overlay UI transitions to the completed state.
  useEffect(() => {
    if (
      recorder.status === "completed" &&
      flowStatusRef.current === "recording"
    ) {
      updateFlowStatus("completed");
    }
  }, [recorder.status, updateFlowStatus]);

  // ---------------------------------------------------------------------------
  // Auto-start support (for retry flow from voice-review page)
  // ---------------------------------------------------------------------------
  const autoStartFiredRef = useRef(false);
  const startFlowRef = useRef<
    ((options?: StartFlowOptions) => Promise<void>) | null
  >(null);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const startFlow = useCallback(
    async (options?: StartFlowOptions): Promise<void> => {
      // Concurrency guard — prevent overlapping recording sessions (FR-017)
      if (flowStatusRef.current !== "idle") return;

      if (
        !options?.skipAiProcessingConsent &&
        config.ensureAiProcessingConsent
      ) {
        const canUseAi = await config.ensureAiProcessingConsent();
        if (!canUseAi) return;
      }

      // Request permission first if needed
      if (!recorder.hasPermission) {
        const granted = await recorder.requestPermission();
        if (!granted) {
          setErrorMessage(
            "Microphone permission is required for voice recording. Please enable it in Settings."
          );
          updateFlowStatus("error");
          setIsOverlayVisible(true);
          return;
        }
      }

      // Reset state and start recording
      setErrorMessage(null);
      setIsOverlayVisible(true);
      updateFlowStatus("recording");
      originTabIndexRef.current = config.originTabIndex ?? 0;

      await recorder.start();
    },
    [
      recorder,
      config.ensureAiProcessingConsent,
      config.originTabIndex,
      updateFlowStatus,
    ]
  );

  // Keep ref in sync so the auto-start effect can call it
  startFlowRef.current = startFlow;

  // Fire auto-start once when autoStart transitions to true
  useEffect(() => {
    if (!config.autoStart) {
      autoStartFiredRef.current = false;
      return;
    }
    if (config.canAutoStart === false) {
      return;
    }
    if (
      !autoStartFiredRef.current &&
      flowStatusRef.current === "idle" &&
      startFlowRef.current
    ) {
      autoStartFiredRef.current = true;
      void startFlowRef.current();
    }
  }, [config.autoStart, config.canAutoStart]);

  const pauseRecording = useCallback((): void => {
    recorder.pause();
    updateFlowStatus("paused");
  }, [recorder, updateFlowStatus]);

  const resumeRecording = useCallback((): void => {
    recorder.resume();
    updateFlowStatus("recording");
  }, [recorder, updateFlowStatus]);

  const submitRecording = useCallback(async (): Promise<void> => {
    // Minimum duration guard: recordings under 1.5s are too short to contain
    // meaningful speech and tend to cause AI hallucinations on noise/silence.
    const MIN_RECORDING_DURATION_MS = 1500;
    if (recorder.durationMs < MIN_RECORDING_DURATION_MS) {
      // Stop recording and clean up temp files before returning
      await recorder.discard();
      setErrorMessage(
        "Recording too short. Please speak for at least 1.5 seconds."
      );
      updateFlowStatus("error");
      return;
    }

    // Resolve audio URI — either from an already-completed auto-stop (FR-004)
    // or by explicitly stopping the recorder now.
    let audioUri: string;

    if (recorder.status === "completed" && recorder.audioUri) {
      // Recorder already auto-stopped at 60s — use the finalized URI directly
      audioUri = recorder.audioUri;
    } else {
      // Normal path: stop recording and get the finalized URI
      const result = await recorder.stop();
      if (!result) {
        setErrorMessage("Failed to finalize recording. Please try again.");
        updateFlowStatus("error");
        return;
      }
      audioUri = result.uri;
    }

    // Show analyzing state
    updateFlowStatus("analyzing");

    if (config.ensureAiProcessingConsent) {
      const canUseAi = await config.ensureAiProcessingConsent();
      if (!canUseAi) {
        await recorder.discard();
        setIsOverlayVisible(false);
        updateFlowStatus("idle");
        return;
      }
    }

    // Submit to AI
    const aiResult = await parseVoiceWithAi({
      audioUri,
      preferredCurrency: config.preferredCurrency,
      categories: config.categories,
      accounts: config.accounts,
      categoryRecords: config.categoryRecords,
    });

    // Clean up temp audio file (FR-021)
    await recorder.discard();

    // Handle result
    if (isVoiceParserError(aiResult)) {
      setErrorMessage(aiResult.message);
      updateFlowStatus("error");
      return;
    }

    // Empty recording guard (FR-010): prevent navigation when no transactions parsed
    if (aiResult.transactions.length === 0) {
      setErrorMessage(
        "We couldn't parse any transaction from the voice note. Please try again with clearer details."
      );
      updateFlowStatus("error");
      return;
    }

    // Success — navigate to review screen
    updateFlowStatus("success");
    setIsOverlayVisible(false);

    // Navigate to voice review with parsed data
    router.push({
      pathname: "/voice-review" as never,
      params: {
        transactions: JSON.stringify(aiResult.transactions),
        transcript: aiResult.transcript,
        originalTranscript: aiResult.originalTranscript,
        detectedLanguage: aiResult.detectedLanguage,
        originTabIndex: String(originTabIndexRef.current),
      },
    });

    // Reset for next use
    await recorder.reset();
    updateFlowStatus("idle");
  }, [
    recorder,
    config.preferredCurrency,
    config.categories,
    config.accounts,
    config.categoryRecords,
    config.ensureAiProcessingConsent,
    updateFlowStatus,
  ]);

  const discardRecording = useCallback(async (): Promise<void> => {
    await recorder.discard();
    setIsOverlayVisible(false);
    updateFlowStatus("idle");
    setErrorMessage(null);
  }, [recorder, updateFlowStatus]);

  const retryRecording = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    updateFlowStatus("recording");
    await recorder.start();
  }, [recorder, updateFlowStatus]);

  return {
    flowStatus,
    isOverlayVisible,
    durationMs: recorder.durationMs,
    errorMessage,
    hasPermission: recorder.hasPermission,
    startFlow,
    pauseRecording,
    resumeRecording,
    submitRecording,
    discardRecording,
    retryRecording,
  };
}
