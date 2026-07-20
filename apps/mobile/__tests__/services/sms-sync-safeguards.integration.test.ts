import { SmsSafeguardQaRunner } from "@/services/testing/sms-safeguard-qa-runner";

const QA_ENVIRONMENT = {
  NODE_ENV: "test",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
} as const;

describe("SMS sync safeguard integration boundaries", () => {
  it("suppresses a synchronized terminal outcome on a fresh installation before provider work", async () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const result = await runner.run("terminal-fresh-install-v1");

    expect(result.status).toBe("passed");
    expect(result.diagnostics.terminalCount).toBe(1);
    expect(result.diagnostics.simulatedProviderCallCount).toBe(0);
    expect(result.diagnostics.checkpointCount).toBe(0);
  });

  it("allows exact trusted local recovery without clearing terminal server truth", async () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const result = await runner.run("trusted-local-recovery-v1");

    expect(result.status).toBe("passed");
    expect(result.diagnostics.localCount).toBeGreaterThan(0);
    expect(result.diagnostics.simulatedProviderCallCount).toBe(0);
    expect(result.diagnostics.productionProviderCallCount).toBe(0);
  });

  it("keeps checkpoint and outcome state scoped across an account switch", async () => {
    const runner = new SmsSafeguardQaRunner({ environment: QA_ENVIRONMENT });

    const result = await runner.run("account-switch-v1");

    expect(result.status).toBe("passed");
    expect(result.diagnostics.productionAllowanceChargeCount).toBe(0);
  });
});
