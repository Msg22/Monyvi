import {
  CLIENT_PREFLIGHT_SAFEGUARD_QA_PROFILE_IDS,
  createSafeguardQaInboxMessages,
  SmsSafeguardQaPreflightRunner,
  type SmsSafeguardQaRunResult,
} from "@/services/testing/sms-safeguard-qa-runner";

const QA_ENVIRONMENT = {
  NODE_ENV: "test",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "safeguard-preflight-run",
} as const;

describe("deterministic SMS safeguard client preflight", () => {
  test("keeps reviewable suggestions alongside one oversized candidate", () => {
    const messages = createSafeguardQaInboxMessages("oversized-candidate-v1");

    expect(messages.filter(({ body }) => body.length > 8_192)).toHaveLength(1);
    expect(
      messages.filter(({ body }) => body.includes("Successful transaction"))
    ).toHaveLength(1);
    expect(
      messages.filter(({ body }) => body.includes("completed payment"))
    ).toHaveLength(2);
    expect(
      messages.filter(({ body }) => body.includes("QNB rewards"))
    ).toHaveLength(1);
  });

  test("runs only client-owned profiles with a fixed clock and no production usage", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    const results = await runner.runAll();

    expect(results.map(({ diagnostics }) => diagnostics.profileId)).toEqual(
      CLIENT_PREFLIGHT_SAFEGUARD_QA_PROFILE_IDS
    );
    expect(results.every(({ status }) => status === "passed")).toBe(true);
    expect(
      results.every(
        ({ diagnostics }) =>
          diagnostics.fixedNowMs === Date.UTC(2026, 6, 20, 12, 0, 0) &&
          diagnostics.productionProviderCallCount === 0 &&
          diagnostics.productionAllowanceChargeCount === 0
      )
    ).toBe(true);
  });

  test("uses shared boundary behavior for representative client profiles", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    const cutoff = await runner.run("cutoff-boundary-v1");
    const checkpoint = await runner.run("checkpoint-overlap-v1");

    expect(cutoff.diagnostics.filteredOutCount).toBeGreaterThan(0);
    expect(checkpoint.diagnostics.effectiveMinDate).toBeLessThan(
      checkpoint.diagnostics.fixedNowMs
    );
  });

  test("requires server-owned profiles to use local Supabase", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    await expect(runner.run("partial-quota-v1")).rejects.toThrow(
      /local Supabase safeguard QA endpoint/i
    );
  });

  test("reset clears only the selected namespace and keeps other QA state", () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });
    runner.setNamespaceMarker("sms-safeguard-qa:unrelated", "keep-me");
    runner.setNamespaceMarker(
      "sms-safeguard-qa:cutoff-boundary-v1",
      "remove-me"
    );

    runner.reset("cutoff-boundary-v1");

    expect(runner.getNamespaceMarker("sms-safeguard-qa:unrelated")).toBe(
      "keep-me"
    );
    expect(
      runner.getNamespaceMarker("sms-safeguard-qa:cutoff-boundary-v1")
    ).toBeNull();
  });

  test("is repeatable after a namespace reset and exposes aggregate diagnostics only", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    const first = await runner.run("trusted-local-recovery-v1");
    runner.reset("trusted-local-recovery-v1");
    const second = await runner.run("trusted-local-recovery-v1");

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /rawSmsBody|sender|amount|merchant|category|account|card|providerResponse/i
    );
  });

  test("returns a stable result contract for every run", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    const result: SmsSafeguardQaRunResult = await runner.run(
      "prompt-token-baseline-v1"
    );

    expect(result.status).toBe("passed");
    expect(result.diagnostics.profileVersion).toBe(1);
    expect(
      Number.isInteger(result.diagnostics.simulatedProviderCallCount)
    ).toBe(true);
    expect(Number.isInteger(result.diagnostics.admittedCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.consumedCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.refusedCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.localCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.aiCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.negativeCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.oversizedCount)).toBe(true);
    expect(Number.isInteger(result.diagnostics.checkpointCount)).toBe(true);
  });
});
