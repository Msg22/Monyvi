import { matchTrustedSmsTemplate } from "../trusted-sms-template-matcher";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../trusted-sms-patterns";
import type { TrustedSmsPattern } from "../trusted-sms-pattern-types";
import { renderTrustedPattern } from "./fixtures/trusted-sms/trusted-sms-builders";

interface StagedMetrics {
  readonly total: number;
  readonly localMatches: number;
  readonly trustedRejections: number;
  readonly aiFallbacks: number;
  readonly ambiguities: number;
  readonly falsePositives: number;
}

function pattern(patternId: string): TrustedSmsPattern {
  const result = QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.find(
    (candidate) => candidate.patternId === patternId
  );
  if (result === undefined) throw new Error(`missing_pattern:${patternId}`);
  return result;
}

describe("trusted SMS staged validation metrics", () => {
  it("records exact local resolution and fails unknown messages closed to AI", () => {
    const purchase = pattern("qnb-egypt-card-purchase-egp-v1");
    const otp = pattern("qnb-egypt-otp-card-purchase-v1");
    const fixtures = [
      { body: renderTrustedPattern(purchase), expected: "matched" },
      { body: renderTrustedPattern(otp), expected: "rejected" },
      {
        body: "An unknown QNB message that has no reviewed template",
        expected: "unresolved",
      },
      {
        body: renderTrustedPattern(purchase).replace("Successful", "Approved"),
        expected: "unresolved",
      },
    ] as const;

    const outcomes = fixtures.map(({ body, expected }) => ({
      expected,
      result: matchTrustedSmsTemplate({
        candidate: {
          sender: "QNB EGYPT",
          body,
          receivedAtMs: 1_750_000_000_000,
        },
        patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
        supportedCurrencies: ["EGP", "USD"],
      }),
    }));
    const metrics: StagedMetrics = {
      total: outcomes.length,
      localMatches: outcomes.filter(({ result }) => result.status === "matched")
        .length,
      trustedRejections: outcomes.filter(
        ({ result }) => result.status === "rejected"
      ).length,
      aiFallbacks: outcomes.filter(
        ({ result }) => result.status === "unresolved"
      ).length,
      ambiguities: outcomes.filter(
        ({ result }) => result.status === "ambiguous"
      ).length,
      falsePositives: outcomes.filter(
        ({ expected, result }) =>
          expected === "unresolved" && result.status === "matched"
      ).length,
    };

    expect(outcomes.map(({ result }) => result.status)).toEqual(
      fixtures.map(({ expected }) => expected)
    );
    expect(metrics).toEqual({
      total: 4,
      localMatches: 1,
      trustedRejections: 1,
      aiFallbacks: 2,
      ambiguities: 0,
      falsePositives: 0,
    });
  });

  it("validates every promoted pattern against exact and intentional non-matches", () => {
    const patterns = QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns;
    const outcomes = patterns.flatMap((trustedPattern) => {
      const body = renderTrustedPattern(trustedPattern);
      const sender = trustedPattern.verifiedSenderAliases[0] ?? "";
      const exact = matchTrustedSmsTemplate({
        candidate: { sender, body, receivedAtMs: 1_750_000_000_000 },
        patterns,
        supportedCurrencies: ["EGP", "USD"],
      });
      const prefixed = matchTrustedSmsTemplate({
        candidate: {
          sender,
          body: `!${body}`,
          receivedAtMs: 1_750_000_000_000,
        },
        patterns,
        supportedCurrencies: ["EGP", "USD"],
      });
      const wrongSender = matchTrustedSmsTemplate({
        candidate: {
          sender: "UNREVIEWED SENDER",
          body,
          receivedAtMs: 1_750_000_000_000,
        },
        patterns,
        supportedCurrencies: ["EGP", "USD"],
      });
      return [{ trustedPattern, exact, prefixed, wrongSender }];
    });

    for (const { trustedPattern, exact, prefixed, wrongSender } of outcomes) {
      const expectedStatus =
        trustedPattern.expectedOutcome.kind === "transaction"
          ? "matched"
          : "rejected";
      expect(exact.status).toBe(expectedStatus);
      if (exact.status === "matched") {
        expect(exact.pattern.patternId).toBe(trustedPattern.patternId);
      } else if (exact.status === "rejected") {
        expect(exact.patternId).toBe(trustedPattern.patternId);
      }
      expect(prefixed.status).toBe("unresolved");
      expect(wrongSender.status).toBe("unresolved");
    }

    expect(outcomes).toHaveLength(patterns.length);
    expect(outcomes).toHaveLength(22);
  });
});
