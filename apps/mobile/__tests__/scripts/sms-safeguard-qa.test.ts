import { readFileSync } from "fs";
import path from "path";

interface SmsSafeguardQaScript {
  readonly QA_PROVIDER_OUTCOME_MATRIX: readonly string[];
  readonly buildSafeguardQaEnvironment: (
    baseEnvironment: NodeJS.ProcessEnv,
    profileId?: string | null
  ) => NodeJS.ProcessEnv;
  readonly resolveSafeguardQaProfileArgument: (
    args: readonly string[],
    options?: { readonly required?: boolean }
  ) => string | null;
  readonly assertKnownSafeguardQaProfile: (profileId: string) => void;
  readonly buildSafeguardDevelopmentStartArgs: (
    args: readonly string[]
  ) => readonly string[];
  readonly buildSafeguardDevelopmentCommandArgs: (
    args: readonly string[],
    profileId: string
  ) => readonly string[];
  readonly buildQaRequestKeyResetFilter: () => string;
  readonly buildServerSafeguardDiagnostics: (input: {
    readonly profileId: string;
    readonly policy: {
      readonly fullParser: {
        readonly maxUnitsPerRollingWindow: number;
        readonly maxProviderStartsPerBurst: number;
      };
      readonly categoryEnrichment: {
        readonly maxUnitsPerRollingWindow: number;
        readonly maxProviderStartsPerBurst: number;
      };
    };
    readonly responses: readonly { readonly status: number }[];
    readonly snapshot: {
      readonly work: readonly {
        readonly id: string;
        readonly capability: string;
        readonly status: string;
        readonly available_at: string | null;
      }[];
      readonly usage: readonly {
        readonly request_id: string;
        readonly unit_count: number;
      }[];
      readonly outcomes: readonly {
        readonly deleted: boolean;
        readonly is_terminal: boolean;
      }[];
    };
  }) => Readonly<Record<string, unknown>>;
}

interface StartMobileLocalSupabaseScript {
  readonly parseCliArgs: (args: readonly string[]) => {
    readonly shouldUseLocalParser: boolean;
    readonly shouldUseFixtureSmsInbox: boolean;
  };
  readonly buildLocalSupabaseExpoEnv: (
    anonKey: string,
    baseEnvironment: NodeJS.ProcessEnv,
    options: {
      readonly shouldUseLocalParser: boolean;
      readonly shouldUseFixtureSmsInbox: boolean;
    }
  ) => NodeJS.ProcessEnv;
}

const script =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../scripts/sms-safeguard-qa.js") as SmsSafeguardQaScript;
const localSupabaseScript =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../../scripts/start-mobile-local-supabase.js") as StartMobileLocalSupabaseScript;

describe("SMS safeguard QA launcher", () => {
  const launcherSource = readFileSync(
    path.resolve(__dirname, "../../scripts/sms-safeguard-qa.js"),
    "utf8"
  );

  test("requires an explicit scenario for app-facing runs", () => {
    expect(() =>
      script.resolveSafeguardQaProfileArgument([], { required: true })
    ).toThrow(/--scenario/i);
    expect(
      script.resolveSafeguardQaProfileArgument(
        ["--scenario", "partial-quota-v1"],
        { required: true }
      )
    ).toBe("partial-quota-v1");
    expect(() =>
      script.assertKnownSafeguardQaProfile("invented-profile")
    ).toThrow(/known safeguard QA profile/i);
  });

  test("passes the selected profile to Metro without enabling a real provider or inbox", () => {
    const environment = script.buildSafeguardQaEnvironment(
      { NODE_ENV: "development" },
      "partial-quota-v1"
    );

    expect(environment).toMatchObject({
      EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      EXPO_PUBLIC_SMS_INBOX_MODE: "fixture",
      SMS_SAFEGUARD_QA_ENABLED: "true",
      MONYVI_EXPECTED_AI_SMS_PARSER_MODE: "edge",
    });
    expect(typeof environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID).toBe(
      "string"
    );
  });

  test("clears Metro cache for app-facing safeguard profiles", () => {
    expect(
      script.buildSafeguardDevelopmentStartArgs([
        "--wireless-device",
        "--scenario",
        "partial-quota-v1",
      ])
    ).toEqual(["--wireless-device", "--clear"]);

    expect(
      script.buildSafeguardDevelopmentStartArgs([
        "--wireless-device",
        "--clear",
      ])
    ).toEqual(["--wireless-device", "--clear"]);
  });

  test("uses a fixture inbox without forcing the local parser", () => {
    const commandArgs = script.buildSafeguardDevelopmentCommandArgs(
      ["--wireless-device"],
      "partial-quota-v1"
    );

    expect(commandArgs.slice(1)).toEqual([
      "--fixture-sms-inbox",
      "--sms-safeguard-profile",
      "partial-quota-v1",
      "--wireless-device",
      "--clear",
    ]);
  });

  test("composes the app-facing profile as Edge parser with fixture inbox", () => {
    const baseEnvironment = script.buildSafeguardQaEnvironment(
      { NODE_ENV: "development" },
      "partial-quota-v1"
    );
    const commandArgs = script.buildSafeguardDevelopmentCommandArgs(
      ["--wireless-device"],
      "partial-quota-v1"
    );
    const options = localSupabaseScript.parseCliArgs(commandArgs.slice(1));
    const expoEnvironment = localSupabaseScript.buildLocalSupabaseExpoEnv(
      "local-key",
      baseEnvironment,
      options
    );

    expect(expoEnvironment).toMatchObject({
      EXPO_PUBLIC_AI_SMS_PARSER_MODE: "edge",
      EXPO_PUBLIC_SMS_INBOX_MODE: "fixture",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
    });
  });

  test("creates one bounded run identity for a full-suite launch", () => {
    expect(
      script.buildSafeguardQaEnvironment({ NODE_ENV: "development" })
        .EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID
    ).toEqual(expect.any(String));
  });

  test("resets every recognized QA request namespace without matching ordinary work", () => {
    const filter = script.buildQaRequestKeyResetFilter();

    expect(filter).toContain("request_key.like.cutoff-boundary-v1-%");
    expect(filter).toContain("request_key.like.negative-three-strikes-v1-%");
    expect(filter).toContain("request_key.like.consent-required-v1-%");
    expect(filter).not.toContain("request_key.like.%");
  });

  test("resets scan sessions and exercises real profile consent state", () => {
    expect(launcherSource).toMatch(
      /from\("sms_ai_scan_sessions"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("user_id", userId\)/
    );
    expect(launcherSource).toMatch(
      /from\("profiles"\)[\s\S]*\.upsert\([\s\S]*user_id: data\.user\.id[\s\S]*ai_processing_consent:/
    );
    expect(launcherSource).toMatch(
      /withQaConsentState[\s\S]*ai_processing_consent: null[\s\S]*finally[\s\S]*ai_processing_consent: originalConsent/
    );
  });

  test("runs the complete provider validity matrix through the local QA endpoint", () => {
    expect(script.QA_PROVIDER_OUTCOME_MATRIX).toEqual([
      "trusted-success",
      "low-confidence-success",
      "explicit-negative",
      "omission",
      "retryable-failure",
      "permanent-failure",
      "malformed",
      "incomplete",
      "invalid-identity",
      "duplicate-identity",
      "delay",
      "cancelled",
    ]);
  });

  test("reports real per-capability allowance and synchronized outcome state", () => {
    const diagnostics = script.buildServerSafeguardDiagnostics({
      profileId: "partial-quota-v1",
      policy: {
        fullParser: {
          maxUnitsPerRollingWindow: 3,
          maxProviderStartsPerBurst: 2,
        },
        categoryEnrichment: {
          maxUnitsPerRollingWindow: 3,
          maxProviderStartsPerBurst: 2,
        },
      },
      responses: [{ status: 200 }, { status: 429 }],
      snapshot: {
        work: [
          {
            id: "full-1",
            capability: "sms_full_parse",
            status: "completed",
            available_at: null,
          },
          {
            id: "category-1",
            capability: "sms_category_enrichment",
            status: "refused",
            available_at: "2026-07-20T12:05:00.000Z",
          },
        ],
        usage: [{ request_id: "full-1", unit_count: 2 }],
        outcomes: [
          { deleted: false, is_terminal: false },
          { deleted: false, is_terminal: true },
        ],
      },
    });

    expect(diagnostics).toMatchObject({
      profileId: "partial-quota-v1",
      policyVersion: 1,
      checkpointDecision: "held_incomplete_work",
      synchronizedOutcomeTransitions: { active: 2, terminal: 1 },
      earliestAvailableAt: "2026-07-20T12:05:00.000Z",
      productionProviderCallCount: 0,
      productionAllowanceChargeCount: 0,
      capabilities: {
        sms_full_parse: {
          consumedUnits: 2,
          remainingRollingUnits: 1,
          providerStartCount: 1,
          remainingBurstStarts: 1,
        },
        sms_category_enrichment: {
          consumedUnits: 0,
          remainingRollingUnits: 3,
          providerStartCount: 0,
          remainingBurstStarts: 2,
        },
      },
    });
  });
});
