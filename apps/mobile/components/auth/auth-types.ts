export type AuthMode = "signIn" | "signUp";

export type AuthScreenState =
  | "form"
  | "verificationCode"
  | "verificationSuccess"
  | "resetSent";

export type AuthPendingAction =
  | "google"
  | "email"
  | "passwordReset"
  | "verificationCode"
  | "verificationResend"
  | null;
