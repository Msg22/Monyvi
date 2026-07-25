import {
  SmsSafeguardProviderSimulator,
  type SimulatedProviderStep,
} from "@/services/testing/sms-safeguard-provider-simulator";

describe("SmsSafeguardProviderSimulator", () => {
  const request = {
    requestId: "qa-request-1",
    messageIds: ["message-1", "message-2"],
    startedAtMs: Date.UTC(2026, 6, 20, 12, 0, 0),
  } as const;

  test.each([
    ["trusted-success", true, false],
    ["low-confidence-success", true, true],
    ["explicit-negative", false, false],
    ["omission", undefined, false],
  ] as const)(
    "simulates %s without a production provider call",
    async (outcome, isTrusted, isLowConfidence) => {
      const simulator = new SmsSafeguardProviderSimulator([{ outcome }]);

      const result = await simulator.complete(request);

      expect(result.kind).toBe("completion");
      if (result.kind !== "completion") return;
      expect(result.envelope.completionStatus).toBe("complete");
      expect(result.envelope.transactions[0]?.isTrusted).toBe(isTrusted);
      expect(result.isLowConfidence).toBe(isLowConfidence);
      expect(simulator.productionProviderCallCount).toBe(0);
    }
  );

  test.each([
    ["retryable-failure", "retryable"],
    ["permanent-failure", "permanent"],
    ["malformed", "malformed"],
    ["incomplete", "incomplete"],
    ["invalid-identity", "completion"],
    ["delay", "completion"],
  ] as const)(
    "simulates %s as a deterministic outcome",
    async (outcome, kind) => {
      const step: SimulatedProviderStep =
        outcome === "delay" ? { outcome, delayMs: 250 } : { outcome };
      const simulator = new SmsSafeguardProviderSimulator([step], {
        sleep: () => Promise.resolve(),
      });

      const result = await simulator.complete(request);

      expect(result.kind).toBe(kind);
      expect(result.delayMs).toBe(outcome === "delay" ? 250 : 0);
      expect(simulator.simulatedCallCount).toBe(1);
    }
  );

  test("returns cancellation instead of waiting or falling back", async () => {
    const simulator = new SmsSafeguardProviderSimulator([
      { outcome: "delay", delayMs: 5_000 },
    ]);
    const controller = new AbortController();
    controller.abort();

    const result = await simulator.complete({
      ...request,
      signal: controller.signal,
    });

    expect(result.kind).toBe("cancelled");
    expect(simulator.productionProviderCallCount).toBe(0);
  });
});
