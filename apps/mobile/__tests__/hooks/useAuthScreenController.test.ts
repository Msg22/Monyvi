import { act, renderHook } from "@testing-library/react-native";

import { useAuthScreenController } from "@/hooks/useAuthScreenController";
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
import { verifyEmailVerificationCode } from "@/services/supabase";

const mockShowToast = jest.fn();
const mockUseDeferredRouterReplace = jest.fn();
let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
};

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): { isAuthenticated: boolean; isLoading: boolean } =>
    mockAuthState,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { showToast: typeof mockShowToast } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@/hooks/useDeferredRouterReplace", () => ({
  useDeferredRouterReplace: (options: unknown): void => {
    mockUseDeferredRouterReplace(options);
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: (namespace: string): { t: (key: string) => string } => ({
    t: (key: string): string => `${namespace}.${key}`,
  }),
}));

jest.mock("@/services/auth-service", () => ({
  requestPasswordReset: jest.fn(),
  signInWithEmail: jest.fn(),
  signInWithOAuth: jest.fn(),
  signUpWithEmail: jest.fn(),
}));

jest.mock("@/services/email-verification-resend-service", () => ({
  registerInitialVerificationSend: jest.fn(),
  resendVerificationCode: jest.fn(),
}));

jest.mock("@/services/supabase", () => ({
  verifyEmailVerificationCode: jest.fn(),
}));

const mockRequestPasswordReset = jest.mocked(requestPasswordReset);
const mockSignInWithEmail = jest.mocked(signInWithEmail);
const mockSignInWithOAuth = jest.mocked(signInWithOAuth);
const mockSignUpWithEmail = jest.mocked(signUpWithEmail);
const mockRegisterInitialVerificationSend = jest.mocked(
  registerInitialVerificationSend
);
const mockResendVerificationCode = jest.mocked(resendVerificationCode);
const mockVerifyEmailVerificationCode = jest.mocked(
  verifyEmailVerificationCode
);

function createAuthError(message: string): never {
  return new Error(message) as never;
}

describe("useAuthScreenController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { isAuthenticated: false, isLoading: false };
  });

  it("keeps authenticated redirect contract", () => {
    renderHook(() => useAuthScreenController());

    expect(mockUseDeferredRouterReplace).toHaveBeenCalledWith({
      enabled: false,
      href: "/",
    });
  });

  it("completes OAuth success and clears pending state", async () => {
    mockSignInWithOAuth.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleOAuth("google");
    });

    expect(mockSignInWithOAuth).toHaveBeenCalledWith("google");
    expect(result.current.pendingAction).toBeNull();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("silently handles OAuth cancellation and clears pending state", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      success: false,
      error: "Sign-in was cancelled.",
      errorCode: "cancelled",
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleOAuth("google");
    });

    expect(result.current.pendingAction).toBeNull();
    expect(result.current.networkError).toBeNull();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("surfaces OAuth network errors inline", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      success: false,
      error: "Check your connection.",
      errorCode: "network",
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleOAuth("google");
    });

    expect(result.current.networkError).toBe("Check your connection.");
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("shows non-network OAuth failures as friendly toast", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      success: false,
      error: "Google sign-in failed.",
      errorCode: "unknown",
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleOAuth("google");
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "Google sign-in failed.",
    });
  });

  it("handles unexpected OAuth failures without rejecting the UI action", async () => {
    mockSignInWithOAuth.mockRejectedValue(new Error("Browser failed"));
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleOAuth("google");
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "common.error_generic",
    });
    expect(result.current.pendingAction).toBeNull();
  });

  it("ignores a second OAuth request while first remains pending", async () => {
    let resolveOAuth: ((value: { success: true }) => void) | undefined;
    mockSignInWithOAuth.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOAuth = resolve;
        })
    );
    const { result } = renderHook(() => useAuthScreenController());

    let firstRequest: Promise<void> | undefined;
    act(() => {
      firstRequest = result.current.handleOAuth("google");
      void result.current.handleOAuth("google");
    });

    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveOAuth?.({ success: true });
      await firstRequest;
    });
  });

  it("signs in with email without changing screen state", async () => {
    mockSignInWithEmail.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "user@example.com",
        "secret",
        "signIn"
      );
    });

    expect(mockSignInWithEmail).toHaveBeenCalledWith(
      "user@example.com",
      "secret"
    );
    expect(result.current.screenState).toBe("form");
    expect(result.current.emailError).toBeNull();
  });


  it("routes an unverified returning user to verification pending without raw provider error", async () => {
    mockSignInWithEmail.mockResolvedValue({
      success: false,
      needsVerification: true,
      error: createAuthError("Email not confirmed"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "  unverified@example.com  ",
        "secret",
        "signIn"
      );
    });

    expect(mockSignInWithEmail).toHaveBeenCalledWith(
      "unverified@example.com",
      "secret"
    );
    expect(result.current.pendingEmail).toBe("unverified@example.com");
    expect(result.current.screenState).toBe("verificationCode");
    expect(result.current.emailError).toBeNull();
  });

  it("shows email authentication errors inline", async () => {
    mockSignInWithEmail.mockResolvedValue({
      success: false,
      error: createAuthError("Invalid credentials"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "user@example.com",
        "secret",
        "signIn"
      );
    });

    expect(result.current.emailError).toBe("Invalid credentials");
  });

  it("moves successful sign-up requiring verification to pending state with normalized email", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "  new@example.com  ",
        "secret",
        "signUp"
      );
    });

    expect(mockSignUpWithEmail).toHaveBeenCalledWith(
      "new@example.com",
      "secret"
    );
    expect(result.current.pendingEmail).toBe("new@example.com");
    expect(result.current.screenState).toBe("verificationCode");
  });

  it("shows sign-up failures inline without changing state", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: false,
      error: createAuthError("Email already registered"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "existing@example.com",
        "secret",
        "signUp"
      );
    });

    expect(result.current.emailError).toBe("Email already registered");
    expect(result.current.screenState).toBe("form");
  });

  it("shows generic email error when service throws", async () => {
    mockSignInWithEmail.mockRejectedValue(new Error("private failure"));
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "user@example.com",
        "secret",
        "signIn"
      );
    });

    expect(result.current.emailError).toBe("common.error_generic");
  });

  it("shows reset hint instead of sending when email is empty", async () => {
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleForgotPassword("");
    });

    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "info",
      title: "auth.forgot_password_hint",
    });
  });

  it("moves successful reset request to reset-sent state", async () => {
    mockRequestPasswordReset.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleForgotPassword("user@example.com");
    });

    expect(result.current.pendingEmail).toBe("user@example.com");
    expect(result.current.screenState).toBe("resetSent");
    expect(result.current.pendingAction).toBeNull();
  });

  it("reports reset failures without showing reset confirmation", async () => {
    mockRequestPasswordReset.mockResolvedValue({
      success: false,
      error: createAuthError("Reset unavailable"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleForgotPassword("user@example.com");
    });

    expect(result.current.screenState).toBe("form");
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "Reset unavailable",
    });
  });

  it("resends verification with dedicated pending state and success toast", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockResendVerificationCode.mockResolvedValue({
      status: "sent" as const,
      sentAtMs: Date.parse("2026-10-04T10:02:01.000Z"),
      resendAvailableAtMs: Date.parse("2026-10-04T10:04:01.000Z"),
      verificationExpiresAtMs: Date.parse("2026-10-04T10:12:01.000Z"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });
    await act(async () => {
      await result.current.handleResendVerification();
    });

    expect(mockRegisterInitialVerificationSend).toHaveBeenCalledWith(
      "new@example.com"
    );
    expect(mockResendVerificationCode).toHaveBeenCalledWith("new@example.com");
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "success",
      title: "auth.verification_email_sent",
    });
    expect(result.current.pendingAction).toBeNull();
  });


  it("ignores a duplicate resend while verification resend remains pending", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });

    let resolveResend:
      | ((value: {
          status: "sent";
          sentAtMs: number;
          resendAvailableAtMs: number;
          verificationExpiresAtMs: number;
        }) => void)
      | undefined;
    mockResendVerificationCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResend = resolve;
        })
    );

    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });

    let firstResend: Promise<void> | undefined;
    act(() => {
      firstResend = result.current.handleResendVerification();
      void result.current.handleResendVerification();
    });

    expect(mockResendVerificationCode).toHaveBeenCalledTimes(1);
    expect(result.current.pendingAction).toBe("verificationResend");

    await act(async () => {
      resolveResend?.({
      status: "sent" as const,
      sentAtMs: Date.parse("2026-10-04T10:02:01.000Z"),
      resendAvailableAtMs: Date.parse("2026-10-04T10:04:01.000Z"),
      verificationExpiresAtMs: Date.parse("2026-10-04T10:12:01.000Z"),
    });
      await firstResend;
    });

    expect(result.current.pendingAction).toBeNull();
  });

  it("reports verification resend failures and clears pending state", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockResendVerificationCode.mockResolvedValue({
      status: "temporary_failure",
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });
    await act(async () => {
      await result.current.handleResendVerification();
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "auth.resend_verification_failed",
    });
    expect(result.current.pendingAction).toBeNull();
  });


  it("honors server cooldown without sending provider details to the UI", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockResendVerificationCode.mockResolvedValue({
      status: "cooldown",
      retryAtMs: Date.parse("2026-10-04T10:03:30.000Z"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });
    await act(async () => {
      await result.current.handleResendVerification();
    });

    expect(result.current.resendAvailableAtMs).toBe(
      Date.parse("2026-10-04T10:03:30.000Z")
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "info",
      title: "auth.resend_cooldown",
    });
  });

  it("honors the server 24-hour resend limit", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockResendVerificationCode.mockResolvedValue({
      status: "limit",
      retryAtMs: Date.parse("2026-10-05T10:00:00.000Z"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });
    await act(async () => {
      await result.current.handleResendVerification();
    });

    expect(result.current.resendAvailableAtMs).toBeNull();
    expect(result.current.resendLimitUntilMs).toBe(
      Date.parse("2026-10-05T10:00:00.000Z")
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "info",
      title: "auth.resend_limit_reached",
    });
  });

  it("returns to form and clears transient errors", async () => {
    mockSignInWithEmail.mockResolvedValue({
      success: false,
      error: createAuthError("Invalid credentials"),
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "user@example.com",
        "secret",
        "signIn"
      );
    });
    act(() => {
      result.current.handleBackToForm();
    });

    expect(result.current.screenState).toBe("form");
    expect(result.current.emailError).toBeNull();
    expect(result.current.networkError).toBeNull();
  });
});


describe("useAuthScreenController code-first verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { isAuthenticated: false, isLoading: false };
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts ten-minute expiry and two-minute resend cooldown after signup", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });

    expect(result.current.screenState).toBe("verificationCode");
    expect(result.current.verificationExpiresAtMs).toBe(
      Date.parse("2026-10-04T10:10:00.000Z")
    );
    expect(result.current.resendAvailableAtMs).toBe(
      Date.parse("2026-10-04T10:02:00.000Z")
    );
  });

  it("sanitizes pasted input and auto-submits exactly once at six digits", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockVerifyEmailVerificationCode.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });

    await act(async () => {
      result.current.handleVerificationCodeChange("12 3-456");
      await Promise.resolve();
    });

    expect(result.current.verificationCode).toBe("123456");
    expect(mockVerifyEmailVerificationCode).toHaveBeenCalledTimes(1);
    expect(mockVerifyEmailVerificationCode).toHaveBeenCalledWith(
      "new@example.com",
      "123456"
    );
    expect(result.current.screenState).toBe("verificationSuccess");

    await act(async () => {
      result.current.handleVerificationCodeChange("123456");
      await Promise.resolve();
    });
    expect(mockVerifyEmailVerificationCode).toHaveBeenCalledTimes(1);
  });

  it("keeps authenticated redirects suppressed through the active success state until Continue", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockVerifyEmailVerificationCode.mockResolvedValue({ success: true });
    const { result, rerender } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });
    await act(async () => {
      result.current.handleVerificationCodeChange("123456");
      await Promise.resolve();
    });

    mockAuthState = { isAuthenticated: true, isLoading: false };
    rerender();

    expect(result.current.screenState).toBe("verificationSuccess");
    expect(mockUseDeferredRouterReplace).toHaveBeenLastCalledWith({
      enabled: false,
      href: "/",
    });

    act(() => {
      result.current.handleContinueAfterVerification();
    });
    rerender();

    expect(mockUseDeferredRouterReplace).toHaveBeenLastCalledWith({
      enabled: true,
      href: "/",
    });
  });

  it("allows normal authenticated routing on a fresh mount after a verified cold restart", () => {
    mockAuthState = { isAuthenticated: true, isLoading: false };

    renderHook(() => useAuthScreenController());

    expect(mockUseDeferredRouterReplace).toHaveBeenLastCalledWith({
      enabled: true,
      href: "/",
    });
  });

  it("blocks duplicate auto-submit while the six-digit verification request is pending", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });

    let resolveVerification:
      | ((value: { success: true }) => void)
      | undefined;
    mockVerifyEmailVerificationCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerification = resolve;
        })
    );
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });

    act(() => {
      result.current.handleVerificationCodeChange("123456");
      result.current.handleVerificationCodeChange("123456");
    });

    expect(mockVerifyEmailVerificationCode).toHaveBeenCalledTimes(1);
    expect(result.current.pendingAction).toBe("verificationCode");

    await act(async () => {
      resolveVerification?.({ success: true });
      await Promise.resolve();
    });

    expect(result.current.screenState).toBe("verificationSuccess");
  });

  it("shows invalid-code copy and permits retry after verification fails", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockVerifyEmailVerificationCode
      .mockResolvedValueOnce({ success: false, errorCode: "otp_expired" })
      .mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() => useAuthScreenController());

    await act(async () => {
      await result.current.handleEmailSubmit(
        "new@example.com",
        "secret",
        "signUp"
      );
    });

    await act(async () => {
      result.current.handleVerificationCodeChange("111111");
      await Promise.resolve();
    });

    expect(result.current.verificationError).toBe(
      "auth.verification_code_invalid"
    );
    expect(result.current.verificationCode).toBe("");
    expect(result.current.screenState).toBe("verificationCode");

    act(() => {
      result.current.handleVerificationCodeChange("");
    });
    await act(async () => {
      result.current.handleVerificationCodeChange("111111");
      await Promise.resolve();
    });

    expect(mockVerifyEmailVerificationCode).toHaveBeenCalledTimes(2);
    expect(result.current.screenState).toBe("verificationSuccess");
  });
});
