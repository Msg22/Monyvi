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
  resendVerificationEmail,
  type OAuthProvider,
} from "@/services/supabase";

interface AuthScreenController {
  readonly screenState: AuthScreenState;
  readonly pendingEmail: string;
  readonly pendingAction: AuthPendingAction;
  readonly emailError: string | null;
  readonly networkError: string | null;
  readonly handleOAuth: (provider: OAuthProvider) => Promise<void>;
  readonly handleEmailSubmit: (
    email: string,
    password: string,
    mode: AuthMode
  ) => Promise<void>;
  readonly handleForgotPassword: (email: string) => Promise<void>;
  readonly handleResendVerification: () => Promise<void>;
  readonly handleBackToForm: () => void;
  readonly clearEmailError: () => void;
  readonly clearNetworkError: () => void;
}

export function useAuthScreenController(): AuthScreenController {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const isRequestPendingRef = useRef(false);
  const [screenState, setScreenState] = useState<AuthScreenState>("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingAction, setPendingAction] = useState<AuthPendingAction>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useDeferredRouterReplace({
    enabled: !isAuthLoading && isAuthenticated,
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
      try {
        const result =
          mode === "signUp"
            ? await signUpWithEmail(email, password)
            : await signInWithEmail(email, password);

        if (result.error) {
          setEmailError(result.error.message);
          return;
        }

        if (mode === "signUp" && result.needsVerification) {
          setPendingEmail(email);
          setScreenState("verificationPending");
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
    [beginRequest, clearTransientErrors, finishRequest, showToast, t, tCommon]
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

  const handleResendVerification = useCallback(async (): Promise<void> => {
    if (!pendingEmail || !beginRequest("verificationResend")) {
      return;
    }

    try {
      const result = await resendVerificationEmail(pendingEmail);
      if (result.error) {
        showToast({ type: "error", title: result.error.message });
        return;
      }

      showToast({ type: "success", title: t("verification_email_sent") });
    } catch {
      showToast({ type: "error", title: t("resend_verification_failed") });
    } finally {
      finishRequest();
    }
  }, [beginRequest, finishRequest, pendingEmail, showToast, t]);

  const handleBackToForm = useCallback((): void => {
    setScreenState("form");
    clearTransientErrors();
  }, [clearTransientErrors]);

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
    handleOAuth,
    handleEmailSubmit,
    handleForgotPassword,
    handleResendVerification,
    handleBackToForm,
    clearEmailError,
    clearNetworkError,
  };
}
