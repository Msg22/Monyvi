interface StartE2eFixtureModule {
  buildE2eMetroEnv(
    parserMode: "fixture" | "local" | "hybrid-fixture",
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): Record<string, string | undefined>;
  buildE2eFixtureEnv(
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): Record<string, string | undefined>;
  getParserModeFromEnv(
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): "fixture" | "local" | "hybrid-fixture";
}

const startE2eFixture = jest.requireActual(
  "../../scripts/start-e2e-fixture"
) as StartE2eFixtureModule;

describe("start-e2e-fixture script helpers", () => {
  it("derives local Supabase env for Metro fixture startup", () => {
    const env = startE2eFixture.buildE2eFixtureEnv({
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(env.E2E_SUPABASE_MODE).toBe("local");
    expect(env.EXPO_PUBLIC_MONYVI_TEST_MODE).toBe("e2e");
    expect(env.EXPO_PUBLIC_AI_SMS_PARSER_MODE).toBe("fixture");
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe("http://10.0.2.2:54321");
    expect(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toContain("eyJ");
    expect(env.EXPO_UNSTABLE_HEADLESS).toBe("1");
  });

  it("derives local Supabase env for Metro local parser startup", () => {
    const env = startE2eFixture.buildE2eMetroEnv("local", {
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(env.E2E_SUPABASE_MODE).toBe("local");
    expect(env.EXPO_PUBLIC_MONYVI_TEST_MODE).toBe("e2e");
    expect(env.EXPO_PUBLIC_AI_SMS_PARSER_MODE).toBe("local");
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe("http://10.0.2.2:54321");
    expect(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toContain("eyJ");
  });

  it("preserves explicit hybrid fixture mode for deterministic E2E", () => {
    expect(
      startE2eFixture.getParserModeFromEnv({
        EXPO_PUBLIC_AI_SMS_PARSER_MODE: "hybrid-fixture",
      })
    ).toBe("hybrid-fixture");
  });

  it("keeps explicitly provided Supabase env values", () => {
    const env = startE2eFixture.buildE2eFixtureEnv({
      EXPO_PUBLIC_SUPABASE_URL: "http://custom-supabase.test",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "custom-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "custom-service-role-key",
    });

    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe("http://custom-supabase.test");
    expect(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      "custom-publishable-key"
    );
  });

  it("does not opt out of Expo monorepo root detection", () => {
    const env = startE2eFixture.buildE2eFixtureEnv({
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
      EXPO_NO_METRO_WORKSPACE_ROOT: "1",
    });

    expect(env.EXPO_NO_METRO_WORKSPACE_ROOT).toBeUndefined();
  });
});
