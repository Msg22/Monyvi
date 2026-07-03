interface StartMobileLocalSupabaseModule {
  buildExpoStartArgs(expoArgs: readonly string[]): readonly string[];
  buildExpoStartCommand(
    expoArgs: readonly string[],
    options?: {
      readonly expoCliPath?: string;
      readonly nodeExecPath?: string;
      readonly pathExists?: (path: string) => boolean;
    }
  ): {
    readonly command: string;
    readonly args: readonly string[];
    readonly shell: boolean;
  };
  buildManualQaSeedEnv(
    cliPassword: string | null,
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): Record<string, string | undefined>;
  buildLocalSupabaseExpoEnv(
    anonKey: string,
    baseEnv?: Readonly<Record<string, string | undefined>>
  ): Record<string, string | undefined>;
  parseCliArgs(args: readonly string[]): {
    readonly shouldUseWirelessDeviceTunnel: boolean;
    readonly password: string | null;
    readonly expoArgs: readonly string[];
  };
  parseSupabaseEnv(output: string): Record<string, string>;
  resolveLocalSupabaseDeviceConfig(
    env?: Readonly<Record<string, string | undefined>>
  ): {
    readonly supabaseUrl: string;
    readonly shouldReversePort: boolean;
  };
  resolveNgrokCommand(
    env?: Readonly<Record<string, string | undefined>>,
    options?: {
      readonly findOnPath?: (command: string) => string | null;
      readonly pathExists?: (path: string) => boolean;
    }
  ): string;
  resolveNgrokTunnelUrl(apiResponse: string): string;
  shouldShowSetupOutput(
    env?: Readonly<Record<string, string | undefined>>
  ): boolean;
  shouldWarnAboutMissingWatchman(
    env?: Readonly<Record<string, string | undefined>>,
    options?: {
      readonly findOnPath?: (command: string) => string | null;
      readonly platform?: NodeJS.Platform;
    }
  ): boolean;
}

const startMobileLocalSupabase = jest.requireActual(
  "../../scripts/start-mobile-local-supabase"
) as StartMobileLocalSupabaseModule;

describe("start-mobile-local-supabase script helpers", () => {
  it("uses loopback plus adb reverse by default so Google auth is available", () => {
    expect(
      startMobileLocalSupabase.resolveLocalSupabaseDeviceConfig({})
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      shouldReversePort: true,
    });
  });

  it("allows the legacy Google auth flag without changing behavior", () => {
    expect(
      startMobileLocalSupabase.resolveLocalSupabaseDeviceConfig({
        MONYVI_LOCAL_GOOGLE_AUTH: "1",
      })
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      shouldReversePort: true,
    });
  });

  it("can opt out to the Android emulator host for non-OAuth debugging", () => {
    expect(
      startMobileLocalSupabase.resolveLocalSupabaseDeviceConfig({
        MONYVI_LOCAL_SUPABASE_LOOPBACK: "0",
      })
    ).toEqual({
      supabaseUrl: "http://10.0.2.2:54321",
      shouldReversePort: false,
    });
  });

  it("uses an explicit device Supabase URL for wireless physical devices", () => {
    expect(
      startMobileLocalSupabase.resolveLocalSupabaseDeviceConfig({
        MONYVI_LOCAL_GOOGLE_AUTH: "1",
        MONYVI_LOCAL_SUPABASE_DEVICE_URL: "https://monyvi-local.example.dev",
      })
    ).toEqual({
      supabaseUrl: "https://monyvi-local.example.dev",
      shouldReversePort: false,
    });
  });

  it("parses wireless-device mode and strips script-only flags from Expo args", () => {
    expect(
      startMobileLocalSupabase.parseCliArgs([
        "--wireless-device",
        "--password",
        "LocalOnlyPassword123!",
        "--clear",
      ])
    ).toEqual({
      shouldUseWirelessDeviceTunnel: true,
      password: "LocalOnlyPassword123!",
      expoArgs: ["--clear"],
    });
  });

  it("keeps dev-client defaults when forwarding extra Expo args", () => {
    expect(startMobileLocalSupabase.buildExpoStartArgs(["--clear"])).toEqual([
      "expo",
      "start",
      "--dev-client",
      "--port",
      "8081",
      "--clear",
    ]);
  });

  it("starts Expo through the installed package CLI when npm bin shims are missing", () => {
    expect(
      startMobileLocalSupabase.buildExpoStartCommand(["--clear"], {
        expoCliPath:
          "E:\\Work\\My Projects\\Monyvi\\node_modules\\expo\\bin\\cli",
        nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
        pathExists: () => true,
      })
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [
        "E:\\Work\\My Projects\\Monyvi\\node_modules\\expo\\bin\\cli",
        "start",
        "--dev-client",
        "--port",
        "8081",
        "--clear",
      ],
      shell: false,
    });
  });

  it("falls back to npx Expo resolution when the package CLI is unavailable", () => {
    expect(
      startMobileLocalSupabase.buildExpoStartCommand([], {
        expoCliPath: "missing-expo-cli",
        pathExists: () => false,
      })
    ).toEqual({
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["expo", "start", "--dev-client", "--port", "8081"],
      shell: process.platform === "win32",
    });
  });

  it("allows callers to override the Expo port", () => {
    expect(
      startMobileLocalSupabase.buildExpoStartArgs(["--port", "8082"])
    ).toEqual(["expo", "start", "--dev-client", "--port", "8082"]);
  });

  it("parses the password option with equals syntax", () => {
    expect(
      startMobileLocalSupabase.parseCliArgs([
        "--wireless-device",
        "--password=LocalOnlyPassword123!",
      ])
    ).toEqual({
      shouldUseWirelessDeviceTunnel: true,
      password: "LocalOnlyPassword123!",
      expoArgs: [],
    });
  });

  it("rejects a password flag without a value", () => {
    expect(() =>
      startMobileLocalSupabase.parseCliArgs([
        "--wireless-device",
        "--password",
        "--clear",
      ])
    ).toThrow("--password requires a value");
  });

  it("preserves the existing manual QA password in wireless-device mode by default", () => {
    expect(
      startMobileLocalSupabase.buildManualQaSeedEnv(null, {})
    ).toMatchObject({
      MANUAL_QA_PRESERVE_PASSWORD: "1",
    });
  });

  it("uses the provided manual QA password when passed", () => {
    expect(
      startMobileLocalSupabase.buildManualQaSeedEnv("from-cli", {
        MANUAL_QA_PASSWORD: "from-env",
      })
    ).toMatchObject({
      MANUAL_QA_PASSWORD: "from-cli",
      MANUAL_QA_PRESERVE_PASSWORD: undefined,
    });
  });

  it("extracts the public HTTPS ngrok tunnel URL", () => {
    expect(
      startMobileLocalSupabase.resolveNgrokTunnelUrl(
        JSON.stringify({
          tunnels: [
            {
              proto: "https",
              public_url: "https://other.ngrok-free.app",
              config: { addr: "http://localhost:8081" },
            },
            {
              proto: "https",
              public_url: "https://supabase.ngrok-free.app",
              config: { addr: "http://localhost:54321" },
            },
          ],
        })
      )
    ).toBe("https://supabase.ngrok-free.app");
  });

  it("uses an explicit ngrok command when provided", () => {
    expect(
      startMobileLocalSupabase.resolveNgrokCommand({
        NGROK_COMMAND: "C:\\Tools\\ngrok.exe",
      })
    ).toBe("C:\\Tools\\ngrok.exe");
  });

  it("resolves ngrok from PATH before falling back to the command name", () => {
    expect(
      startMobileLocalSupabase.resolveNgrokCommand(
        {},
        {
          findOnPath: () => "C:\\Users\\Mohamed\\scoop\\shims\\ngrok.exe",
          pathExists: () => false,
        }
      )
    ).toBe("C:\\Users\\Mohamed\\scoop\\shims\\ngrok.exe");
  });

  it("hides setup output by default unless verbose setup is enabled", () => {
    expect(startMobileLocalSupabase.shouldShowSetupOutput({})).toBe(false);
    expect(
      startMobileLocalSupabase.shouldShowSetupOutput({
        MONYVI_LOCAL_SUPABASE_VERBOSE_SETUP: "1",
      })
    ).toBe(true);
  });

  it("warns Windows developers when Watchman is missing", () => {
    expect(
      startMobileLocalSupabase.shouldWarnAboutMissingWatchman(
        {},
        {
          findOnPath: () => null,
          platform: "win32",
        }
      )
    ).toBe(true);
  });

  it("does not warn about Watchman when it is available or suppressed", () => {
    expect(
      startMobileLocalSupabase.shouldWarnAboutMissingWatchman(
        {},
        {
          findOnPath: () => "C:\\Users\\Mohamed\\scoop\\shims\\watchman.exe",
          platform: "win32",
        }
      )
    ).toBe(false);

    expect(
      startMobileLocalSupabase.shouldWarnAboutMissingWatchman(
        { MONYVI_SUPPRESS_WATCHMAN_WARNING: "1" },
        {
          findOnPath: () => null,
          platform: "win32",
        }
      )
    ).toBe(false);
  });

  it("keeps an explicitly provided Expo Supabase URL", () => {
    const env = startMobileLocalSupabase.buildLocalSupabaseExpoEnv(
      "local-anon-key",
      {
        EXPO_PUBLIC_SUPABASE_URL: "https://custom-supabase.example.dev",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "custom-publishable-key",
        MONYVI_LOCAL_GOOGLE_AUTH: "1",
      }
    );

    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe(
      "https://custom-supabase.example.dev"
    );
    expect(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      "custom-publishable-key"
    );
  });

  it("does not opt out of Expo monorepo root detection", () => {
    const env = startMobileLocalSupabase.buildLocalSupabaseExpoEnv(
      "local-anon-key",
      {
        EXPO_NO_METRO_WORKSPACE_ROOT: "1",
      }
    );

    expect(env.EXPO_NO_METRO_WORKSPACE_ROOT).toBeUndefined();
  });

  it("parses quoted Supabase status env output", () => {
    expect(
      startMobileLocalSupabase.parseSupabaseEnv(
        'ANON_KEY="anon"\nSUPABASE_URL=http://127.0.0.1:54321'
      )
    ).toEqual({
      ANON_KEY: "anon",
      SUPABASE_URL: "http://127.0.0.1:54321",
    });
  });
});
