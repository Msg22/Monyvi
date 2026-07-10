import {
  LOCAL_SMS_FIXTURE_CORPUS,
  LOCAL_SMS_FIXTURE_CORPUS_MINIMUM_SIZE,
} from "../local-sms-fixture-corpus";
import { EGYPTIAN_FINANCIAL_INSTITUTIONS } from "../egyptian-bank-registry";
import { parseSmsWithLocalParser } from "../local-sms-parser";
import type { CategoryMapSource } from "../../utils/ai-parser-utils";
import type {
  LocalSmsCandidate,
  LocalSmsFixture,
} from "../local-sms-parser-types";

const categories: readonly CategoryMapSource[] = [
  { id: "cat-other", systemName: "other", displayName: "Other" },
  { id: "cat-shopping", systemName: "shopping", displayName: "Shopping" },
  { id: "cat-salary", systemName: "salary", displayName: "Salary" },
];

function toCandidate(fixture: LocalSmsFixture): LocalSmsCandidate {
  return {
    messageId: fixture.id,
    sender: fixture.sender,
    body: fixture.body,
    receivedAtMs: fixture.receivedAtMs,
    smsFingerprint: `fixture-fingerprint-${fixture.id}`,
  };
}

describe("local SMS fixture corpus", () => {
  it("contains at least 100 dev/test fixtures", () => {
    expect(LOCAL_SMS_FIXTURE_CORPUS.length).toBeGreaterThanOrEqual(
      LOCAL_SMS_FIXTURE_CORPUS_MINIMUM_SIZE
    );
  });

  it("covers every selectable bank and wallet provider", () => {
    const coveredProviderIds = new Set(
      LOCAL_SMS_FIXTURE_CORPUS.map((fixture) => fixture.providerId)
    );
    const selectableProviderIds = EGYPTIAN_FINANCIAL_INSTITUTIONS.filter(
      (institution) =>
        institution.selectable &&
        (institution.type === "bank" || institution.type === "wallet")
    ).map((institution) => institution.id);

    for (const providerId of selectableProviderIds) {
      expect(coveredProviderIds.has(providerId)).toBe(true);
    }
  });

  it("keeps all generated fixtures marked as dev/test provenance", () => {
    for (const fixture of LOCAL_SMS_FIXTURE_CORPUS) {
      expect(["synthetic", "internet_or_unknown"]).toContain(
        fixture.sourceType
      );
      expect(fixture.sourceConfidence).toBe("unknown");
      expect(fixture.notes).toContain("dev/test fixtures");
    }
  });

  it("keeps wallet fixtures without account identifiers in review", () => {
    const walletFixtures = LOCAL_SMS_FIXTURE_CORPUS.filter((fixture) =>
      fixture.scenario.startsWith("wallet_")
    );

    expect(walletFixtures.length).toBeGreaterThan(0);
    for (const fixture of walletFixtures) {
      expect(fixture.expectedOutcome).toMatchObject({
        reviewStatus: "needs_review",
        reviewReasons: ["account_needed"],
      });
    }
  });

  it("aligns QNB bank fixture card hints with the seeded QNB account", () => {
    const qnbBankFixtures = LOCAL_SMS_FIXTURE_CORPUS.filter(
      (fixture) =>
        fixture.providerId === "qnb-egypt" &&
        fixture.scenario.startsWith("bank_")
    );

    expect(qnbBankFixtures.length).toBeGreaterThan(0);
    for (const fixture of qnbBankFixtures) {
      expect(fixture.body).toContain("**** 5566");
      expect(fixture.expectedOutcome?.cardLast4).toBe("5566");
    }
  });

  it("parses financial corpus fixtures through declared local patterns", () => {
    const financialFixtures = LOCAL_SMS_FIXTURE_CORPUS.filter(
      (fixture) => fixture.isFinancialTransaction
    );
    const result = parseSmsWithLocalParser({
      candidates: financialFixtures.map(toCandidate),
      categories,
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(result.error).toBeUndefined();
    expect(result.transactions).toHaveLength(financialFixtures.length);
    for (const transaction of result.transactions) {
      const fixture = financialFixtures.find(
        (item) => item.id === transaction.messageId
      );
      expect(fixture?.expectedOutcome).toBeDefined();
      const { confidence, patternId, ...expectedOutcome } =
        fixture?.expectedOutcome ?? {};
      expect(transaction).toMatchObject(expectedOutcome);
      expect(transaction.confidence).toBeGreaterThanOrEqual(
        Math.min(confidence ?? 0.9, 0.9)
      );
      expect(transaction.patternId).not.toBe("unsupported");
      expect(patternId).toBeTruthy();
    }
  });

  it("does not create suggestions for payment references or negative fixtures", () => {
    const nonTransactional = LOCAL_SMS_FIXTURE_CORPUS.filter(
      (fixture) => !fixture.isFinancialTransaction
    );
    const result = parseSmsWithLocalParser({
      candidates: nonTransactional.map((fixture) => ({
        messageId: fixture.id,
        sender: fixture.sender,
        body: fixture.body,
        receivedAtMs: fixture.receivedAtMs,
        smsFingerprint: `fixture-fingerprint-${fixture.id}`,
      })),
      categories,
      supportedCurrencies: ["EGP", "USD"],
    });

    expect(result.transactions).toEqual([]);
    expect(result.unsupportedCount).toBe(nonTransactional.length);
  });
});
