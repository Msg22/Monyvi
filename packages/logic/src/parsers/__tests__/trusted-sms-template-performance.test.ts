import { matchTrustedSmsTemplate } from "../trusted-sms-template-matcher";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../trusted-sms-patterns";
import { renderTrustedPattern } from "./fixtures/trusted-sms/trusted-sms-builders";

describe("trusted SMS matcher performance", () => {
  it("evaluates 1,000 candidates within one second", () => {
    const pattern = QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.find(
      ({ patternId }) => patternId === "qnb-egypt-card-purchase-egp-v1"
    );
    if (pattern === undefined) throw new Error("missing_benchmark_pattern");
    const startedAt = performance.now();

    for (let index = 0; index < 1_000; index += 1) {
      matchTrustedSmsTemplate({
        candidate: {
          sender: "QNB EGYPT",
          body: renderTrustedPattern(pattern, {
            transaction_amount: `${100 + index}.50`,
          }),
          receivedAtMs: 1_750_000_000_000 + index,
        },
        patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
        supportedCurrencies: ["EGP", "USD"],
      });
    }

    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
