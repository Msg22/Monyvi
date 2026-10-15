/**
 * #395 I1 tests-first Red: canonical *local* destination proof, separate from
 * choice/toAssignment. The provider schema, normalizer and resolver are not SUTs.
 * Only z.input fixtures are used until the schema's new output field exists.
 */
import {
  accountReviewAccountEvidenceSchema,
  accountReviewRowSchema,
  accountReviewSessionSchema,
} from "../schemas";
import {
  I1, absentDestination, atmRow, existingAccount, explicitDestination,
  session, smsRow, uncertainDestination, unresolved, voiceRow,
  type LocalRowInput,
} from "./destination-evidence-schema-fixtures";
import { REVIEW_WIRE_IDS } from "./fixtures";

function parseRow(input: unknown) {
  const result = accountReviewRowSchema.safeParse(input);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("Synthetic local review row rejected");
  return result.data;
}

function expectProofError(input: unknown): void {
  const result = accountReviewRowSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected rejected destination proof");
  expect(result.error.issues.some((issue) =>
    issue.path[0] === "toAccountEvidence"
  )).toBe(true);
}

function unchangedRow(input: LocalRowInput, output: ReturnType<typeof parseRow>): void {
  expect(output.rowId).toBe(input.rowId);
  expect(output.transaction).toEqual(input.transaction);
  expect(output.amountDecimal).toBe(input.amountDecimal);
  expect(output.accountEvidence).toEqual(input.accountEvidence);
  expect(output.currency).toEqual(input.currency);
  expect(output.assignment).toEqual(input.assignment);
  expect(output.toAssignment).toEqual(input.toAssignment);
  expect(output.reviewReasons).toEqual(input.reviewReasons);
  expect(output.selected).toBe(input.selected);
  expect(output.revision).toBe(input.revision);
  expect(output.hasUserAccountOverride).toBe(input.hasUserAccountOverride);
  expect(output.hasUserCurrencyOverride).toBe(input.hasUserCurrencyOverride);
}

describe("#395 I1 — backwards-compatible local row/session proof", () => {
  it.each(["VOICE", "SMS", "ATM"] as const)(
    "defaults omitted legacy %s destination proof to an actual null output",
    (source) => {
      const old = source === "VOICE" ? voiceRow() :
        source === "SMS" ? smsRow() : atmRow();
      const original = structuredClone(old);
      const parsed = parseRow(old);
      expect(parsed).toHaveProperty("toAccountEvidence", null);
      expect(old).toEqual(original);
      expect(old).not.toHaveProperty("toAccountEvidence");
      unchangedRow(old, parsed);
    }
  );

  it.each(["VOICE", "SMS", "ATM"] as const)(
    "materializes explicitly null %s proof without a transfer decision",
    (source) => {
      const old = source === "VOICE" ? voiceRow() :
        source === "SMS" ? smsRow() : atmRow();
      const parsed = parseRow({ ...old, toAccountEvidence: null });
      expect(parsed).toHaveProperty("toAccountEvidence", null);
      expect(parsed.toAssignment).toBeNull();
      unchangedRow(old, parsed);
    }
  );

  it("defaults omitted destination proof on a complete existing session", () => {
    const old = session(voiceRow());
    const parsed = accountReviewSessionSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Legacy session unexpectedly rejected");
    expect(parsed.data.rows).toHaveLength(1);
    expect(parsed.data.rows[0]).toHaveProperty("toAccountEvidence", null);
    expect(parsed.data).toMatchObject({
      ownerId: REVIEW_WIRE_IDS.ownerId, sessionId: I1.sessionId,
      revision: "0", operationGeneration: "0", saveIntent: null,
    });
    expect(parsed.data.rows[0]?.transaction).toEqual(old.rows[0]?.transaction);
  });

  it("preserves explicit nullable ATM proof through complete session parsing", () => {
    const destination = explicitDestination();
    const row = atmRow();
    const parsed = accountReviewSessionSchema.safeParse(
      session({ ...row, toAccountEvidence: destination })
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Explicit ATM session unexpectedly rejected");
    expect(parsed.data.rows[0]).toHaveProperty("toAccountEvidence", destination);
    expect(parsed.data.rows[0]?.toAssignment).toBeNull();
    expect(parsed.data.rows[0]?.source).toBe("SMS");
    expect(parsed.data.groups).toEqual([]);
    expect(parsed.data.saveIntent).toBeNull();
  });

  it("rejects malformed non-null proof rather than replacing it with null", () => {
    expectProofError({ ...atmRow(), toAccountEvidence: { state: "explicit" } });
  });

  it("rejects an explicit proof without required grounded spans", () => {
    expectProofError({
      ...atmRow(),
      toAccountEvidence: { ...explicitDestination(), evidenceSpans: [] },
    });
  });

  it("keeps proof out of the unchanged parsed financial transaction snapshot", () => {
    const destination = explicitDestination();
    const parsed = parseRow({ ...atmRow(), toAccountEvidence: destination });
    expect(parsed).toHaveProperty("toAccountEvidence", destination);
    expect(parsed.transaction).not.toHaveProperty("toAccountEvidence");
    expect(parsed.transaction).not.toHaveProperty("destinationEvidence");
  });
});

describe("#395 I1 — ordinary Voice/SMS never creates destination proof", () => {
  it.each([
    ["VOICE", voiceRow],
    ["ordinary SMS", smsRow],
  ] as const)("rejects non-null evidence for %s with a proof-specific issue", (_source, build) => {
    expectProofError({
      ...build(), toAccountEvidence: explicitDestination(),
      toAssignment: null,
    });
  });

  it("rejects contextual Voice proof even when its reference uses a valid Voice row", () => {
    const source = voiceRow();
    const contextual = {
      ...explicitDestination(), state: "contextual",
    };
    expectProofError({ ...source, toAccountEvidence: contextual });
  });

  it("preserves the ordinary-row ban on non-null destination assignment", () => {
    const destination = existingAccount(REVIEW_WIRE_IDS.cashAccountId);
    expect(accountReviewRowSchema.safeParse({
      ...voiceRow(), toAccountEvidence: null, toAssignment: destination,
    }).success).toBe(false);
    expect(accountReviewRowSchema.safeParse({
      ...smsRow(), toAccountEvidence: null, toAssignment: destination,
    }).success).toBe(false);
  });

  it("does not fabricate a destination on an ordinary SMS review transaction", () => {
    const parsed = parseRow(smsRow());
    expect(parsed.transaction).toMatchObject({
      source: "SMS", type: "EXPENSE", isAtmWithdrawal: false,
    });
    expect(parsed).toHaveProperty("toAccountEvidence", null);
    expect(parsed.toAssignment).toBeNull();
  });
});

describe("#395 I1 — ATM preserves distinct explicit/absent/uncertain proof", () => {
  it("accepts grounded explicit Cash identity and the canonical candidate ID", () => {
    const destination = explicitDestination(
      I1.body, "Cash", [REVIEW_WIRE_IDS.cashAccountId]
    );
    expect(accountReviewAccountEvidenceSchema.safeParse(destination).success).toBe(true);
    const input = atmRow();
    const parsed = parseRow({ ...input, toAccountEvidence: destination });
    expect(parsed).toHaveProperty("toAccountEvidence", destination);
    expect(parsed.toAssignment).toBeNull();
    expect(parsed.assignment).toEqual(input.assignment);
    expect(parsed.accountEvidence.type).toBe("BANK");
    expect(parsed.sourceFingerprint).toBe(I1.smsFingerprint);
    expect(parsed.transaction.amount).toBe(50);
  });

  it("preserves explicit but unmatched named Cash instead of treating it as omitted", () => {
    const destination = explicitDestination(I1.unmatchedBody, "Vault Cash");
    const parsed = parseRow({
      ...atmRow(I1.unmatchedBody), toAccountEvidence: destination,
    });
    expect(parsed).toHaveProperty("toAccountEvidence", destination);
    expect(parsed).not.toHaveProperty("toAccountEvidence", null);
    expect(parsed.toAssignment).toBeNull();
    expect(parsed.selected).toBe(false);
  });

  it("preserves canonical absence as a distinct object from null legacy absence", () => {
    const destination = absentDestination();
    const parsed = parseRow({ ...atmRow(), toAccountEvidence: destination });
    expect(parsed).toHaveProperty("toAccountEvidence", destination);
    expect(parsed).not.toHaveProperty("toAccountEvidence", null);
    expect(parsed.toAssignment).toBeNull();
  });

  it("keeps uncertain destination proof and the hard review reason", () => {
    const destination = uncertainDestination();
    const input = atmRow();
    const parsed = parseRow({
      ...input, toAccountEvidence: destination,
      reviewReasons: ["cash_transfer_review", "account_evidence_invalid"],
    });
    expect(parsed).toHaveProperty("toAccountEvidence", destination);
    expect(parsed.reviewReasons).toContain("account_evidence_invalid");
    expect(parsed.reviewReasons).toContain("cash_transfer_review");
    expect(parsed.toAssignment).toBeNull();
    expect(parsed.selected).toBe(false);
  });

  it("rejects contextual ATM evidence rather than accepting Voice-only provenance", () => {
    const contextual = { ...explicitDestination(), state: "contextual" };
    expect(accountReviewAccountEvidenceSchema.safeParse(contextual).success).toBe(true);
    expectProofError({ ...atmRow(), toAccountEvidence: contextual });
  });

  it("never lets valid destination proof bypass invalid source account evidence", () => {
    const input = atmRow();
    const brokenSource = {
      ...input.accountEvidence,
      state: "explicit",
      evidenceSpans: [],
    };
    expect(accountReviewRowSchema.safeParse({
      ...input, accountEvidence: brokenSource,
      toAccountEvidence: explicitDestination(),
    }).success).toBe(false);
  });

  it("keeps an explicit destination proof separate from unresolved account choice", () => {
    const destination = explicitDestination();
    const parsed = parseRow({
      ...atmRow(), toAccountEvidence: destination,
      toAssignment: unresolved(),
    });
    expect(parsed).toHaveProperty("toAccountEvidence", destination);
    expect(parsed.toAssignment?.state).toBe("unresolved");
    expect(parsed.transaction).not.toHaveProperty("toAccountEvidence");
  });

  it("never converts a legacy toAccountId into a validated destination assignment", () => {
    const input = atmRow();
    if (input.source !== "SMS") throw new Error("Expected ATM SMS fixture");
    const parsed = parseRow({
      ...input,
      transaction: {
        ...input.transaction, toAccountId: REVIEW_WIRE_IDS.cashAccountId,
      },
      toAccountEvidence: uncertainDestination(),
      toAssignment: null,
    });
    expect(parsed.toAssignment).toBeNull();
    expect(parsed).toHaveProperty("toAccountEvidence", uncertainDestination());
    expect(parsed.transaction).toHaveProperty(
      "toAccountId", REVIEW_WIRE_IDS.cashAccountId
    );
  });
});

describe("#395 I1 — existing currency, source/destination and immutability invariants", () => {
  it("retains an independently chosen distinct EGP Cash ATM destination", () => {
    const parsed = parseRow({
      ...atmRow(), toAccountEvidence: explicitDestination(),
      toAssignment: existingAccount(REVIEW_WIRE_IDS.cashAccountId),
    });
    expect(parsed).toHaveProperty("toAccountEvidence", explicitDestination());
    expect(parsed.toAssignment).toMatchObject({
      state: "existing", accountId: REVIEW_WIRE_IDS.cashAccountId,
      currency: "EGP",
    });
  });

  it("rejects an ATM destination with different accepted currency", () => {
    expect(accountReviewRowSchema.safeParse({
      ...atmRow(), toAccountEvidence: explicitDestination(),
      toAssignment: existingAccount(REVIEW_WIRE_IDS.cashAccountId, "USD"),
    }).success).toBe(false);
  });

  it("rejects an ATM destination equal to its existing source account", () => {
    expect(accountReviewRowSchema.safeParse({
      ...atmRow(), toAccountEvidence: explicitDestination(),
      toAssignment: existingAccount(REVIEW_WIRE_IDS.bankAccountId),
    }).success).toBe(false);
  });

  it("retains uncertain destination proof with unresolved currency but no choice", () => {
    const input = atmRow();
    const parsed = parseRow({
      ...input, toAccountEvidence: uncertainDestination(),
      currency: {
        state: "unconfirmed", reason: "ambiguous",
        candidateCodes: ["EGP", "USD"], statedCode: null, evidenceSpans: [],
      },
      assignment: unresolved(), toAssignment: null,
      reviewReasons: ["cash_transfer_review", "currency_confirmation_needed"],
    });
    expect(parsed).toHaveProperty("toAccountEvidence", uncertainDestination());
    expect(parsed.currency.state).toBe("unconfirmed");
    expect(parsed.toAssignment).toBeNull();
    expect(parsed.transaction.amount).toBe(50);
    expect(parsed.amountDecimal).toBe("50");
  });

  it("still rejects an accepted ATM destination with unconfirmed currency", () => {
    expect(accountReviewRowSchema.safeParse({
      ...atmRow(), toAccountEvidence: uncertainDestination(),
      currency: {
        state: "unconfirmed", reason: "unsupported",
        candidateCodes: [], statedCode: "ZZZ", evidenceSpans: [],
      },
      assignment: unresolved(),
      toAssignment: existingAccount(REVIEW_WIRE_IDS.cashAccountId),
    }).success).toBe(false);
  });

  it("preserves selected/overridden financial data, revision and immutable input", () => {
    const input = atmRow();
    const original = {
      ...input, toAccountEvidence: explicitDestination(),
      toAssignment: existingAccount(REVIEW_WIRE_IDS.cashAccountId),
      revision: "13", selected: true, hasUserAccountOverride: true,
      hasUserCurrencyOverride: true,
    };
    Object.freeze(original);
    Object.freeze(original.transaction);
    const parsed = parseRow(original);
    expect(parsed).toHaveProperty("toAccountEvidence", explicitDestination());
    expect(parsed.transaction).toEqual(original.transaction);
    expect(parsed.amountDecimal).toBe("50");
    expect(parsed.revision).toBe("13");
    expect(parsed.selected).toBe(true);
    expect(parsed.hasUserAccountOverride).toBe(true);
    expect(parsed.hasUserCurrencyOverride).toBe(true);
    expect(parsed.assignment).toEqual(original.assignment);
    expect(parsed.toAssignment).toEqual(original.toAssignment);
  });
});
