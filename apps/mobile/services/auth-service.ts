/**
 * Auth Service — Authentication Flow Orchestration
 *
 * Single-responsibility service that handles authentication flows:
 * 1. OAuth sign-in — opening browser-based OAuth for Google (and future providers)
 * 2. Email/password sign-in & sign-up — with error formatting
 * 3. Password reset — triggering reset emails
 *
 * Architecture & Design Rationale:
 * - Pattern: Service-Layer Separation (Constitution IV)
 * - Why: Auth orchestration involves browser interaction, network calls,
 *   and error handling — none of which belongs in components or hooks.
 * - SOLID: SRP — this service only handles auth flow orchestration.
 *
 * @module auth-service
 */

import * as WebBrowser from "expo-web-browser";
import {
  WebBrowserResultType,
  type WebBrowserAuthSessionResult,
} from "expo-web-browser";

import { AUTH_REDIRECT_URL } from "@/constants/auth-constants";
import {
  signInWithOAuthProvider,
  supabase,
  resetPasswordForEmail as supabaseResetPassword,
  signInWithEmail as supabaseSignIn,
  signUpWithEmail as supabaseSignUp,
  type EmailAuthResult,
  type OAuthProvider,
} from "@/services/supabase";
import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

// Ensure the browser auth session can complete on warm start
WebBrowser.maybeCompleteAuthSession();

// =============================================================================
// Types
// =============================================================================

/** Error codes returned by the OAuth flow. */
type OAuthErrorCode = "cancelled" | "network" | "timeout" | "unknown";

/** Stable error codes returned when completing a native auth callback. */
type AuthCallbackErrorCode =
  | "invalid_callback"
  | "provider_error"
  | "network"
  | "timeout"
  | "unknown";

/** Result of completing a native Supabase auth callback. */
type AuthCallbackResult =
  | { success: true }
  | {
      success: false;
      error: string;
      errorCode: AuthCallbackErrorCode;
    };

/** Result of an OAuth sign-in attempt. */
type OAuthResult =
  | { success: true }
  | { success: false; error: string; errorCode: OAuthErrorCode };

/** Sentinel value to differentiate timeout from browser result. */
interface TimeoutSentinel {
  type: "TIMEOUT";
}

/** Browser result or timeout — for Promise.race. */
type BrowserOrTimeout = WebBrowserAuthSessionResult | TimeoutSentinel;

/** Cancellable timeout with cleanup. */
interface CancellableTimeout {
  promise: Promise<TimeoutSentinel>;
  cancel: () => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum time (ms) to wait for the browser to return a result. */
const OAUTH_TIMEOUT_MS = 120_000;

// =============================================================================
// Public API — OAuth
// =============================================================================

/**
 * Initiate OAuth sign-in for the specified provider.
 *
 * Opens the system browser, waits for the user to authenticate,
 * and establishes the Supabase session from the redirect URL.
 *
 * @param provider - The OAuth provider to sign in with (google, facebook, or apple)
 * @returns OAuthResult indicating success, cancellation, or error
 */
export async function signInWithOAuth(
  provider: OAuthProvider
): Promise<OAuthResult> {
  try {
    const oauthResponse = await signInWithOAuthProvider(provider);

    // Provider returned an error (e.g., network failure)
    if ("error" in oauthResponse) {
      return {
        success: false,
        error: getHumanReadableError(oauthResponse.error),
        errorCode: getErrorCode(oauthResponse.error),
      };
    }

    // Open the browser and race against a timeout
    const timeout = createCancellableTimeout(OAUTH_TIMEOUT_MS);

    const browserResult: BrowserOrTimeout = await Promise.race([
      WebBrowser.openAuthSessionAsync(oauthResponse.url, AUTH_REDIRECT_URL),
      timeout.promise,
    ]);

    // Check for timeout sentinel first
    if (isTimeoutSentinel(browserResult)) {
      WebBrowser.dismissAuthSession();
      return {
        success: false,
        error: "Sign-in took too long. Please try again.",
        errorCode: "timeout",
      };
    }

    // Browser resolved — cancel the timeout timer
    timeout.cancel();

    if (
      browserResult.type === WebBrowserResultType.CANCEL ||
      browserResult.type === WebBrowserResultType.DISMISS
    ) {
      return {
        success: false,
        error: "Sign-in was cancelled.",
        errorCode: "cancelled",
      };
    }

    // signInWithOAuth creates a session via redirect. Extract tokens
    // from the redirect URL and establish the session.
    const redirectUrl =
      browserResult.type === "success" ? browserResult.url : undefined;

    const sessionResult = await completeAuthSessionFromUrl(redirectUrl);
    if (!sessionResult.success) {
      return {
        success: false,
        error: sessionResult.error,
        errorCode: toOAuthErrorCode(sessionResult.errorCode),
      };
    }

    return { success: true };
  } catch (error: unknown) {
    // TODO: Replace with structured logging (e.g., Sentry)
    return {
      success: false,
      error: getHumanReadableError(error),
      errorCode: getErrorCode(error),
    };
  }
}

// =============================================================================
// Public API — Email/Password
// =============================================================================

/**
 * Sign up a new user with email and password.
 * Wraps the Supabase call with user-friendly error formatting.
 *
 * @param email - The user's email address
 * @param password - The user's chosen password
 * @returns Result indicating success, verification needed, or error
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<EmailAuthResult> {
  return supabaseSignUp(email, password);
}

/**
 * Sign in an existing user with email and password.
 * Wraps the Supabase call with user-friendly error formatting.
 *
 * @param email - The user's email address
 * @param password - The user's password
 * @returns Result indicating success or error
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<EmailAuthResult> {
  return supabaseSignIn(email, password);
}

/**
 * Request a password reset email for the specified address.
 *
 * @param email - The email address to send the reset link to
 * @returns Result indicating success or error
 */
export async function requestPasswordReset(
  email: string
): Promise<EmailAuthResult> {
  return supabaseResetPassword(email);
}

// =============================================================================
// Private Helpers
// =============================================================================

/**
 * Create a cancellable timeout that resolves with a TimeoutSentinel.
 * Returns both the promise and a cancel function to clear the timer
 * when the browser resolves before the timeout fires.
 *
 * Architecture & Design Rationale:
 * - Pattern: Cancellable Promise (resource cleanup)
 * - Why: Plain Promise.race leaks the timer when the browser wins,
 *   and leaves the browser open when the timeout wins.
 */
function createCancellableTimeout(ms: number): CancellableTimeout {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const promise = new Promise<TimeoutSentinel>((resolve) => {
    timerId = setTimeout(() => {
      resolve({ type: "TIMEOUT" });
    }, ms);
  });

  const cancel = (): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return { promise, cancel };
}

/**
 * Type guard for the timeout sentinel.
 */
function isTimeoutSentinel(
  result: BrowserOrTimeout
): result is TimeoutSentinel {
  return "type" in result && result.type === "TIMEOUT";
}

/**
 * Complete a native Supabase auth callback by establishing the returned session.
 *
 * Supported callback shapes:
 * - Fragment tokens (implicit flow):
 *   `#access_token=...&refresh_token=...`
 * - Query authorization code (PKCE flow): `?code=...`
 *
 * Provider-declared callback failures are detected before any session mutation.
 * Raw callback URLs and auth material are never returned in errors.
 */
export async function completeAuthSessionFromUrl(
  url: string | undefined
): Promise<AuthCallbackResult> {
  if (!url) {
    return {
      success: false,
      error: "No redirect URL received from the browser.",
      errorCode: "invalid_callback",
    };
  }

  const fragmentParams = getCallbackParams(url, "#");
  const queryParams = getCallbackParams(url, "?");

  const providerError =
    fragmentParams?.get("error") ??
    fragmentParams?.get("error_code") ??
    queryParams?.get("error") ??
    queryParams?.get("error_code");

  if (providerError) {
    return {
      success: false,
      error: "Authentication could not be completed. Please try again.",
      errorCode: "provider_error",
    };
  }

  const accessToken = fragmentParams?.get("access_token");
  const refreshToken = fragmentParams?.get("refresh_token");

  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) {
      return {
        success: false,
        error: "Could not extract session from the sign-in response.",
        errorCode: "invalid_callback",
      };
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      const errorCode = getErrorCode(error);
      return {
        success: false,
        error: getHumanReadableError(error),
        errorCode: toAuthCallbackErrorCode(errorCode),
      };
    }

    return { success: true };
  }

  const code = queryParams?.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const errorCode = getErrorCode(error);
      return {
        success: false,
        error: getHumanReadableError(error),
        errorCode: toAuthCallbackErrorCode(errorCode),
      };
    }

    return { success: true };
  }

  return {
    success: false,
    error: "Could not extract session from the sign-in response.",
    errorCode: "invalid_callback",
  };
}

/**
 * Read one delimited callback parameter section without including a later
 * fragment marker in the query string.
 */
function getCallbackParams(
  url: string,
  marker: "#" | "?"
): URLSearchParams | null {
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const startIndex = markerIndex + 1;
  const endIndex =
    marker === "?"
      ? (() => {
          const hashIndex = url.indexOf("#", startIndex);
          return hashIndex === -1 ? url.length : hashIndex;
        })()
      : url.length;
  const encodedParams = url.slice(startIndex, endIndex);

  return encodedParams ? new URLSearchParams(encodedParams) : null;
}

function toAuthCallbackErrorCode(
  errorCode: OAuthErrorCode
): AuthCallbackErrorCode {
  if (errorCode === "network" || errorCode === "timeout") {
    return errorCode;
  }

  return "unknown";
}

function toOAuthErrorCode(
  errorCode: AuthCallbackErrorCode
): OAuthErrorCode {
  if (errorCode === "network" || errorCode === "timeout") {
    return errorCode;
  }

  return "unknown";
}

/**
 * Translate Supabase errors into user-friendly text.
 *
 * Uses `AuthError.code` for API errors (stable across SDK versions)
 * and `isAuthRetryableFetchError` for network-level failures.
 *
 * Architecture & Design Rationale:
 * - Pattern: Strategy (code-based dispatch replaces fragile string matching)
 * - SOLID: Open/Closed — add new `case` branches without modifying existing logic
 */
function getHumanReadableError(error: unknown): string {
  // Network-level failures (no response from server)
  if (isAuthRetryableFetchError(error)) {
    return "No internet connection. Please check your network and try again.";
  }

  // API-level errors with structured error codes
  if (isAuthError(error) && error.code) {
    switch (error.code) {
      case "user_already_exists":
        return "An account with this email already exists. Please sign in instead.";
      case "invalid_credentials":
        return "Invalid email or password. Please try again.";
      case "email_not_confirmed":
        return "Please verify your email address before signing in.";
      case "request_timeout":
      case "hook_timeout":
      case "hook_timeout_after_retry":
        return "Sign-in took too long. Please try again.";
      default:
        return "Something went wrong during sign-in. Please try again.";
    }
  }

  return "Something went wrong during sign-in. Please try again.";
}

/**
 * Map an error to a structured error code.
 */
function getErrorCode(error: unknown): OAuthErrorCode {
  if (isAuthRetryableFetchError(error)) {
    return "network";
  }
  if (isAuthError(error) && error.code) {
    switch (error.code) {
      case "request_timeout":
      case "hook_timeout":
      case "hook_timeout_after_retry":
        return "timeout";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

export type {
  AuthCallbackErrorCode,
  AuthCallbackResult,
  OAuthErrorCode,
  OAuthProvider,
  OAuthResult,
};
