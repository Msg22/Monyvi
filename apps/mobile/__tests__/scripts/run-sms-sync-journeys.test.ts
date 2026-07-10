interface RunSmsSyncJourneysModule {
  buildSmsSyncProbeCleanupSql(): string;
  buildBatchSmsSavedVerificationQueries(): readonly SmsVerificationQuery[];
  buildFixtureSmsSavedVerificationQueries(): readonly SmsVerificationQuery[];
  buildLocalParserSmsSavedVerificationQueries(): readonly SmsVerificationQuery[];
  getAuthBootstrapFlow(
    env?: Readonly<Record<string, string | undefined>>
  ):
    | "../helpers/ci-auth-bootstrap.yaml"
    | "../helpers/ci-auth-deeplink-bootstrap.yaml";
  getMaestroFlowTimeoutMs(
    env?: Readonly<Record<string, string | undefined>>
  ): number;
  shouldResetSmsSyncAppStateBeforeRetry(
    flow: string,
    env?: Readonly<Record<string, string | undefined>>
  ): boolean;
  shouldRetrySmsSyncFlowAfterTransportFailure(
    flow: string,
    env?: Readonly<Record<string, string | undefined>>
  ): boolean;
  shouldRetrySmsSyncFlowAttempt(
    flow: string,
    result: { readonly didTimeout: boolean; readonly output: string }
  ): boolean;
  shouldRelaunchBetweenSmsSyncJourneys(
    env?: Readonly<Record<string, string | undefined>>
  ): boolean;
}

interface SmsVerificationQuery {
  readonly label: string;
  readonly sql: string;
  readonly expected: string;
}

const smsSyncJourneys = jest.requireActual(
  "../../scripts/run-sms-sync-journeys"
) as RunSmsSyncJourneysModule;

describe("run-sms-sync-journeys helpers", () => {
  beforeEach(() => {
    process.env.E2E_USER_ID = "e2e-user-1";
  });

  afterEach(() => {
    delete process.env.E2E_USER_ID;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
  });

  it("cleans only current-user SMS sync probe rows and fails on SQL errors", () => {
    const sql = smsSyncJourneys.buildSmsSyncProbeCleanupSql();

    expect(sql).toContain("delete from transactions where");
    expect(sql).toContain("source = 'SMS'");
    expect(sql).toContain("delete from transfers where");
    expect(sql).toContain("sms_fingerprint is not null");
    expect(sql).toContain("user_id = 'e2e-user-1'");
  });

  it("verifies fixture saved SMS sync rows only for the current E2E user", () => {
    const queries = smsSyncJourneys.buildBatchSmsSavedVerificationQueries();

    expect(queries).toHaveLength(3);
    expect(queries.map((query) => query.expected)).toEqual(["2", "2", "1"]);
    expect(queries.map((query) => query.sql).join("\n")).toContain(
      "counterparty = 'PR622 BATCH DUPLICATE SHOP'"
    );
    for (const query of queries.map((item) => item.sql)) {
      expect(query).toContain("user_id = 'e2e-user-1'");
    }
  });

  it("verifies local-parser saved SMS sync rows with corpus-level invariants", () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const queries = smsSyncJourneys.buildBatchSmsSavedVerificationQueries();

    expect(queries).toHaveLength(3);
    expect(queries.map((query) => query.expected)).toEqual(["1", "1", "1"]);
    expect(queries[0]?.sql).toContain(">= 10");
    expect(queries[1]?.sql).toContain("count(distinct sms_fingerprint)");
    expect(queries[2]?.sql).toContain("notes = 'ATM Withdrawal'");
    for (const query of queries.map((item) => item.sql)) {
      expect(query).toContain("user_id = 'e2e-user-1'");
    }
  });

  it("keeps the authenticated dev-client session alive by default", () => {
    expect(smsSyncJourneys.shouldRelaunchBetweenSmsSyncJourneys({})).toBe(
      false
    );
    expect(
      smsSyncJourneys.shouldRelaunchBetweenSmsSyncJourneys({
        E2E_SMS_SYNC_RELAUNCH_BETWEEN_JOURNEYS: "1",
      })
    ).toBe(true);
  });

  it("uses the guarded deep-link auth bootstrap when CI opts in", () => {
    expect(smsSyncJourneys.getAuthBootstrapFlow({})).toBe(
      "../helpers/ci-auth-bootstrap.yaml"
    );
    expect(
      smsSyncJourneys.getAuthBootstrapFlow({
        E2E_AUTH_DEEPLINK_BOOTSTRAP: "1",
      })
    ).toBe("../helpers/ci-auth-deeplink-bootstrap.yaml");
  });

  it("uses a bounded Maestro flow timeout with env override", () => {
    expect(smsSyncJourneys.getMaestroFlowTimeoutMs({})).toBe(10 * 60 * 1000);
    expect(
      smsSyncJourneys.getMaestroFlowTimeoutMs({
        E2E_MAESTRO_FLOW_TIMEOUT_MS: "1000",
      })
    ).toBe(1000);
    expect(
      smsSyncJourneys.getMaestroFlowTimeoutMs({
        E2E_MAESTRO_FLOW_TIMEOUT_MS: "not-a-number",
      })
    ).toBe(10 * 60 * 1000);
    expect(
      smsSyncJourneys.getMaestroFlowTimeoutMs({
        E2E_MAESTRO_FLOW_TIMEOUT_MS: "0",
      })
    ).toBe(10 * 60 * 1000);
    expect(
      smsSyncJourneys.getMaestroFlowTimeoutMs({
        E2E_MAESTRO_FLOW_TIMEOUT_MS: "-1",
      })
    ).toBe(10 * 60 * 1000);
  });

  it("resets the seeded app state before retrying side-effecting SMS saves", () => {
    expect(
      smsSyncJourneys.shouldResetSmsSyncAppStateBeforeRetry(
        "sms-sync-batch-duplicates-atm.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(true);
    expect(
      smsSyncJourneys.shouldResetSmsSyncAppStateBeforeRetry(
        "sms-sync-batch-duplicates-atm.yaml",
        {
          E2E_SKIP_AUTH_BOOTSTRAP: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      smsSyncJourneys.shouldResetSmsSyncAppStateBeforeRetry(
        "sms-sync-batch-duplicates-atm.yaml",
        {
          E2E_SKIP_SEED: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      smsSyncJourneys.shouldResetSmsSyncAppStateBeforeRetry(
        "sms-sync-batch-duplicates-atm.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(false);
    expect(
      smsSyncJourneys.shouldResetSmsSyncAppStateBeforeRetry(
        "sms-sync-rescan-skips-saved.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(false);
  });

  it("retries SMS save flows only when a clean reset can run", () => {
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAfterTransportFailure(
        "sms-sync-batch-duplicates-atm.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(true);
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAfterTransportFailure(
        "sms-sync-batch-duplicates-atm.yaml",
        {
          E2E_SKIP_AUTH_BOOTSTRAP: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAfterTransportFailure(
        "sms-sync-batch-duplicates-atm.yaml",
        {
          E2E_SKIP_SEED: "1",
          E2E_SUPABASE_MODE: "local",
        }
      )
    ).toBe(false);
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAfterTransportFailure(
        "sms-sync-rescan-skips-saved.yaml",
        { E2E_SUPABASE_MODE: "remote" }
      )
    ).toBe(true);
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAfterTransportFailure(
        "../helpers/ci-auth-deeplink-bootstrap.yaml",
        { E2E_SUPABASE_MODE: "local" }
      )
    ).toBe(false);
  });

  it("does not retry timeouts because they may be app-flow failures", () => {
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAttempt(
        "sms-sync-batch-duplicates-atm.yaml",
        {
          didTimeout: true,
          output:
            "io.grpc.StatusRuntimeException: UNAVAILABLE: End of stream or IOException",
        }
      )
    ).toBe(false);
  });

  it("retries only known SMS journey flows after real transport failures", () => {
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAttempt(
        "sms-sync-batch-duplicates-atm.yaml",
        {
          didTimeout: false,
          output:
            "io.grpc.StatusRuntimeException: UNAVAILABLE: End of stream or IOException",
        }
      )
    ).toBe(true);
    expect(
      smsSyncJourneys.shouldRetrySmsSyncFlowAttempt(
        "../helpers/ci-auth-deeplink-bootstrap.yaml",
        {
          didTimeout: false,
          output:
            "io.grpc.StatusRuntimeException: UNAVAILABLE: End of stream or IOException",
        }
      )
    ).toBe(false);
  });
});
