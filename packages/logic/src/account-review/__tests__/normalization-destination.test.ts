/**
 * #395 I1 — ATM destination evidence is distinct from account choice.
 * Tests the production normalizer against canonical v2 SMS provenance;
 * no mocks, copied provider DTOs, store, platform or remote requests.
 */
import {
  accountReviewSessionSchema,
  accountReviewSmsResponseV2Schema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { normalizeAccountReviewParserResult } from "../normalization";
import {
  makeGroundedAtmSms, makeUnmatchedAtmSms, makeUncertainAtmSms,
  makeAbsentAtmSms, makeAtmV1Input, makeAtmWithAmbiguousCurrency,
  makeAtmWithLegacyDestinationId, makeInvalidAtmDestination,
  makeNullHintAtmDestination, replaceAtmDestination, REVIEW_ATM_BODY,
  type InvalidDestinationKind,
} from "./normalization-destination-fixtures";
import {
  makeVoiceInput, makeSmsInput, NORMALIZATION_IDS,
} from "./normalization-fixtures";
import { REVIEW_WIRE_IDS } from "./fixtures";

async function canonical(
  input: Parameters<typeof normalizeAccountReviewParserResult>[0]
): Promise<AccountReviewSession> {
  return accountReviewSessionSchema.parse(
    await normalizeAccountReviewParserResult(input)
  );
}

function requireAtmRow(session: AccountReviewSession): Extract<AccountReviewRow, {
  source: "SMS"
}> {
  expect(session.rows).toHaveLength(1);
  const row = session.rows[0];
  if (!row || row.source !== "SMS") throw new Error("Missing original ATM SMS row");
  expect(row.transaction.isAtmWithdrawal).toBe(true);
  return row;
}

function expectUntouchedAtmFinance(row: Extract<AccountReviewRow, {
  source: "SMS"
}>): void {
  expect(row.sourceFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
  expect(row.transaction.smsFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
  expect(row.transaction.rawSmsBody).toBe(REVIEW_ATM_BODY);
  expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
  expect(row.transaction.amount).toBe(50);
  expect(row.amountDecimal).toBe("50");
  expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
}

function expectBankSourcePreserved(
  row: Extract<AccountReviewRow, { source: "SMS" }>,
  session: AccountReviewSession
): void {
  expect(row.accountEvidence.state).toBe("explicit");
  expect(row.accountEvidence.name).toBe("QNB");
  expect(row.accountEvidence.type).toBe("BANK");
  expect(row.accountEvidence.evidenceSpans[0]).toEqual(expect.objectContaining({
    sourceRef: REVIEW_WIRE_IDS.smsMessageId,
    field: "body", text: "QNB",
  }));
  expect(row.accountEvidence.evidenceSpans[1]).toEqual(expect.objectContaining({
    sourceRef: REVIEW_WIRE_IDS.smsMessageId,
    field: "sender", text: "QNB",
  }));
  expect(row.assignment.state).toBe("suggested");
  expect(session.groups).toHaveLength(1);
  expect(session.groups[0]?.linkedRowIds).toContain(row.rowId);
  expect(row.selected).toBe(false);
}

describe("#395 I1 — grounded ATM destination producer positive controls", () => {
  it("preserves valid Cash destination proof, known source currency and original BANK finance", async () => {
    const input = makeGroundedAtmSms();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const source = input.providerResponse.transactions[0];
    const submitted = input.submittedMessages[0];
    if (!source || !submitted) throw new Error("Missing ATM source");
    expect(submitted.body).toBe(REVIEW_ATM_BODY);
    expect(submitted.sender).toBe("QNB");
    expect(submitted.smsFingerprint).toBe(NORMALIZATION_IDS.smsFingerprint);
    expect(source.messageId).toBe(submitted.id);
    expect(source.accountEvidence.evidenceSpans.map((span) => span.field))
      .toEqual(["body", "sender"]);
    expect(source.toAccountEvidence?.evidenceSpans[0]?.sourceRef).toBe(submitted.id);
    expect(source.toAccountEvidence?.evidenceSpans[0]?.text).toBe("Cash");

    const session = await canonical(input);
    const row = requireAtmRow(session);
    expectUntouchedAtmFinance(row);
    expectBankSourcePreserved(row, session);
    expect(row).toHaveProperty("toAccountEvidence", source.toAccountEvidence);
    expect(row.toAssignment).toBeNull();
    expect(row.reviewReasons).toContain("cash_transfer_review");
    expect(row.selected).toBe(false);
    expect(input.reviewAccountSnapshots.accounts.some((account) =>
      account.id === REVIEW_WIRE_IDS.cashAccountId && account.isDefault
    )).toBe(true);
  });

  it("keeps explicit unmatched Office Cash proof, not absence or a Cash default", async () => {
    const input = makeUnmatchedAtmSms();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const row = requireAtmRow(await canonical(input));
    expect(row.transaction.amount).toBe(50);
    expect(row.accountEvidence.state).toBe("explicit");
    expect(row).toHaveProperty("toAccountEvidence", expect.objectContaining({
      state: "explicit", name: "Office Cash", type: "CASH",
      candidateAccountIds: [],
      evidenceSpans: [expect.objectContaining({
        sourceRef: REVIEW_WIRE_IDS.smsMessageId, field: "body",
        text: "Office Cash",
      })],
    }));
    expect(row.toAssignment).toBeNull();
    expect(row.reviewReasons).toContain("cash_transfer_review");
    expect(row.selected).toBe(false);
  });

  it("keeps uncertain Cash proof distinct from no evidence without choosing default", async () => {
    const input = makeUncertainAtmSms();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const row = requireAtmRow(await canonical(input));
    expect(row.accountEvidence.state).toBe("explicit");
    expect(row).toHaveProperty("toAccountEvidence", expect.objectContaining({
      state: "uncertain", name: "Cash", type: "CASH",
      candidateAccountIds: [],
    }));
    expect(row.toAssignment).toBeNull();
    expect(row.reviewReasons).toContain("cash_transfer_review");
    expect(row.selected).toBe(false);
  });

  it("keeps an ATM destination proof inert when review currency is unconfirmed", async () => {
    const input = makeAtmWithAmbiguousCurrency();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const row = requireAtmRow(await canonical(input));
    expect(row.currency.state).toBe("unconfirmed");
    expect(row.reviewReasons).toContain("currency_confirmation_needed");
    expect(row).toHaveProperty("toAccountEvidence", expect.objectContaining({
      state: "explicit", name: "Cash", type: "CASH",
    }));
    expect(row.toAssignment).toBeNull();
    expect(row.selected).toBe(false);
    expect(row.transaction.amount).toBe(50);
  });
});

describe("#395 I1 — absence and old-source compatibility", () => {
  it("preserves explicit null and canonical absent as different inputs", async () => {
    const missing = replaceAtmDestination(makeGroundedAtmSms(), null);
    const absent = makeAbsentAtmSms();
    expect(accountReviewSmsResponseV2Schema.safeParse(missing.providerResponse).success)
      .toBe(true);
    expect(accountReviewSmsResponseV2Schema.safeParse(absent.providerResponse).success)
      .toBe(true);
    const noProof = requireAtmRow(await canonical(missing));
    const explicitlyAbsent = requireAtmRow(await canonical(absent));
    expect(noProof).toHaveProperty("toAccountEvidence", null);
    expect(explicitlyAbsent).toHaveProperty("toAccountEvidence", expect.objectContaining({
      state: "absent", name: null, type: null,
      candidateAccountIds: [], evidenceSpans: [],
    }));
    expect(noProof.toAssignment).toBeNull();
    expect(explicitlyAbsent.toAssignment).toBeNull();
  });

  it("does not use legacy transaction.toAccountId as destination provenance", async () => {
    const input = makeAtmWithLegacyDestinationId();
    const row = requireAtmRow(await canonical(input));
    expect(row.transaction.toAccountId).toBe(REVIEW_WIRE_IDS.cashAccountId);
    expect(row).toHaveProperty("toAccountEvidence", null);
    expect(row.toAssignment).toBeNull();
    expect(row.selected).toBe(false);
  });

  it("keeps old-server ATM finance and unconfirmed currency without destination proof", async () => {
    const session = await canonical(makeAtmV1Input());
    const row = requireAtmRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(NORMALIZATION_IDS.shoppingCategory);
    expect(row.currency.state).toBe("unconfirmed");
    expect(row).toHaveProperty("toAccountEvidence", null);
    expect(row.toAssignment).toBeNull();
    expect(row.assignment.state).toBe("unresolved");
  });

  it("materializes null destination proof for ordinary Voice and non-ATM SMS", async () => {
    const voice = await canonical(makeVoiceInput());
    const sms = await canonical(makeSmsInput());
    expect(voice.rows).toHaveLength(1);
    expect(sms.rows).toHaveLength(1);
    expect(voice.rows[0]).toHaveProperty("toAccountEvidence", null);
    expect(sms.rows[0]).toHaveProperty("toAccountEvidence", null);
    expect(voice.rows[0]?.toAssignment).toBeNull();
    expect(sms.rows[0]?.toAssignment).toBeNull();
  });
});

const invalidDestinations: readonly {
  readonly caseName: string;
  readonly kind: InvalidDestinationKind;
}[] = [
  { caseName: "foreign candidate", kind: "foreign" },
  { caseName: "wrong destination currency", kind: "wrong_currency" },
  { caseName: "non-Cash destination type", kind: "wrong_type" },
  { caseName: "conflicting card suffix", kind: "wrong_card" },
  { caseName: "conflicting provider", kind: "wrong_provider" },
  { caseName: "forged SMS body substring", kind: "wrong_body" },
  { caseName: "another message's Cash evidence", kind: "cross_message" },
];

describe("#395 I1 — invalid ATM destination evidence cannot contaminate valid BANK source", () => {
  it.each(invalidDestinations)(
    "sanitizes $caseName, retains original BANK source and hard financial review",
    async ({ kind }) => {
      const input = makeInvalidAtmDestination(kind);
      const original = input.providerResponse.transactions[0];
      if (!original) throw new Error("Missing invalid-provenance ATM input");
      expect(input.financialRows).toHaveLength(1);
      expect(input.mappedTransactions).toHaveLength(1);
      expect(input.financialRows[0]?.messageId).toBe(REVIEW_WIRE_IDS.smsMessageId);
      expect(input.mappedTransactions[0]?.smsFingerprint)
        .toBe(NORMALIZATION_IDS.smsFingerprint);
      expect(original.accountEvidence.evidenceSpans[0]?.sourceRef)
        .toBe(REVIEW_WIRE_IDS.smsMessageId);
      if (kind === "cross_message") {
        expect(input.submittedMessages).toHaveLength(2);
        expect(original.toAccountEvidence?.evidenceSpans[0]?.sourceRef)
          .toBe(NORMALIZATION_IDS.secondSmsMessageId);
        expect(input.submittedMessages[1]?.sender).toBe("CIB");
        expect(input.submittedMessages[1]?.smsFingerprint)
          .toBe(NORMALIZATION_IDS.secondSmsFingerprint);
        expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
          .toBe(false);
      }
      const session = await canonical(input);
      const row = requireAtmRow(session);
      expectUntouchedAtmFinance(row);
      expectBankSourcePreserved(row, session);
      expect(row).toHaveProperty("toAccountEvidence", expect.objectContaining({
        state: "uncertain",
        candidateAccountIds: [],
        evidenceSpans: [],
      }));
      expect(row.reviewReasons).toContain("account_evidence_invalid");
      expect(row.reviewReasons).toContain("cash_transfer_review");
      expect(row.toAssignment).toBeNull();
      expect(row.selected).toBe(false);
    }
  );
});

describe("#395 F-R2 — ATM Cash-only destination candidate role", () => {
  it("positive: explicit null-type Cash evidence with zero candidates remains inert", async () => {
    const input = makeNullHintAtmDestination(false);
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const destination = input.providerResponse.transactions[0]?.toAccountEvidence;
    expect(destination).toMatchObject({
      state: "explicit", name: "Cash", type: null, candidateAccountIds: [],
    });
    const session = await canonical(input);
    const row = requireAtmRow(session);
    expectUntouchedAtmFinance(row);
    expectBankSourcePreserved(row, session);
    expect(row).toHaveProperty("toAccountEvidence", destination);
    expect(row.reviewReasons).not.toContain("account_evidence_invalid");
    expect(row.reviewReasons).toContain("cash_transfer_review");
    expect(row.toAssignment).toBeNull();
    expect(row.selected).toBe(false);
  });

  it("rejects real owned BANK QNB as a Cash endpoint despite null type hint", async () => {
    const input = makeNullHintAtmDestination(true);
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const destination = input.providerResponse.transactions[0]?.toAccountEvidence;
    expect(destination).toMatchObject({
      state: "explicit", name: "QNB", type: null,
      providerDisplayName: "QNB",
      candidateAccountIds: [REVIEW_WIRE_IDS.bankAccountId],
    });
    expect(destination?.evidenceSpans.map((span) => span.field))
      .toEqual(["body", "sender"]);
    expect(destination?.evidenceSpans.every(
      (span) => span.sourceRef === REVIEW_WIRE_IDS.smsMessageId
    )).toBe(true);
    expect(input.reviewAccountSnapshots.accounts.find(
      (account) => account.id === REVIEW_WIRE_IDS.bankAccountId
    )).toMatchObject({
      name: "QNB", providerDisplayName: "QNB",
      type: "BANK", currency: "EGP", senderNames: ["QNB"],
    });
    const session = await canonical(input);
    const row = requireAtmRow(session);
    expectUntouchedAtmFinance(row);
    expectBankSourcePreserved(row, session);
    expect(row).toHaveProperty("toAccountEvidence", expect.objectContaining({
      state: "uncertain", candidateAccountIds: [], evidenceSpans: [],
    }));
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expect(row.reviewReasons).toContain("cash_transfer_review");
    expect(row.toAssignment).toBeNull();
    expect(row.selected).toBe(false);
  });
});
