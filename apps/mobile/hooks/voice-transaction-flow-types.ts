import type { Category } from "@monyvi/db";
import type {
  VoiceQuotaRefusal,
  VoiceAvailabilitySnapshot,
} from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import type { MicrophonePermissionStatus } from "./useMicrophonePermission";

/**
 * Public and private types used by useVoiceTransactionFlow.
 * Type-only extraction: no runtime behavior or recorder ownership changes.
 */
export type VoiceFlowStatus =
  | "idle"
  | "starting"
  | "recording"
  | "paused"
  | "completed"
  | "analyzing"
  | "success"
  | "error";
export type FlowErrorKind = "microphone-permission" | "generic";

/** One actor-scoped permission answer for the route; no second route read. */
export type VoiceStartResult =
  | { readonly kind: "started" }
  | {
      readonly kind: "permission";
      readonly permissionStatus: Exclude<MicrophonePermissionStatus, "granted">;
    }
  | {
      readonly kind: "not-started";
      readonly reason:
        | "consent"
        | "availability"
        | "cancelled"
        | "actor-changed"
        | "start-failed";
    };
export interface ParserContextSnapshot {
  readonly preferredCurrency: string;
  readonly categories: string;
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly currency: string;
  }>;
  readonly categoryRecords: readonly Category[];
}
export interface RetainedSubmission extends ParserContextSnapshot {
  readonly ownerUserId: string;
  readonly audioUri: string;
  readonly requestKey: string;
  readonly callerTimeZone: string;
  readonly isConfigRetry?: boolean;
}
export interface FlowOperation {
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
  readonly permissionStatus: MicrophonePermissionStatus;
  readonly refreshPermission: () => Promise<MicrophonePermissionStatus>;
  readonly isModeSwitchLocked: boolean;
  readonly isFinalizing: boolean;
  readonly refusalReason: VoiceQuotaRefusal["reason"] | null;
  readonly canRetrySubmission: boolean;
  readonly startFlow: (options?: StartFlowOptions) => Promise<VoiceStartResult>;
  readonly pauseRecording: () => void;
  readonly resumeRecording: () => void;
  readonly submitRecording: () => Promise<void>;
  readonly retrySubmission: () => Promise<void>;
  readonly discardRecording: () => Promise<void>;
  readonly retryRecording: () => Promise<void>;
  readonly openMicrophoneSettings: () => Promise<void>;
}
export interface FlowConfig {
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
export interface StartFlowOptions {
  readonly skipAiProcessingConsent?: boolean;
  readonly requestMicrophonePermission?: boolean;
  readonly retryRecording?: boolean;
  /** Replace a pre-consent pending availability call after an explicit grant. */
  readonly supersedePendingAvailability?: boolean;
  readonly availabilitySnapshot?: VoiceAvailabilitySnapshot;
}

export interface ResumePermissionOperation {
  readonly userId: string;
  readonly generation: number;
}

export type RefusalReason = VoiceQuotaRefusal["reason"];
