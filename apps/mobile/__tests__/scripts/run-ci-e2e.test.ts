interface RunCiE2eModule {
  appendOutputTail(
    currentOutput: string,
    nextChunk: string,
    maxLength?: number
  ): string;
  getRequestedCiSuites(
    env?: Readonly<Record<string, string | undefined>>
  ): ReadonlySet<
    "accounts" | "transactions" | "recurring-payments" | "sms-sync" | "live-sms"
  >;
  getChildTimeoutMs(env?: Readonly<Record<string, string | undefined>>): number;
  getLiveSmsTimeoutMs(
    env?: Readonly<Record<string, string | undefined>>
  ): number;
  getDeviceOfflineRetryCount(
    env?: Readonly<Record<string, string | undefined>>
  ): number;
  getAuthBootstrapFlow(
    env?: Readonly<Record<string, string | undefined>>
  ):
    | "helpers/ci-auth-bootstrap.yaml"
    | "helpers/ci-auth-deeplink-bootstrap.yaml";
  getInitialAuthBootstrapOptions(): {
    readonly env: Readonly<Record<string, string>>;
    readonly retryOnDeviceFailure: boolean;
  };
  getMaestroSuiteFlowOptions(
    flow: string,
    env?: Readonly<Record<string, string | undefined>>
  ): {
    readonly prepareRetry?: () => Promise<void>;
    readonly retryOnDeviceFailure: boolean;
  };
  getSmsSyncJourneyOptions(): {
    readonly env: Readonly<Record<string, string>>;
    readonly retryOnDeviceFailure: boolean;
  };
  isDeviceOfflineFailure(output: string): boolean;
  shouldResetMaestroFlowBeforeRetry(
    flow: string,
    env?: Readonly<Record<string, string | undefined>>
  ): boolean;
  shouldRetryMaestroSuiteFlow(
    flow: string,
    env?: Readonly<Record<string, string | undefined>>
  ): boolean;
  shouldRetryChildScriptFailure(
    output: string,
    options?: { readonly retryOnDeviceFailure?: boolean }
  ): boolean;
  shouldRetryStabilizationFailure(
    attempt: number,
    maxAttempts: number
  ): boolean;
  shouldBootstrapBeforeLiveSms(
    selectedSuites: ReadonlySet<string>,
    supabaseMode: "local" | "remote"
  ): boolean;
}

const runCiE2e = jest.requireActual(
  "../../scripts/run-ci-e2e"
) as RunCiE2eModule;

describe("run-ci-e2e helpers", () => {
  it("defaults to all E2E suites when no selective suite is requested", () => {
    expect([...runCiE2e.getRequestedCiSuites({})]).toEqual([
      "accounts",
      "transactions",
      "recurring-payments",
      "sms-sync",
      "live-sms",
    ]);
  });

  it("parses selected E2E suites and treats skip as no-op", () => {
    expect([
      ...runCiE2e.getRequestedCiSuites({
        E2E_CI_SUITES: "accounts,recurring-payments,sms-sync,live-sms",
      }),
    ]).toEqual(["accounts", "recurring-payments", "sms-sync", "live-sms"]);

    expect(runCiE2e.getRequestedCiSuites({ E2E_CI_SUITES: "skip" }).size).toBe(
      0
    );
  });

  it("keeps only a bounded output tail for retry detection", () => {
    expect(runCiE2e.appendOutputTail("abcdef", "ghij", 6)).toBe("efghij");
  });

  it("uses a bounded child-process timeout with env override", () => {
    expect(runCiE2e.getChildTimeoutMs({})).toBe(20 * 60 * 1000);
    expect(runCiE2e.getChildTimeoutMs({ E2E_CHILD_TIMEOUT_MS: "1000" })).toBe(
      1000
    );
  });

  it("uses a longer bounded timeout for the aggregate live-SMS suite", () => {
    expect(runCiE2e.getLiveSmsTimeoutMs({})).toBe(45 * 60 * 1000);
    expect(
      runCiE2e.getLiveSmsTimeoutMs({ E2E_LIVE_SMS_TIMEOUT_MS: "1000" })
    ).toBe(1000);
  });

  it("uses a bounded retry count for repeated ADB device-offline failures", () => {
    expect(runCiE2e.getDeviceOfflineRetryCount({})).toBe(5);
    expect(
      runCiE2e.getDeviceOfflineRetryCount({
        E2E_DEVICE_OFFLINE_RETRY_COUNT: "5",
      })
    ).toBe(5);
  });

  it("uses the guarded deep-link auth bootstrap when CI opts in", () => {
    expect(runCiE2e.getAuthBootstrapFlow({})).toBe(
      "helpers/ci-auth-bootstrap.yaml"
    );
    expect(
      runCiE2e.getAuthBootstrapFlow({ E2E_AUTH_DEEPLINK_BOOTSTRAP: "1" })
    ).toBe("helpers/ci-auth-deeplink-bootstrap.yaml");
  });

  it("clears cached emulator app data before the initial auth bootstrap", () => {
    expect(runCiE2e.getInitialAuthBootstrapOptions()).toEqual({
      env: { E2E_CLEAR_APP_STATE: "1" },
      retryOnDeviceFailure: true,
    });
  });

  it("detects ADB device-offline failures for infrastructure-only retry", () => {
    expect(
      runCiE2e.isDeviceOfflineFailure(
        "Caused by: java.io.IOException: Command failed (host:transport:emulator-5554): device offline"
      )
    ).toBe(true);
    expect(
      runCiE2e.isDeviceOfflineFailure(
        "io.grpc.StatusRuntimeException: UNAVAILABLE"
      )
    ).toBe(true);
    expect(
      runCiE2e.isDeviceOfflineFailure(
        "viewHierarchy failed: io.grpc.StatusRuntimeException: UNAVAILABLE: End of stream or IOException"
      )
    ).toBe(true);
    expect(
      runCiE2e.isDeviceOfflineFailure(
        "Maestro timed out while reading the Android view hierarchy"
      )
    ).toBe(true);
  });

  it("does not retry normal assertion failures", () => {
    expect(
      runCiE2e.isDeviceOfflineFailure(
        'Assertion is false: "Transactions" is visible'
      )
    ).toBe(false);
  });

  it("retries child script transport failures only when the caller opts in", () => {
    expect(
      runCiE2e.shouldRetryChildScriptFailure(
        "io.grpc.StatusRuntimeException: UNAVAILABLE"
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldRetryChildScriptFailure(
        "io.grpc.StatusRuntimeException: UNAVAILABLE",
        { retryOnDeviceFailure: true }
      )
    ).toBe(true);
    expect(
      runCiE2e.shouldRetryChildScriptFailure(
        "io.grpc.StatusRuntimeException: UNAVAILABLE",
        { retryOnDeviceFailure: false }
      )
    ).toBe(false);
  });

  it("reuses and refreshes the authenticated session for SMS sync journeys", () => {
    expect(runCiE2e.getSmsSyncJourneyOptions()).toEqual({
      retryOnDeviceFailure: false,
      env: {
        E2E_SKIP_AUTH_BOOTSTRAP: "1",
        E2E_SMS_SYNC_RELAUNCH_BETWEEN_JOURNEYS: "1",
      },
    });
  });

  it("retries only explicitly safe Maestro suite flows when the emulator disconnects", () => {
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "sms-sync/sms-sync-permission-requestable.yaml"
      )
    ).toBe(true);
    expect(
      runCiE2e.getMaestroSuiteFlowOptions(
        "sms-sync/sms-sync-permission-requestable.yaml"
      )
    ).toMatchObject({
      retryOnDeviceFailure: true,
    });
    expect(
      runCiE2e.getMaestroSuiteFlowOptions(
        "sms-sync/sms-sync-permission-requestable.yaml"
      ).prepareRetry
    ).toBeUndefined();
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "transactions/create-transaction.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(true);
    expect(
      runCiE2e.getMaestroSuiteFlowOptions(
        "transactions/create-transaction.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toMatchObject({
      retryOnDeviceFailure: true,
    });
    expect(
      runCiE2e.getMaestroSuiteFlowOptions(
        "transactions/create-transaction.yaml",
        { E2E_SUPABASE_MODE: "local" }
      ).prepareRetry
    ).toEqual(expect.any(Function));
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "recurring-payments/recurring-payments-crud-actions.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(true);
    expect(
      runCiE2e.getMaestroSuiteFlowOptions(
        "recurring-payments/recurring-payments-crud-actions.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toMatchObject({
      retryOnDeviceFailure: true,
    });
    expect(
      runCiE2e.getMaestroSuiteFlowOptions(
        "recurring-payments/recurring-payments-crud-actions.yaml",
        { E2E_SUPABASE_MODE: "local" }
      ).prepareRetry
    ).toEqual(expect.any(Function));
  });

  it("does not retry side-effecting Maestro flows when clean local reset is unavailable", () => {
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "transactions/create-transaction.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "accounts/egyptian-institution-presets.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "recurring-payments/recurring-payments-crud-actions.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "transactions/create-transaction.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(true);
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "sms-sync/sms-sync-permission-requestable.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "transactions/create-transaction.yaml",
        {
          E2E_SKIP_AUTH_BOOTSTRAP: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldResetMaestroFlowBeforeRetry(
        "transactions/create-transaction.yaml",
        {
          E2E_SKIP_SEED: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "transactions/create-transaction.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "recurring-payments/recurring-payments-crud-actions.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "transactions/create-transaction.yaml",
        {
          E2E_SKIP_AUTH_BOOTSTRAP: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      runCiE2e.shouldRetryMaestroSuiteFlow(
        "transactions/create-transaction.yaml",
        {
          E2E_SKIP_SEED: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      runCiE2e.getMaestroSuiteFlowOptions("live-sms/live-sms-foreground.yaml", {
        E2E_SUPABASE_MODE: "local",
      })
    ).toMatchObject({
      retryOnDeviceFailure: false,
    });
  });

  it("keeps stabilization failures inside the bounded retry window", () => {
    expect(runCiE2e.shouldRetryStabilizationFailure(1, 5)).toBe(true);
    expect(runCiE2e.shouldRetryStabilizationFailure(5, 5)).toBe(false);
  });

  it("bootstraps auth for remote live-SMS-only suites", () => {
    expect(
      runCiE2e.shouldBootstrapBeforeLiveSms(new Set(["live-sms"]), "remote")
    ).toBe(true);
    expect(
      runCiE2e.shouldBootstrapBeforeLiveSms(new Set(["live-sms"]), "local")
    ).toBe(false);
    expect(
      runCiE2e.shouldBootstrapBeforeLiveSms(new Set(["sms-sync"]), "remote")
    ).toBe(false);
  });
});
