import { getManualQaSeedConfig } from "../../scripts/manual-qa-seed";

describe("manual-qa-seed script helpers", () => {
  it("preserves the existing manual QA password when no password is provided", () => {
    const config = getManualQaSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(config.email).toBe("manual-qa@monyvi.test");
    expect(config.password).toBeNull();
    expect(config.preserveExistingPassword).toBe(true);
  });

  it("uses the manual QA email with the provided local password", () => {
    const config = getManualQaSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
      MANUAL_QA_PASSWORD: "LocalOnlyPassword123!",
    });

    expect(config.email).toBe("manual-qa@monyvi.test");
    expect(config.password).toBe("LocalOnlyPassword123!");
    expect(config.preserveExistingPassword).toBe(false);
  });

  it("does not inherit remote Supabase env vars for local manual QA seeding", () => {
    const config = getManualQaSeedConfig({
      EXPO_PUBLIC_SUPABASE_URL: "https://remote-project.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "remote-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "remote-service-role-key",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(config.mode).toBe("local");
    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.appSupabaseUrl).toBe("http://10.0.2.2:54321");
    expect(config.anonKey).not.toBe("remote-publishable-key");
    expect(config.serviceRoleKey).not.toBe("remote-service-role-key");
  });
});
