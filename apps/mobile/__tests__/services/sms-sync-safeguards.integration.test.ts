import { SmsSafeguardQaPreflightRunner } from "@/services/testing/sms-safeguard-qa-runner";

const QA_ENVIRONMENT = {
  NODE_ENV: "test",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "sync-safeguards-run",
} as const;

describe("SMS sync safeguard integration boundaries", () => {
  it("allows exact trusted local recovery without clearing terminal server truth", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    const result = await runner.run("trusted-local-recovery-v1");

    expect(result.status).toBe("passed");
    expect(result.diagnostics.localCount).toBeGreaterThan(0);
    expect(result.diagnostics.simulatedProviderCallCount).toBe(0);
    expect(result.diagnostics.productionProviderCallCount).toBe(0);
  });

  it("routes synchronized terminal and account-switch proofs to local Supabase", async () => {
    const runner = new SmsSafeguardQaPreflightRunner({
      environment: QA_ENVIRONMENT,
    });

    await expect(runner.run("terminal-fresh-install-v1")).rejects.toThrow(
      /local Supabase safeguard QA endpoint/i
    );
    await expect(runner.run("account-switch-v1")).rejects.toThrow(
      /local Supabase safeguard QA endpoint/i
    );
  });
});
