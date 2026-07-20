import { REQUIRED_SAFEGUARD_QA_PROFILE_IDS } from "@monyvi/logic";
import {
  SmsSafeguardQaRunner,
  type SmsSafeguardQaRunResult,
} from "@/services/testing/sms-safeguard-qa-runner";

const QA_ENVIRONMENT = {
  NODE_ENV: "test",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
} as const;

describe("deterministic SMS safeguard QA", () => {
  test("runs all 14 versioned profiles with a fixed clock and no production usage", async () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const results = await runner.runAll();

    expect(results.map(({ diagnostics }) => diagnostics.profileId)).toEqual(
      REQUIRED_SAFEGUARD_QA_PROFILE_IDS
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

  test("uses shared policy/reconciliation behavior for representative boundaries", async () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const cutoff = await runner.run("cutoff-boundary-v1");
    const partial = await runner.run("partial-quota-v1");
    const response = await runner.run("response-validity-v1");

    expect(cutoff.diagnostics.filteredOutCount).toBeGreaterThan(0);
    expect(partial.diagnostics.deferredCount).toBeGreaterThan(0);
    expect(response.diagnostics.invalidResponseCount).toBeGreaterThan(0);
    expect(response.diagnostics.checkpointCount).toBe(0);
  });

  test("reset clears only the selected namespace and keeps other QA state", () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });
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
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const first = await runner.run("shared-batch-live-v1");
    runner.reset("shared-batch-live-v1");
    const second = await runner.run("shared-batch-live-v1");

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /rawSmsBody|sender|amount|merchant|category|account|card|providerResponse/i
    );
  });

  test("returns a stable result contract for every run", async () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const result: SmsSafeguardQaRunResult =
      await runner.run("account-switch-v1");

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
