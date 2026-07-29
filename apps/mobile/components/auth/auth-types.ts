export type AuthMode = "signIn" | "signUp";

export type AuthScreenState = "form" | "verificationPending" | "resetSent";

export type AuthPendingAction =
  | "google"
  | "email"
  | "passwordReset"
  | "verificationResend"
  | null;
