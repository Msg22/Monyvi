export type PendingAiAction =
  | { kind: "sms"; mode: "incremental" | "full" }
  | { kind: "live" };
