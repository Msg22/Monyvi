/**
 * #395 T014-P independent B1–B4 behavioral regressions.
 * Four positive baselines precede four targeted failures from Root's actual
 * source-grounded reproductions. No production modules or schema are mocked.
 */
import {
  accountReviewSessionSchema,
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import { NORMALIZATION_IDS } from "./normalization-fixtures";
import {
  makeCrossMessageSenderAliasAttack,
  makeDistinctVoiceCounterpartyInput,
  makeOmittedCurrencySmsInput,
  makeOwnedCandidateSmsInput,
  makeTwoSmsGroundedControl,
} from "./normalization-safety-fixtures";
import { REVIEW_WIRE_IDS } from "./fixtures";

async function canonical(
  input: Parameters<typeof normalizeAccountReviewParserResult>[0]
): Promise<AccountReviewSession> {
  const session = await normalizeAccountReviewParserResult(input);
  return accountReviewSessionSchema.parse(session);
}

function requireSmsRow(
  session: AccountReviewSession,
  fingerprint: string
): Extract<AccountReviewRow, { source: "SMS" }> {
  const row = session.rows.find((item) => item.sourceFingerprint === fingerprint);
  if (!row || row.source !== "SMS") throw new Error("Missing original SMS row");
  return row;
}

function requireVoiceRow(
  session: AccountReviewSession,
  counterparty: string
): Extract<AccountReviewRow, { source: "VOICE" }> {
  const row = session.rows.find(
    (item) => item.source === "VOICE" && item.transaction.counterparty === counterparty
  );
  if (!row || row.source !== "VOICE") throw new Error("Missing grounded Voice row");
  return row;
}

describe("#395 B1 — model alias must not authorize another SMS sender", () => {
  it("positive: two grounded QNB messages retain original fingerprint and reciprocal group", async () => {
    const input = makeTwoSmsGroundedControl();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await canonical(input);
    const first = requireSmsRow(session, NORMALIZATION_IDS.smsFingerprint);
    const second = requireSmsRow(session, NORMALIZATION_IDS.secondSmsFingerprint);
    expect(session.rows).toHaveLength(2);
    expect(first.transaction.rawSmsBody).toBe("QNB purchase EGP 50");
    expect(second.transaction.rawSmsBody).toBe("QNB purchase EGP 25");
    expect(session.groups).toHaveLength(1);
    expect(session.groups[0]?.linkedRowIds).toEqual(expect.arrayContaining([
      first.rowId, second.rowId,
    ]));
    expect(first.assignment.state).toBe("suggested");
  });

  it("B1: response-local alias equal to CIB messageId cannot borrow its sender for QNB", async () => {
    const input = makeCrossMessageSenderAliasAttack();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const responseA = input.providerResponse.transactions[0];
    const responseB = input.providerResponse.transactions[1];
    const submittedB = input.submittedMessages[0];
    const submittedA = input.submittedMessages[1];
    expect(input.providerResponse.transactions.map((row) => row.messageId)).toEqual([
      REVIEW_WIRE_IDS.smsMessageId, NORMALIZATION_IDS.secondSmsMessageId,
    ]);
    expect(input.submittedMessages.map((sms) => sms.id)).toEqual([
      NORMALIZATION_IDS.secondSmsMessageId, REVIEW_WIRE_IDS.smsMessageId,
    ]);
    expect(submittedB?.sender).toBe("CIB");
    expect(submittedA?.sender).toBe("QNB");
    expect(submittedB?.smsFingerprint).toBe(NORMALIZATION_IDS.secondSmsFingerprint);
    expect(submittedA?.smsFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(submittedB?.body).toBe("CIB purchase EGP 25");
    expect(submittedA?.body).toBe("QNB purchase EGP 50");
    expect(responseA?.transactionRef).toBe(submittedB?.id);
    expect(responseA?.messageId).toBe(submittedA?.id);
    expect(responseB?.messageId).toBe(submittedB?.id);
    expect(responseA?.accountEvidence.evidenceSpans[0]?.sourceRef).toBe(submittedA?.id);
    expect(responseB?.accountEvidence.evidenceSpans[0]?.sourceRef).toBe(submittedB?.id);
    const session = await canonical(input);
    const qnb = requireSmsRow(session, NORMALIZATION_IDS.smsFingerprint);
    const cib = requireSmsRow(session, NORMALIZATION_IDS.secondSmsFingerprint);
    expect(qnb.transaction.rawSmsBody).toBe("QNB purchase EGP 50");
    expect(cib.transaction.rawSmsBody).toBe("CIB purchase EGP 25");
    expect(qnb.transaction.amount).toBe(50);
    expect(cib.transaction.amount).toBe(25);
    expect(qnb.accountEvidence.name).toBe("QNB");
    expect(qnb.assignment.state).toBe("unresolved");
    expect(qnb.selected).toBe(false);
    expect(session.groups.some((group) => group.linkedRowIds.includes(qnb.rowId)))
      .toBe(false);
  });
});

describe("#395 B2 — omission cannot change a non-null financial currency", () => {
  it("positive: truly null v2 financial currency with proven omission uses captured EGP", async () => {
    const input = makeOmittedCurrencySmsInput(null);
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const row = requireSmsRow(await canonical(input), NORMALIZATION_IDS.smsFingerprint);
    expect(row.currency).toEqual({
      state: "known", code: "EGP", origin: "preferred_omission",
    });
    expect(row.transaction.currency).toBe("EGP");
    expect(row.transaction.amount).toBe(50);
    expect(row.assignment.state).toBe("unresolved");
  });

  it("B2: valid USD financial row + omitted advisory cannot become known EGP", async () => {
    const input = makeOmittedCurrencySmsInput("USD");
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await canonical(input);
    const row = requireSmsRow(session, NORMALIZATION_IDS.smsFingerprint);
    expect(row.transaction.currency).toBe("USD");
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.currency.state).toBe("unconfirmed");
    expect(row.reviewReasons).toContain("currency_confirmation_needed");
    expect(row.assignment.state).toBe("unresolved");
    expect(row.selected).toBe(false);
    expect(session.groups).toEqual([]);
  });
});

describe("#395 B3 — owned candidate ID requires grounded name/provider compatibility", () => {
  it("positive: an explicitly grounded matching owned QNB BANK remains an advisory candidate", async () => {
    const input = makeOwnedCandidateSmsInput(true);
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const row = requireSmsRow(await canonical(input), NORMALIZATION_IDS.smsFingerprint);
    expect(row.accountEvidence.state).toBe("explicit");
    expect(row.accountEvidence.candidateAccountIds).toEqual([REVIEW_WIRE_IDS.bankAccountId]);
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(row.assignment.state).toBe("unresolved"); // T019 alone resolves account choices
  });

  it("B3: unrelated owned BANK ID must be removed or rejected, not exposed as compatible", async () => {
    const input = makeOwnedCandidateSmsInput(false);
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    expect(input.reviewAccountSnapshots.accounts[0]?.name).toBe("Unrelated bank");
    const session = await canonical(input);
    const row = requireSmsRow(session, NORMALIZATION_IDS.smsFingerprint);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.accountEvidence.candidateAccountIds).not.toContain(REVIEW_WIRE_IDS.bankAccountId);
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expect(row.assignment.state).toBe("unresolved");
    expect(row.selected).toBe(false);
    expect(session.groups).toEqual([]);
  });
});

describe("#395 B4 — distinct Voice financial rows keep their mapped counterparts", () => {
  it("positive: aligned Lunch and Coffee share amount but have distinct stable identities", async () => {
    const input = makeDistinctVoiceCounterpartyInput(false);
    expect(accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await canonical(input);
    expect(session.rows).toHaveLength(2);
    const lunch = requireVoiceRow(session, "Lunch");
    const coffee = requireVoiceRow(session, "Coffee");
    expect(lunch.transaction.note).toBe("Lunch at canteen");
    expect(coffee.transaction.note).toBe("Coffee break");
    expect(lunch.rowId).not.toBe(coffee.rowId);
    expect(lunch.transaction.amount).toBe(coffee.transaction.amount);
    expect(lunch.transaction.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(session.groups).toHaveLength(1);
  });

  it("B4: reverse mapped order never binds Lunch financial rowId to Coffee content", async () => {
    const alignedInput = makeDistinctVoiceCounterpartyInput(false);
    const reversedInput = makeDistinctVoiceCounterpartyInput(true);
    const aligned = await canonical(alignedInput);
    expect(accountReviewVoiceResponseV2Schema.safeParse(reversedInput.providerResponse).success)
      .toBe(true);
    expect(reversedInput.mappedTransactions[0]?.counterparty).toBe("Coffee");
    const reversed = await canonical(reversedInput);
    expect(reversed.rows).toHaveLength(2);
    const lunch = requireVoiceRow(reversed, "Lunch");
    const coffee = requireVoiceRow(reversed, "Coffee");
    expect(lunch.rowId).toBe(requireVoiceRow(aligned, "Lunch").rowId);
    expect(coffee.rowId).toBe(requireVoiceRow(aligned, "Coffee").rowId);
    expect(lunch.transaction.note).toBe("Lunch at canteen");
    expect(coffee.transaction.note).toBe("Coffee break");
    expect(lunch.transaction.amount).toBe(50);
    expect(coffee.transaction.amount).toBe(50);
    expect(lunch.selected).toBe(false);
    expect(coffee.selected).toBe(false);
  });
});

describe("#395 C1 — one financial record per submitted SMS remains the frozen policy", () => {
  it("rejects a second transaction with the same original message ID/fingerprint", async () => {
    const input = makeOmittedCurrencySmsInput(null);
    const first = input.providerResponse.transactions[0];
    const mapped = input.mappedTransactions[0];
    if (!first || !mapped) throw new Error("Missing C1 source");
    const duplicate = {
      ...first, transactionRef: "synthetic-sms-record-2",
    };
    const providerResponse = {
      ...input.providerResponse,
      transactions: [first, duplicate],
    };
    expect(accountReviewSmsResponseV2Schema.safeParse(providerResponse).success)
      .toBe(true);
    await expect(normalizeAccountReviewParserResult({
      ...input, financialRows: providerResponse.transactions,
      mappedTransactions: [mapped, { ...mapped }],
      providerResponse,
    })).rejects.toThrow("account_review_sms_message_not_submitted");
  });
});
