/**
 * #395 P2-02 tests FIRST: a present invalid v2 discriminator is malformed
 * advisory; only a truly absent discriminator is legacy. Real pure SUT.
 */
import {
  accountReviewSessionSchema,
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import type { AccountReviewNormalizationInput } from "../normalization-types";
import {
  makeSmsInput,
  makeVoiceInput,
  NORMALIZATION_IDS,
} from "./normalization-fixtures";
import { REVIEW_SMS_BODY, REVIEW_WIRE_IDS } from "./fixtures";
import {
  INVALID_VERSION_CASES,
  makeTaggedInvalidSms,
  makeTaggedInvalidVoice,
  makeUntaggedSms,
  makeUntaggedVoice,
} from "./normalization-version-fixtures";

async function canonical(
  input: AccountReviewNormalizationInput
): Promise<AccountReviewSession> {
  return accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult(input)
  );
}

function onlyRow(session: AccountReviewSession): AccountReviewRow {
  expect(session.rows).toHaveLength(1);
  const row = session.rows[0];
  if (!row) throw new Error("Missing financial row");
  return row;
}

function expectConservative(
  session: AccountReviewSession,
  hardInvalid: boolean
): void {
  const row = onlyRow(session);
  expect(row.accountEvidence.state).toBe("uncertain");
  expect(row.accountEvidence.candidateAccountIds).toEqual([]);
  expect(row.currency).toMatchObject({
    state: "unconfirmed",
    reason: "legacy_unknown",
  });
  expect(row.reviewReasons).toContain("currency_confirmation_needed");
  if (hardInvalid) {
    expect(row.reviewReasons).toContain("account_evidence_invalid");
  } else {
    expect(row.reviewReasons).not.toContain("account_evidence_invalid");
  }
  if (row.assignment.state !== "unresolved") {
    throw new Error("Malformed or legacy advisory cannot assign accounts");
  }
  expect(row.assignment.accountId).toBeNull();
  expect(row.toAccountEvidence).toBeNull();
  expect(row.toAssignment).toBeNull();
  expect(row.selected).toBe(false);
  expect(session.saveIntent).toBeNull();
  expect(session.groups).toEqual([]);
}

describe("#395 P2-02 — present-invalid Voice review discriminator is hard invalid", () => {
  it.each(INVALID_VERSION_CASES)(
    "preserves source Voice finance but marks $name invalid, not legacy",
    async ({ version }) => {
      const input = makeTaggedInvalidVoice(version);
      expect(
        Object.prototype.hasOwnProperty.call(
          input.providerResponse,
          "reviewContractVersion"
        )
      ).toBe(true);
      expect(
        accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse)
          .success
      ).toBe(false);
      expect(input.financialRows).toHaveLength(1);
      const session = await canonical(input);
      expect(session.source).toBe("VOICE");
      expect(session.ownerId).toBe(input.ownerId);
      expect(session.sessionId).toBe(input.sessionId);
      const row = onlyRow(session);
      expect(row.transaction.amount).toBe(50);
      expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
      expect(row.transaction.date).toEqual(input.mappedTransactions[0]?.date);
      expect(row.transaction.counterparty).toBe("Lunch");
      expect(row.sourceRef).toBe(input.requestKey);
      expectConservative(session, true);
    }
  );
});

describe("#395 P2-02 — present-invalid SMS review discriminator is hard invalid", () => {
  it.each(INVALID_VERSION_CASES)(
    "retains original SMS identity but marks $name invalid, not legacy",
    async ({ version }) => {
      const input = makeTaggedInvalidSms(version);
      expect(
        Object.prototype.hasOwnProperty.call(
          input.providerResponse,
          "reviewContractVersion"
        )
      ).toBe(true);
      expect(
        accountReviewSmsResponseV2Schema.safeParse(input.providerResponse)
          .success
      ).toBe(false);
      expect(input.financialRows).toHaveLength(1);
      const session = await canonical(input);
      expect(session.source).toBe("SMS");
      expect(session.ownerId).toBe(input.ownerId);
      const row = onlyRow(session);
      if (row.source !== "SMS") throw new Error("Missing original SMS row");
      expect(row.transaction.amount).toBe(50);
      expect(row.transaction.categoryId).toBe(
        NORMALIZATION_IDS.shoppingCategory
      );
      expect(row.transaction.currency).toBe("EGP");
      expect(row.transaction.rawSmsBody).toBe(REVIEW_SMS_BODY);
      expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
      expect(row.sourceRef).toBe(REVIEW_WIRE_IDS.smsMessageId);
      expectConservative(session, true);
    }
  );
});

describe("#395 P2-02 — truly untagged legacy and valid v2 stay distinct", () => {
  it("preserves financially valid untagged Voice as conservative legacy", async () => {
    const input = makeUntaggedVoice();
    expect(
      Object.prototype.hasOwnProperty.call(
        input.providerResponse,
        "reviewContractVersion"
      )
    ).toBe(false);
    const session = await canonical(input);
    expect(session.source).toBe("VOICE");
    expect(onlyRow(session).transaction.amount).toBe(50);
    expect(onlyRow(session).transaction.categoryId).toBe(
      NORMALIZATION_IDS.foodCategory
    );
    expectConservative(session, false);
  });

  it("preserves untagged SMS finance and fingerprint as conservative legacy", async () => {
    const input = makeUntaggedSms();
    expect(
      Object.prototype.hasOwnProperty.call(
        input.providerResponse,
        "reviewContractVersion"
      )
    ).toBe(false);
    const session = await canonical(input);
    expect(session.source).toBe("SMS");
    const row = onlyRow(session);
    if (row.source !== "SMS") throw new Error("Missing original SMS row");
    expect(row.transaction.amount).toBe(50);
    expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expectConservative(session, false);
  });

  it("keeps fully canonical Voice v2 source proof and known EGP", async () => {
    const input = makeVoiceInput();
    expect(
      accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse)
        .success
    ).toBe(true);
    const session = await canonical(input);
    expect(session.rows).toHaveLength(1);
    const row = onlyRow(session);
    expect(row.accountEvidence.state).toBe("explicit");
    expect(row.currency).toEqual({
      state: "known",
      code: "EGP",
      origin: "explicit",
    });
    expect(row.reviewReasons).not.toContain("account_evidence_invalid");
    expect(row.assignment.state).toBe("suggested");
    expect(row.selected).toBe(false);
    expect(session.groups).toHaveLength(1);
    expect(session.groups[0]?.status).toBe("pending");
  });

  it("keeps canonical SMS v2 account, currency and original fingerprint", async () => {
    const input = makeSmsInput();
    expect(
      accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success
    ).toBe(true);
    const session = await canonical(input);
    const row = onlyRow(session);
    if (row.source !== "SMS") throw new Error("Missing original SMS row");
    expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(row.accountEvidence.state).toBe("explicit");
    expect(row.currency).toEqual({
      state: "known",
      code: "EGP",
      origin: "explicit",
    });
    expect(row.reviewReasons).not.toContain("account_evidence_invalid");
    expect(row.assignment.state).toBe("suggested");
    expect(row.selected).toBe(false);
    expect(session.groups).toHaveLength(1);
    expect(session.groups[0]?.status).toBe("pending");
  });

  it("retains the strict v2-only SMS missing-destination recovery guard", async () => {
    const input = makeSmsInput();
    const first = input.providerResponse.transactions[0];
    if (!first) throw new Error("Missing source SMS row");
    const { toAccountEvidence, ...withoutRequiredDestination } = first;
    expect(toAccountEvidence).toBeNull();
    const raw = {
      ...input.providerResponse,
      transactions: [withoutRequiredDestination],
    };
    expect(accountReviewSmsResponseV2Schema.safeParse(raw).success).toBe(false);
    const session = await canonical({ ...input, providerResponse: raw });
    const row = onlyRow(session);
    if (row.source !== "SMS") throw new Error("Missing source SMS row");
    expect(row.transaction.amount).toBe(50);
    expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expect(row.selected).toBe(false);
    expect(session.saveIntent).toBeNull();
  });
});
