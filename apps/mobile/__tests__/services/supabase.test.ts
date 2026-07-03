interface SupabaseServiceModule {
  readonly getSupabaseStorageKey: (url: string) => string;
}

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test-ref.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const { getSupabaseStorageKey } = jest.requireActual<SupabaseServiceModule>(
  "@/services/supabase"
);

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
});
