export type PendingAiAction =
  | { kind: "sms"; mode: "incremental" | "history" }
  | { kind: "live" };
