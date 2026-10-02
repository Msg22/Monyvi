interface SupabaseServiceModule {
  readonly getSupabaseStorageKey: (url: string) => string;
  readonly resolveSupabaseStorageKey: (
    url: string,
    explicitKey?: string
  ) => string;
  readonly signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<unknown>;
  readonly signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{
    readonly success: boolean;
    readonly needsVerification?: boolean;
    readonly error?: { readonly code?: string };
  }>;
  readonly resendVerificationEmail: (email: string) => Promise<unknown>;
  readonly supabase: {
    readonly auth: {
      signUp: (...args: unknown[]) => Promise<unknown>;
      signInWithPassword: (...args: unknown[]) => Promise<unknown>;
      resend: (...args: unknown[]) => Promise<unknown>;
    };
  };
}

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test-ref.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const {
  getSupabaseStorageKey,
  resolveSupabaseStorageKey,
  signUpWithEmail,
  signInWithEmail,
  resendVerificationEmail,
  supabase,
} = jest.requireActual<SupabaseServiceModule>("@/services/supabase");

describe("supabase service helpers", () => {
  it("matches Supabase storage key naming for hosted project URLs", () => {
    expect(
      getSupabaseStorageKey("https://yulbcndyssdjicbpmlrk.supabase.co")
    ).toBe("sb-yulbcndyssdjicbpmlrk-auth-token");
  });

  it("matches Supabase storage key naming for local URLs", () => {
    expect(getSupabaseStorageKey("http://127.0.0.1:54321")).toBe(
      "sb-127-auth-token"
    );
  });

  it("uses a stable explicit storage key for changing local tunnel URLs", () => {
    expect(
      resolveSupabaseStorageKey(
        "https://random-tunnel.ngrok-free.app",
        "sb-monyvi-local-auth-token"
      )
    ).toBe("sb-monyvi-local-auth-token");
  });
});


describe("supabase email verification redirect contract", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("passes the canonical app callback when signing up with email", async () => {
    const sentinel = new Error("stop-after-signup-arguments");
    const signUpSpy = jest
      .spyOn(supabase.auth, "signUp")
      .mockRejectedValue(sentinel);

    await expect(
      signUpWithEmail("new@example.com", "password123")
    ).rejects.toThrow(sentinel);

    expect(signUpSpy).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "password123",
      options: {
        emailRedirectTo: "monyvi://auth-callback",
      },
    });
  });


  it("classifies email_not_confirmed sign-in as verification required", async () => {
    const emailNotConfirmedError = Object.assign(
      new Error("Email not confirmed"),
      { code: "email_not_confirmed" }
    );
    const signInSpy = jest
      .spyOn(supabase.auth, "signInWithPassword")
      .mockResolvedValue({
        data: { user: null, session: null },
        error: emailNotConfirmedError,
      });

    const result = await signInWithEmail(
      "unverified@example.com",
      "password123"
    );

    expect(signInSpy).toHaveBeenCalledWith({
      email: "unverified@example.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
    expect(result.needsVerification).toBe(true);
    expect(result.error?.code).toBe("email_not_confirmed");
  });

  it("passes the canonical app callback when resending signup verification", async () => {
    const sentinel = new Error("stop-after-resend-arguments");
    const resendSpy = jest
      .spyOn(supabase.auth, "resend")
      .mockRejectedValue(sentinel);

    await expect(
      resendVerificationEmail("new@example.com")
    ).rejects.toThrow(sentinel);

    expect(resendSpy).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      options: {
        emailRedirectTo: "monyvi://auth-callback",
      },
    });
  });
});
