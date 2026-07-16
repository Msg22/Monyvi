import {
  createTrustedSmsCatalogIntegrityDigest,
  createTrustedSmsPatternIntegrityDigest,
} from "../trusted-sms-pattern-catalog";
import { matchTrustedSmsTemplate } from "../trusted-sms-template-matcher";
import type {
  TrustedSmsPattern,
  TrustedSmsTemplateResult,
} from "../trusted-sms-pattern-types";
import { QNB_EGYPT_TRUSTED_SMS_CATALOG } from "../trusted-sms-patterns";
import {
  buildTrustedCatalog,
  buildTrustedPattern,
  renderTrustedPattern,
} from "./fixtures/trusted-sms/trusted-sms-builders";

function findPattern(patternId: string): TrustedSmsPattern {
  const pattern = QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns.find(
    ({ patternId: candidateId }) => candidateId === patternId
  );
  if (pattern === undefined)
    throw new Error(`missing_test_pattern:${patternId}`);
  return pattern;
}

function match(
  pattern: TrustedSmsPattern,
  body: string = renderTrustedPattern(pattern),
  supportedCurrencies: readonly string[] = ["EGP", "USD"]
): TrustedSmsTemplateResult {
  return matchTrustedSmsTemplate({
    candidate: {
      sender: pattern.verifiedSenderAliases[0] ?? "QNB EGYPT",
      body,
      receivedAtMs: new Date("2026-07-16T12:00:00Z").getTime(),
    },
    patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
    supportedCurrencies,
  });
}

describe("trusted SMS exact template matcher", () => {
  it("matches an exact reviewed QNB transaction template", () => {
    const pattern = findPattern("qnb-egypt-card-purchase-egp-v1");
    const result = match(pattern);

    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.pattern.patternId).toBe(pattern.patternId);
    expect(result.extractedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          semanticRole: "transaction_amount",
          value: "125.50",
        }),
        expect.objectContaining({
          semanticRole: "merchant_name",
          value: "TEST MERCHANT",
        }),
      ])
    );
  });

  it("matches an approved ATM terminal as an ATM withdrawal only", () => {
    const pattern = findPattern("qnb-egypt-atm-card-egp-v1");
    const result = match(
      pattern,
      renderTrustedPattern(pattern, {
        atm_terminal: "ATM-Zayed Dunes-Giza-F84",
      })
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.pattern.messageFamily).toBe("atm_withdrawal");
    expect(result.extractedValues).toContainEqual({
      token: "ATM_TERMINAL",
      semanticRole: "atm_terminal",
      value: "ATM-Zayed Dunes-Giza-F84",
    });
  });

  it("does not classify an ATM terminal as a purchase merchant", () => {
    const pattern = findPattern("qnb-egypt-card-purchase-egp-v1");
    const result = match(
      pattern,
      renderTrustedPattern(pattern, { merchant_name: "NBE ATM296" })
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") return;
    expect(result.pattern.messageFamily).toBe("atm_withdrawal");
  });

  it("rejects an exact reviewed OTP template without a transaction", () => {
    const pattern = findPattern("qnb-egypt-otp-card-purchase-v1");

    expect(match(pattern)).toEqual({
      status: "rejected",
      patternId: pattern.patternId,
      reason: "otp",
    });
  });

  it("rejects an exact reviewed promotion without transaction-value validation", () => {
    const pattern = findPattern("qnb-alahli-promotional-certificate-ar-v1");
    const result = matchTrustedSmsTemplate({
      candidate: {
        sender: pattern.verifiedSenderAliases[0] ?? "QNB ALAHLI",
        body: renderTrustedPattern(pattern),
        receivedAtMs: 1_750_000_000_000,
      },
      patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(result).toEqual({
      status: "rejected",
      patternId: pattern.patternId,
      reason: "promotional",
    });
  });

  it("normalizes sender casing and surrounding whitespace only", () => {
    const pattern = findPattern("qnb-egypt-card-purchase-egp-v1");
    const result = matchTrustedSmsTemplate({
      candidate: {
        sender: "  qnb egypt  ",
        body: renderTrustedPattern(pattern),
        receivedAtMs: Date.now(),
      },
      patterns: QNB_EGYPT_TRUSTED_SMS_CATALOG.patterns,
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(result.status).toBe("matched");
  });

  it("normalizes line breaks and repeated body whitespace", () => {
    const pattern = findPattern("qnb-egypt-outgoing-ipn-egp-v1");
    const body = renderTrustedPattern(pattern).replaceAll(" ", "  \r\n");

    expect(match(pattern, body).status).toBe("matched");
  });

  it.each([
    ["letter case", (body: string) => body.replace("Your", "your")],
    ["punctuation", (body: string) => body.replace(",your", " your")],
    ["fixed wording", (body: string) => body.replace("Successful", "Approved")],
  ])("does not broaden exact matching for %s", (_label, mutate) => {
    const pattern = findPattern("qnb-egypt-card-purchase-egp-v1");

    expect(match(pattern, mutate(renderTrustedPattern(pattern))).status).toBe(
      "unresolved"
    );
  });

  it("leaves malformed transaction values unresolved", () => {
    const pattern = findPattern("qnb-egypt-card-purchase-egp-v1");
    const body = renderTrustedPattern(pattern, {
      transaction_amount: "not-an-amount",
    });

    expect(match(pattern, body)).toEqual({
      status: "unresolved",
      reason: "malformed_value",
      patternIds: [pattern.patternId],
    });
  });

  it.each([
    ["calendar date", { transaction_date: "31/02" }],
    ["12-hour time", { transaction_time: "13:70 PM" }],
  ])("leaves an invalid %s unresolved", (_label, roleValues) => {
    const pattern = findPattern("qnb-egypt-outgoing-ipn-egp-v1");

    expect(match(pattern, renderTrustedPattern(pattern, roleValues))).toEqual({
      status: "unresolved",
      reason: "malformed_value",
      patternIds: [pattern.patternId],
    });
  });

  it("leaves an unsupported currency unresolved", () => {
    const pattern = findPattern("qnb-egypt-card-purchase-usd-v1");

    expect(
      match(
        pattern,
        renderTrustedPattern(pattern, {
          transaction_currency: "USD",
        }),
        ["EGP"]
      )
    ).toEqual({
      status: "unresolved",
      reason: "unsupported_currency",
      patternIds: [pattern.patternId],
    });
  });

  it("does not match disabled patterns", () => {
    const base = buildTrustedPattern();
    const disabled = {
      ...base,
      enabled: false,
      integrityDigest: "",
    };
    const signedPattern = {
      ...disabled,
      integrityDigest: createTrustedSmsPatternIntegrityDigest(disabled),
    };
    const catalog = buildTrustedCatalog([signedPattern]);
    const signedCatalog = {
      ...catalog,
      integrityDigest: createTrustedSmsCatalogIntegrityDigest(catalog),
    };

    expect(
      matchTrustedSmsTemplate({
        candidate: {
          sender: "QNB EGYPT",
          body: renderTrustedPattern(signedPattern),
          receivedAtMs: Date.now(),
        },
        patterns: signedCatalog.patterns.filter(({ enabled }) => enabled),
        supportedCurrencies: ["EGP"],
      })
    ).toEqual({ status: "unresolved", reason: "no_match", patternIds: [] });
  });

  it("can identify an exact disabled rejection for fallback routing", () => {
    const source = findPattern("qnb-egypt-otp-card-purchase-v1");
    const disabled = {
      ...source,
      enabled: false,
      integrityDigest: "",
    };
    const signedPattern = {
      ...disabled,
      integrityDigest: createTrustedSmsPatternIntegrityDigest(disabled),
    };

    expect(
      matchTrustedSmsTemplate({
        candidate: {
          sender: source.verifiedSenderAliases[0] ?? "QNB EGYPT",
          body: renderTrustedPattern(source),
          receivedAtMs: Date.now(),
        },
        patterns: [signedPattern],
        supportedCurrencies: ["EGP", "USD"],
        includeDisabledPatterns: true,
      })
    ).toEqual({
      status: "rejected",
      patternId: source.patternId,
      reason: "otp",
    });
  });

  it("fails closed when more than one pattern resolves", () => {
    const first = buildTrustedPattern();
    const secondBase = {
      ...first,
      patternId: "qnb-egypt-card-purchase-duplicate-v1",
      promotionId: "promotion-qnb-egypt-card-purchase-duplicate-v1",
      integrityDigest: "",
    };
    const second = {
      ...secondBase,
      integrityDigest: createTrustedSmsPatternIntegrityDigest(secondBase),
    };

    expect(
      matchTrustedSmsTemplate({
        candidate: {
          sender: "QNB EGYPT",
          body: renderTrustedPattern(first),
          receivedAtMs: Date.now(),
        },
        patterns: [second, first],
        supportedCurrencies: ["EGP"],
      })
    ).toEqual({
      status: "ambiguous",
      patternIds: [first.patternId, second.patternId].sort(),
    });
  });
});
