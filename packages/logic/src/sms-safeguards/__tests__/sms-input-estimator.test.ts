import {
  canFitSmsCandidate,
  estimateSmsRequestInputTokens,
  getUtf8ByteLength,
} from "../sms-input-estimator";

describe("SMS safeguard input estimation", () => {
  it("counts UTF-8 bytes instead of UTF-16 code units", () => {
    expect(getUtf8ByteLength("abc")).toBe(3);
    expect(getUtf8ByteLength("جنيه")).toBeGreaterThan("جنيه".length);
  });

  it("reports fixed and candidate token estimates separately", () => {
    const report = estimateSmsRequestInputTokens({
      prompt: "parse",
      categories: "food",
      schema: "transactions",
      messages: ["one", "two"],
    });

    expect(report.totalTokens).toBe(
      report.promptTokens +
        report.categoryTokens +
        report.schemaTokens +
        report.candidateTokens
    );
    expect(report.candidateTokens).toBeGreaterThan(0);
  });

  it("refuses one candidate that cannot fit without truncating it", () => {
    expect(
      canFitSmsCandidate({
        candidatePayload: "x".repeat(1_001),
        fixedPayloadBytes: 100,
        fixedInputTokens: 100,
        maxPayloadBytes: 1_100,
        maxInputTokens: 1_000,
      })
    ).toEqual({
      fits: false,
      reason: "candidate_too_large",
    });
  });
});
