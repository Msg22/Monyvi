import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  AuthMode,
  AuthPendingAction,
  AuthScreenState,
} from "@/components/auth/auth-types";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { useDeferredRouterReplace } from "@/hooks/useDeferredRouterReplace";
import {
  requestPasswordReset,
  signInWithEmail,
  signInWithOAuth,
  signUpWithEmail,
} from "@/services/auth-service";
import {
  registerInitialVerificationSend,
  resendVerificationCode,
} from "@/services/email-verification-resend-service";
import {
  verifyEmailVerificationCode,
  type OAuthProvider,
} from "@/services/supabase";

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

interface AuthScreenController {
  readonly screenState: AuthScreenState;
  readonly pendingEmail: string;
  readonly pendingAction: AuthPendingAction;
  readonly emailError: string | null;
  readonly networkError: string | null;
  readonly verificationCode: string;
  readonly verificationError: string | null;
  readonly verificationExpiresAtMs: number | null;
  readonly resendAvailableAtMs: number | null;
  readonly resendLimitUntilMs: number | null;
  readonly handleOAuth: (provider: OAuthProvider) => Promise<void>;
  readonly handleEmailSubmit: (
    email: string,
    password: string,
    mode: AuthMode
  ) => Promise<void>;
  readonly handleForgotPassword: (email: string) => Promise<void>;
  readonly handleVerificationCodeChange: (value: string) => void;
  readonly handleResendVerification: () => Promise<void>;
  readonly handleContinueAfterVerification: () => void;
  readonly handleBackToForm: () => void;
  readonly clearEmailError: () => void;
  readonly clearNetworkError: () => void;
}

function normalizeVerificationCode(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    )
    .replace(/[۰-۹]/g, (digit) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    )
    .replace(/\D/g, "")
    .slice(0, 6);
}

export function useAuthScreenController(): AuthScreenController {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const isRequestPendingRef = useRef(false);
  const lastSubmittedCodeRef = useRef<string | null>(null);
  const [screenState, setScreenState] = useState<AuthScreenState>("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingAction, setPendingAction] = useState<AuthPendingAction>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [verificationExpiresAtMs, setVerificationExpiresAtMs] = useState<
    number | null
  >(null);
  const [resendAvailableAtMs, setResendAvailableAtMs] = useState<number | null>(
    null
  );
  const [resendLimitUntilMs, setResendLimitUntilMs] = useState<number | null>(
    null
  );
  const [verificationFlowActive, setVerificationFlowActive] = useState(false);

  useDeferredRouterReplace({
    enabled:
      !verificationFlowActive && !isAuthLoading && isAuthenticated,
    href: "/",
  });

  const beginRequest = useCallback((action: AuthPendingAction): boolean => {
    if (isRequestPendingRef.current) {
      return false;
    }

    isRequestPendingRef.current = true;
    setPendingAction(action);
    return true;
  }, []);

  const finishRequest = useCallback((): void => {
    isRequestPendingRef.current = false;
    setPendingAction(null);
  }, []);

  const clearTransientErrors = useCallback((): void => {
    setEmailError(null);
    setNetworkError(null);
  }, []);

  const clearVerificationState = useCallback((): void => {
    lastSubmittedCodeRef.current = null;
    setVerificationCode("");
    setVerificationError(null);
    setVerificationExpiresAtMs(null);
    setResendAvailableAtMs(null);
    setResendLimitUntilMs(null);
  }, []);

  const enterVerificationCodeState = useCallback(
    (email: string, sentNow: boolean): void => {
      const now = Date.now();
      setPendingEmail(email);
      clearVerificationState();
      if (sentNow) {
        setVerificationExpiresAtMs(now + VERIFICATION_CODE_TTL_MS);
        setResendAvailableAtMs(now + VERIFICATION_RESEND_COOLDOWN_MS);
      }
      setVerificationFlowActive(true);
      setScreenState("verificationCode");
    },
    [clearVerificationState]
  );

  const handleOAuth = useCallback(
    async (provider: OAuthProvider): Promise<void> => {
      if (!beginRequest("google")) {
        return;
      }

      clearTransientErrors();
      try {
        const result = await signInWithOAuth(provider);
        if (result.success || result.errorCode === "cancelled") {
          return;
        }

        if (result.errorCode === "network") {
          setNetworkError(result.error);
          return;
        }

        showToast({ type: "error", title: result.error });
      } catch {
        showToast({ type: "error", title: tCommon("error_generic") });
      } finally {
        finishRequest();
      }
    },
    [beginRequest, clearTransientErrors, finishRequest, showToast, tCommon]
  );

  const handleEmailSubmit = useCallback(
    async (email: string, password: string, mode: AuthMode): Promise<void> => {
      if (!beginRequest("email")) {
        return;
      }

      clearTransientErrors();
      const normalizedEmail = email.trim();
      try {
        const result =
          mode === "signUp"
            ? await signUpWithEmail(normalizedEmail, password)
            : await signInWithEmail(normalizedEmail, password);

        if (result.needsVerification) {
          enterVerificationCodeState(normalizedEmail, mode === "signUp");
          if (mode === "signUp") {
            void registerInitialVerificationSend(normalizedEmail);
          }
          return;
        }

        if (result.error) {
          setEmailError(result.error.message);
          return;
        }

        if (mode === "signUp") {
          showToast({ type: "success", title: t("account_created") });
        }
      } catch {
        setEmailError(tCommon("error_generic"));
      } finally {
        finishRequest();
      }
    },
    [
      beginRequest,
      clearTransientErrors,
      enterVerificationCodeState,
      finishRequest,
      showToast,
      t,
      tCommon,
    ]
  );

  const handleForgotPassword = useCallback(
    async (email: string): Promise<void> => {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        showToast({ type: "info", title: t("forgot_password_hint") });
        return;
      }

      if (!beginRequest("passwordReset")) {
        return;
      }

      clearTransientErrors();
      try {
        const result = await requestPasswordReset(normalizedEmail);
        if (result.error) {
          showToast({ type: "error", title: result.error.message });
          return;
        }

        setPendingEmail(normalizedEmail);
        setScreenState("resetSent");
      } catch {
        showToast({ type: "error", title: t("reset_email_failed") });
      } finally {
        finishRequest();
      }
    },
    [beginRequest, clearTransientErrors, finishRequest, showToast, t]
  );

  const submitVerificationCode = useCallback(
    async (token: string): Promise<void> => {
      if (
        !pendingEmail ||
        token.length !== 6 ||
        token === lastSubmittedCodeRef.current ||
        !beginRequest("verificationCode")
      ) {
        return;
      }

      lastSubmittedCodeRef.current = token;
      setVerificationError(null);
      try {
        const result = await verifyEmailVerificationCode(pendingEmail, token);
        if (result.success) {
          setScreenState("verificationSuccess");
          return;
        }

        lastSubmittedCodeRef.current = null;
        setVerificationCode("");
        if (result.errorCode === "otp_expired") {
          const locallyExpired =
            verificationExpiresAtMs !== null &&
            Date.now() >= verificationExpiresAtMs;
          setVerificationError(
            t(
              locallyExpired
                ? "verification_code_expired"
                : "verification_code_invalid"
            )
          );
          return;
        }

        setVerificationError(t("verification_code_failed"));
      } catch {
        lastSubmittedCodeRef.current = null;
        setVerificationCode("");
        setVerificationError(t("verification_code_failed"));
      } finally {
        finishRequest();
      }
    },
    [
      beginRequest,
      finishRequest,
      pendingEmail,
      t,
      verificationExpiresAtMs,
    ]
  );

  const handleVerificationCodeChange = useCallback(
    (value: string): void => {
      const normalizedCode = normalizeVerificationCode(value);
      setVerificationCode(normalizedCode);

      if (normalizedCode.length < 6) {
        lastSubmittedCodeRef.current = null;
        setVerificationError(null);
        return;
      }

      void submitVerificationCode(normalizedCode);
    },
    [submitVerificationCode]
  );

  const handleResendVerification = useCallback(async (): Promise<void> => {
    if (!pendingEmail || !beginRequest("verificationResend")) {
      return;
    }

    try {
      const result = await resendVerificationCode(pendingEmail);

      if (result.status === "sent") {
        lastSubmittedCodeRef.current = null;
        setVerificationCode("");
        setVerificationError(null);
        setVerificationExpiresAtMs(result.verificationExpiresAtMs);
        setResendAvailableAtMs(result.resendAvailableAtMs);
        setResendLimitUntilMs(null);
        showToast({ type: "success", title: t("verification_email_sent") });
        return;
      }

      if (result.status === "cooldown") {
        if (result.retryAtMs !== null) {
          setResendAvailableAtMs(result.retryAtMs);
        }
        showToast({ type: "info", title: t("resend_cooldown") });
        return;
      }

      if (result.status === "limit") {
        setResendAvailableAtMs(null);
        setResendLimitUntilMs(result.retryAtMs);
        showToast({ type: "info", title: t("resend_limit_reached") });
        return;
      }

      showToast({ type: "error", title: t("resend_verification_failed") });
    } catch {
      showToast({ type: "error", title: t("resend_verification_failed") });
    } finally {
      finishRequest();
    }
  }, [beginRequest, finishRequest, pendingEmail, showToast, t]);

  const handleContinueAfterVerification = useCallback((): void => {
    setVerificationFlowActive(false);
  }, []);

  const handleBackToForm = useCallback((): void => {
    setVerificationFlowActive(false);
    setScreenState("form");
    clearVerificationState();
    clearTransientErrors();
  }, [clearTransientErrors, clearVerificationState]);

  const clearEmailError = useCallback((): void => {
    setEmailError(null);
  }, []);

  const clearNetworkError = useCallback((): void => {
    setNetworkError(null);
  }, []);

  return {
    screenState,
    pendingEmail,
    pendingAction,
    emailError,
    networkError,
    verificationCode,
    verificationError,
    verificationExpiresAtMs,
    resendAvailableAtMs,
    resendLimitUntilMs,
    handleOAuth,
    handleEmailSubmit,
    handleForgotPassword,
    handleVerificationCodeChange,
    handleResendVerification,
    handleContinueAfterVerification,
    handleBackToForm,
    clearEmailError,
    clearNetworkError,
  };
}

export {
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  normalizeVerificationCode,
};
