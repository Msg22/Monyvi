import { act, renderHook } from "@testing-library/react-native";

import { useAuthScreenController } from "@/hooks/useAuthScreenController";
import {
  requestPasswordReset,
  signInWithEmail,
  signInWithOAuth,
  signUpWithEmail,
} from "@/services/auth-service";
import { resendVerificationEmail } from "@/services/supabase";

const mockShowToast = jest.fn();
const mockUseDeferredRouterReplace = jest.fn();

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): { isAuthenticated: boolean; isLoading: boolean } => ({
    isAuthenticated: false,
    isLoading: false,
  }),
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

jest.mock("@/services/supabase", () => ({
  resendVerificationEmail: jest.fn(),
}));

const mockRequestPasswordReset = jest.mocked(requestPasswordReset);
const mockSignInWithEmail = jest.mocked(signInWithEmail);
const mockSignInWithOAuth = jest.mocked(signInWithOAuth);
const mockSignUpWithEmail = jest.mocked(signUpWithEmail);
const mockResendVerificationEmail = jest.mocked(resendVerificationEmail);

function createAuthError(message: string): never {
  return new Error(message) as never;
}

describe("useAuthScreenController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it("moves successful sign-up requiring verification to pending state", async () => {
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

    expect(result.current.pendingEmail).toBe("new@example.com");
    expect(result.current.screenState).toBe("verificationPending");
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
    mockResendVerificationEmail.mockResolvedValue({ success: true });
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

    expect(mockResendVerificationEmail).toHaveBeenCalledWith("new@example.com");
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "success",
      title: "auth.verification_email_sent",
    });
    expect(result.current.pendingAction).toBeNull();
  });

  it("reports verification resend failures and clears pending state", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      success: true,
      needsVerification: true,
    });
    mockResendVerificationEmail.mockResolvedValue({
      success: false,
      error: createAuthError("Resend unavailable"),
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
      title: "Resend unavailable",
    });
    expect(result.current.pendingAction).toBeNull();
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
