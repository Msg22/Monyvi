interface SupabaseServiceModule {
  readonly getSupabaseStorageKey: (url: string) => string;
  readonly resolveSupabaseStorageKey: (
    url: string,
    explicitKey?: string
  ) => string;
}

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test-ref.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const { getSupabaseStorageKey, resolveSupabaseStorageKey } =
  jest.requireActual<SupabaseServiceModule>("@/services/supabase");

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
