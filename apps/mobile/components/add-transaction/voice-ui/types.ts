import { Ionicons } from "@expo/vector-icons";

export type VoiceTransactionEntryState =
  | "loading"
  | "idle"
  | "recording"
  | "paused"
  | "completed"
  | "processing"
  | "daily-limit"
  | "burst-limit"
  | "unavailable"
  | "replay"
  | "permission-explanation"
  | "permission-denied"
  | "error";

export interface VoiceTransactionEntryProps {
  readonly state: VoiceTransactionEntryState;
  readonly remaining: number | null;
  readonly dailyLimit: number | null;
  readonly durationMs: number;
  readonly errorMessage: string | null;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSubmit: () => void;
  readonly onDiscard: () => void;
  readonly onTryAgain: () => void;
  readonly onUseManual: () => void;
  readonly onRefreshAvailability: () => void;
  readonly onOpenSettings: () => void;
  readonly onPermissionContinue: () => void;
  readonly onPermissionCancel: () => void;
}

export interface StatePresentation {
  readonly title: string | null;
  readonly description: string | null;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly centralLabel: string;
}
