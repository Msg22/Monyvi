/**
 * Unit tests for auth-service
 *
 * Tests public API functions:
 * - signInWithOAuth (success, PKCE, error, cancellation, exceptions)
 * - signUpWithEmail (success, error)
 * - signInWithEmail (success)
 * - requestPasswordReset (success)
 *
 * Mock Strategy:
 *   - supabase is mocked via jest.mock to control signInWithOAuthProvider,
 *     setSession, exchangeCodeForSession, signUpWithEmail, signInWithEmail,
 *     and resetPasswordForEmail
 *   - expo-web-browser is mocked for openAuthSessionAsync and
 *     dismissAuthSession
 *   - @supabase/supabase-js error helpers are mocked for network error
 *     detection
 */

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

const mockSignInWithOAuthProvider = jest.fn();
const mockSetSession = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockSignUpWithEmail = jest.fn();
const mockSignInWithEmailFn = jest.fn();
const mockResetPasswordForEmail = jest.fn();

jest.mock("@/services/supabase", () => ({
  signInWithOAuthProvider: (...args: unknown[]): Promise<unknown> =>
    mockSignInWithOAuthProvider(...args) as Promise<unknown>,
  signUpWithEmail: (...args: unknown[]): Promise<unknown> =>
    mockSignUpWithEmail(...args) as Promise<unknown>,
  signInWithEmail: (...args: unknown[]): Promise<unknown> =>
    mockSignInWithEmailFn(...args) as Promise<unknown>,
  resetPasswordForEmail: (...args: unknown[]): Promise<unknown> =>
    mockResetPasswordForEmail(...args) as Promise<unknown>,
  supabase: {
    auth: {
      setSession: (...args: unknown[]): Promise<unknown> =>
        mockSetSession(...args) as Promise<unknown>,
      exchangeCodeForSession: (...args: unknown[]): Promise<unknown> =>
        mockExchangeCodeForSession(...args) as Promise<unknown>,
    },
  },
}));

jest.mock("@/constants/auth-constants", () => ({
  AUTH_REDIRECT_URL: "monyvi://auth-callback",
}));

const mockOpenAuthSession = jest.fn<
  Promise<{ type: string; url?: string }>,
  unknown[]
>();
const mockDismissAuthSession = jest.fn();

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: (...args: unknown[]): Promise<unknown> =>
    mockOpenAuthSession(...args),
  dismissAuthSession: (...args: unknown[]): unknown =>
    mockDismissAuthSession(...args) as unknown,
  WebBrowserResultType: {
    CANCEL: "cancel",
    DISMISS: "dismiss",
    SUCCESS: "success",
  },
}));

// Import after mocks
import {
  completeAuthSessionFromUrl,
  signInWithOAuth,
  signUpWithEmail,
  signInWithEmail,
  requestPasswordReset,
} from "../../services/auth-service";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an AuthRetryableFetchError-shaped object that passes
 * `isAuthRetryableFetchError()` type guard.
 */
function createRetryableFetchError(
  message: string
): Error & { __isAuthError: boolean; status: number } {
  const error = new Error(message) as Error & {
    __isAuthError: boolean;
    status: number;
  };
  error.name = "AuthRetryableFetchError";
  error.__isAuthError = true;
  error.status = 0;
  return error;
}

// ---------------------------------------------------------------------------
// Test Suite: completeAuthSessionFromUrl
// ---------------------------------------------------------------------------

describe("auth-service - completeAuthSessionFromUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("establishes a session from implicit-flow access and refresh tokens", async () => {
    mockSetSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });

    const result = await completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=verification-access&refresh_token=verification-refresh&token_type=bearer"
    );

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "verification-access",
      refresh_token: "verification-refresh",
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("establishes a session from a PKCE authorization code", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });

    const result = await completeAuthSessionFromUrl(
      "monyvi://auth-callback?code=verification-pkce-code"
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith(
      "verification-pkce-code"
    );
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("rejects callbacks when no URL was provided", async () => {
    const result = await completeAuthSessionFromUrl(undefined);

    expect(result).toEqual({
      success: false,
      error: "No redirect URL received from the browser.",
      errorCode: "invalid_callback",
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("auth-service - callback failure hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects token-bearing callbacks from any URL other than the canonical Monyvi callback", async () => {
    mockSetSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });

    const result = await completeAuthSessionFromUrl(
      "evil://auth-callback#access_token=stolen-access&refresh_token=stolen-refresh"
    );

    expect(result).toEqual({
      success: false,
      error: "Could not validate the authentication callback.",
      errorCode: "invalid_callback",
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails closed on provider-declared callback errors without exposing provider details", async () => {
    const secretDescription = "verification-secret-should-not-leak";
    const result = await completeAuthSessionFromUrl(
      `monyvi://auth-callback?error=access_denied&error_description=${secretDescription}`
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("provider_error");
      expect(result.error).not.toContain(secretDescription);
      expect(result.error).not.toContain("monyvi://auth-callback");
    }
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("sanitizes token-session failures instead of echoing callback secrets", async () => {
    const accessToken = "access-secret-321";
    const refreshToken = "refresh-secret-321";
    mockSetSession.mockResolvedValue({
      data: { session: null },
      error: new Error(
        `provider failed for ${accessToken} and ${refreshToken}`
      ),
    });

    const result = await completeAuthSessionFromUrl(
      `monyvi://auth-callback#access_token=${accessToken}&refresh_token=${refreshToken}`
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain(accessToken);
      expect(result.error).not.toContain(refreshToken);
      expect(result.error).not.toContain("monyvi://auth-callback");
    }
  });

  it("classifies rejected token-session requests without exposing callback secrets", async () => {
    const accessToken = "rejected-access-secret-321";
    const refreshToken = "rejected-refresh-secret-321";
    mockSetSession.mockRejectedValue(
      createRetryableFetchError(
        `network failed for ${accessToken} and ${refreshToken}`
      )
    );

    const result = await completeAuthSessionFromUrl(
      `monyvi://auth-callback#access_token=${accessToken}&refresh_token=${refreshToken}`
    );

    expect(result).toEqual({
      success: false,
      error: "No internet connection. Please check your network and try again.",
      errorCode: "network",
    });
    if (!result.success) {
      expect(result.error).not.toContain(accessToken);
      expect(result.error).not.toContain(refreshToken);
      expect(result.error).not.toContain("monyvi://auth-callback");
    }
  });

  it("fails closed when only one implicit-flow token is present", async () => {
    const result = await completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=orphaned-access-token"
    );

    expect(result).toEqual({
      success: false,
      error: "Could not extract session from the sign-in response.",
      errorCode: "invalid_callback",
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("sanitizes resolved PKCE exchange failures", async () => {
    const authorizationCode = "pkce-secret-321";
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error(`provider failed for ${authorizationCode}`),
    });

    const result = await completeAuthSessionFromUrl(
      `monyvi://auth-callback?code=${authorizationCode}`
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("unknown");
      expect(result.error).not.toContain(authorizationCode);
      expect(result.error).not.toContain("monyvi://auth-callback");
    }
  });

  it("classifies rejected PKCE exchanges without exposing callback secrets", async () => {
    const authorizationCode = "rejected-pkce-secret-321";
    mockExchangeCodeForSession.mockRejectedValue(
      createRetryableFetchError(`network failed for ${authorizationCode}`)
    );

    const result = await completeAuthSessionFromUrl(
      `monyvi://auth-callback?code=${authorizationCode}`
    );

    expect(result).toEqual({
      success: false,
      error: "No internet connection. Please check your network and try again.",
      errorCode: "network",
    });
    if (!result.success) {
      expect(result.error).not.toContain(authorizationCode);
      expect(result.error).not.toContain("monyvi://auth-callback");
    }
  });

  it("fails closed when the canonical callback contains no usable auth material", async () => {
    const result = await completeAuthSessionFromUrl("monyvi://auth-callback");

    expect(result).toEqual({
      success: false,
      error: "Could not extract session from the sign-in response.",
      errorCode: "invalid_callback",
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: signInWithOAuth
// ---------------------------------------------------------------------------

describe("auth-service - signInWithOAuth", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("success flows", () => {
    it("calls signInWithOAuthProvider with 'google' and opens browser", async () => {
      mockSignInWithOAuthProvider.mockResolvedValue({
        url: "https://accounts.google.com/o/oauth2/auth?...",
      });
      mockOpenAuthSession.mockResolvedValue({
        type: "success",
        url: "monyvi://auth-callback#access_token=test-token&refresh_token=test-refresh&token_type=bearer",
      });
      mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });

      const result = await signInWithOAuth("google");

      expect(mockSignInWithOAuthProvider).toHaveBeenCalledWith("google");
      expect(mockOpenAuthSession).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/auth?...",
        "monyvi://auth-callback"
      );
      expect(result).toEqual({ success: true });
    });

    it("extracts PKCE code from redirect URL and calls exchangeCodeForSession", async () => {
      mockSignInWithOAuthProvider.mockResolvedValue({
        url: "https://accounts.google.com/o/oauth2/auth?...",
      });
      mockOpenAuthSession.mockResolvedValue({
        type: "success",
        url: "monyvi://auth-callback?code=pkce-auth-code",
      });
      mockExchangeCodeForSession.mockResolvedValue({
        data: { session: {} },
        error: null,
      });

      const result = await signInWithOAuth("google");

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("pkce-auth-code");
      expect(mockSetSession).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("returns error when redirect URL has no tokens or code", async () => {
      mockSignInWithOAuthProvider.mockResolvedValue({
        url: "https://accounts.google.com/o/oauth2/auth?...",
      });
      mockOpenAuthSession.mockResolvedValue({
        type: "success",
        url: "monyvi://auth-callback",
      });

      const result = await signInWithOAuth("google");

      expect(result).toEqual({
        success: false,
        error: "Could not extract session from the sign-in response.",
        errorCode: "unknown",
      });
    });

    it("propagates errorCode from setSession failure (e.g. network error)", async () => {
      mockSignInWithOAuthProvider.mockResolvedValue({
        url: "https://accounts.google.com/o/oauth2/auth?...",
      });
      mockOpenAuthSession.mockResolvedValue({
        type: "success",
        url: "monyvi://auth-callback#access_token=test-token&refresh_token=test-refresh",
      });
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: createRetryableFetchError("Network failed"),
      });

      const result = await signInWithOAuth("google");

      expect(result).toEqual({
        success: false,
        error:
          "No internet connection. Please check your network and try again.",
        errorCode: "network",
      });
    });
  });

  describe("error handling", () => {
    it("returns error result when credentials are invalid", async () => {
      const mockError = {
        message: "Invalid login credentials",
        status: 400,
        name: "AuthApiError",
      };

      mockSignInWithEmailFn.mockResolvedValue({
        success: false,
        error: mockError,
      });

      const result = await signInWithEmail("test@example.com", "wrongpassword");

      expect(result.success).toBe(false);
      expect(result.error).toEqual(mockError);
    });

    it("returns network error when signInWithOAuthProvider fails", async () => {
      mockSignInWithOAuthProvider.mockResolvedValue({
        error: createRetryableFetchError("Network error"),
      });

      const result = await signInWithOAuth("google");

      expect(result).toEqual({
        success: false,
        error:
          "No internet connection. Please check your network and try again.",
        errorCode: "network",
      });
    });

    it("returns cancelled when user dismisses browser", async () => {
      mockSignInWithOAuthProvider.mockResolvedValue({
        url: "https://accounts.google.com/...",
      });
      mockOpenAuthSession.mockResolvedValue({ type: "cancel" });

      const result = await signInWithOAuth("google");

      expect(result).toEqual({
        success: false,
        error: "Sign-in was cancelled.",
        errorCode: "cancelled",
      });
    });

    it("handles thrown exceptions gracefully", async () => {
      mockSignInWithOAuthProvider.mockRejectedValue(
        new Error("Unexpected error")
      );

      const result = await signInWithOAuth("google");

      expect(result).toEqual({
        success: false,
        error: "Something went wrong during sign-in. Please try again.",
        errorCode: "unknown",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Test Suite: signUpWithEmail
// ---------------------------------------------------------------------------

describe("auth-service - signUpWithEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates to supabase signUpWithEmail and returns result", async () => {
    mockSignUpWithEmail.mockResolvedValue({
      user: { id: "user-1" },
      session: null,
      needsVerification: true,
      error: null,
    });

    const result = await signUpWithEmail("test@example.com", "password123");

    expect(mockSignUpWithEmail).toHaveBeenCalledWith(
      "test@example.com",
      "password123"
    );
    expect(result.needsVerification).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns error result when supabase signUpWithEmail fails", async () => {
    const mockError = {
      message: "User already registered",
      status: 422,
      name: "AuthApiError",
    };

    mockSignUpWithEmail.mockResolvedValue({
      success: false,
      error: mockError,
      needsVerification: false,
    });

    const result = await signUpWithEmail("existing@example.com", "password123");

    expect(mockSignUpWithEmail).toHaveBeenCalledWith(
      "existing@example.com",
      "password123"
    );
    expect(result.success).toBe(false);
    expect(result.error).toEqual(mockError);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: signInWithEmail
// ---------------------------------------------------------------------------

describe("auth-service - signInWithEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates to supabase signInWithEmail and returns result", async () => {
    mockSignInWithEmailFn.mockResolvedValue({
      user: { id: "user-1" },
      session: { access_token: "token" },
      needsVerification: false,
      error: null,
    });

    const result = await signInWithEmail("test@example.com", "password123");

    expect(mockSignInWithEmailFn).toHaveBeenCalledWith(
      "test@example.com",
      "password123"
    );
    expect(result.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: requestPasswordReset
// ---------------------------------------------------------------------------

describe("auth-service - requestPasswordReset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates to supabase resetPasswordForEmail and returns result", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: null,
    });

    const result = await requestPasswordReset("test@example.com");

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("test@example.com");
    expect(result.error).toBeNull();
  });
});
