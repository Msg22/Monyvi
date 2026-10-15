/**
 * #395 T019 tests-first review of immutable resolver refresh/identity guards.
 * Real resolver and accepted Core T017 canonical fixtures; never mock the SUT.
 */
import {
  accountReviewRequestContextSchema,
  accountReviewSessionSchema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { resolveAccountReviewSession } from "../resolution";
import {
  R17, account, explicitEvidence, known, rowOf, session, snapshots,
  unconfirmed, unresolved, withRow, type ResolutionSnapshots,
} from "./resolution-fixtures";
import {
  DEFAULT_CONFLICT_CASES,
  capturedOmission,
  freshPreferredUsd,
  groundedNoCard,
  groundedStatedCard,
  qnbCardAccounts,
} from "./resolution-refresh-fixtures";

function resolve(
  original: AccountReviewSession, current: ResolutionSnapshots
): AccountReviewSession {
  return accountReviewSessionSchema.parse(
    resolveAccountReviewSession({ session: original, accountSnapshots: current })
  );
}

function unresolvedRow(review: AccountReviewSession): Extract<
  AccountReviewRow["assignment"], { state: "unresolved" }
> {
  const row = rowOf(review);
  expect(row.selected).toBe(false);
  expect(review.saveIntent).toBeNull();
  if (row.assignment.state !== "unresolved") {
    throw new Error("Expected unresolved account, not implicit assignment");
  }
  return row.assignment;
}

describe("#395 T019 refresh — captured preferred currency vs fresh owner context", () => {
  it.each(["VOICE", "SMS"] as const)(
    "keeps a captured EGP omission for %s when same owner now prefers USD",
    (source) => {
      const input = capturedOmission(source);
      const current = freshPreferredUsd();
      const original = structuredClone(input);
      expect(current.ownerId).toBe(input.ownerId);
      expect(current.preferredCurrency).toBe("USD");
      expect(current.providerContext.preferredCurrency).toBe("USD");
      expect(accountReviewRequestContextSchema.safeParse(current.providerContext).success)
        .toBe(true);
      expect(input.preferredCurrency).toBe("EGP");
      const result = resolve(input, current);
      const row = rowOf(result);
      expect(result.ownerId).toBe(R17.owner);
      expect(result.preferredCurrency).toBe("EGP");
      expect(row.currency).toEqual(known("EGP", "preferred_omission"));
      expect(row.transaction.currency).toBe("EGP");
      expect(row.transaction.amount).toBe(50);
      expect(row.amountDecimal).toBe("50");
      expect(row.assignment).toMatchObject({
        state: "existing", accountId: R17.bank,
        origin: "default", currency: "EGP",
      });
      expect(row.selected).toBe(false);
      expect(result.saveIntent).toBeNull();
      expect(input).toEqual(original);
    }
  );

  it("accepts same-owner account additions in a coherent fresh USD preference", () => {
    const original = capturedOmission("VOICE");
    const current = snapshots([
      account(R17.bank, { isDefault: true }),
      account(R17.secondBank, { currency: "USD" }),
    ], R17.owner, "USD");
    const result = resolve(original, current);
    expect(result.preferredCurrency).toBe("EGP");
    expect(rowOf(result).currency).toEqual(known("EGP", "preferred_omission"));
    expect(rowOf(result).assignment).toMatchObject({
      state: "existing", accountId: R17.bank, origin: "default",
    });
  });

  it("still rejects an internally contradictory same-owner provider projection", () => {
    const coherent = freshPreferredUsd();
    const contradictory: ResolutionSnapshots = {
      ...coherent,
      providerContext: snapshots(coherent.accounts, R17.owner, "EUR").providerContext,
    };
    expect(contradictory.ownerId).toBe(R17.owner);
    expect(contradictory.preferredCurrency).toBe("USD");
    expect(contradictory.providerContext.preferredCurrency).toBe("EUR");
    expect(() => resolve(capturedOmission("SMS"), contradictory)).toThrow();
  });

  it("still rejects a coherent fresh profile belonging to another owner", () => {
    const foreign = snapshots([
      account(R17.bank, { isDefault: true }),
    ], R17.foreignOwner, "USD");
    expect(foreign.providerContext.preferredCurrency).toBe(foreign.preferredCurrency);
    expect(() => resolve(capturedOmission("VOICE"), foreign)).toThrow();
  });
});

describe("#395 T019 defaults — inconsistency is global, not currency-filtered", () => {
  it.each(DEFAULT_CONFLICT_CASES)(
    "leaves absent $name source unresolved when two active defaults conflict",
    ({ source, accounts }) => {
      const initial = session(source);
      const current = snapshots(accounts);
      expect(current.accounts.filter((item) => item.isDefault)).toHaveLength(2);
      expect(current.providerContext.accounts).toHaveLength(2);
      const result = resolve(initial, current);
      const assignment = unresolvedRow(result);
      expect(assignment.accountId).toBeNull();
      expect(assignment.candidateAccountIds).toEqual([]);
      expect(rowOf(result).currency).toEqual(known("EGP", "explicit"));
      expect(rowOf(result).transaction.amount).toBe(50);
      expect(rowOf(result).reviewReasons).toContain("account_needed");
      expect(result.groups).toEqual([]);
    }
  );

  it("does not block independently grounded exact QNB evidence because defaults conflict", () => {
    const review = groundedNoCard("VOICE");
    const current = snapshots([
      account(R17.bank, { isDefault: true }),
      account(R17.secondBank, {
        name: "CIB", providerDisplayName: "CIB",
        senderNames: ["CIB"], currency: "USD", isDefault: true,
      }),
    ]);
    expect(current.accounts.filter((item) => item.isDefault)).toHaveLength(2);
    const result = resolve(review, current);
    expect(rowOf(result).assignment).toMatchObject({
      state: "existing", accountId: R17.bank, origin: "exact",
    });
    expect(rowOf(result).selected).toBe(false);
  });
});

describe("#395 T019 card provenance — omitted does not conflict with stored suffix", () => {
  it.each(["VOICE", "SMS"] as const)(
    "%s no-card evidence offers both owned same-provider cards, not empty choices",
    (source) => {
      const original = groundedNoCard(source);
      expect(rowOf(original).accountEvidence.cardLast4).toBeNull();
      const current = snapshots(qnbCardAccounts());
      const result = resolve(original, current);
      const assignment = unresolvedRow(result);
      expect([...assignment.candidateAccountIds].sort()).toEqual(
        [R17.bank, R17.secondBank].sort()
      );
      expect(rowOf(result).reviewReasons).toContain("account_match_ambiguous");
      expect(rowOf(result).transaction.amount).toBe(50);
      expect(rowOf(result).transaction.categoryId).toBe(R17.category);
      expect(result.groups).toEqual([]);
    }
  );

  it.each(["VOICE", "SMS"] as const)(
    "%s no-card evidence can resolve a unique grounded QNB with stored card",
    (source) => {
      const original = groundedNoCard(source);
      const result = resolve(original, snapshots([
        account(R17.bank, { cardLast4: "1234" }),
      ]));
      expect(rowOf(result).assignment).toMatchObject({
        state: "existing", accountId: R17.bank,
        origin: "exact", currency: "EGP",
      });
      expect(rowOf(result).reviewReasons).not.toContain("account_needed");
      expect(rowOf(result).selected).toBe(false);
    }
  );

  it.each(["VOICE", "SMS"] as const)(
    "%s explicit 1234 evidence matches only 1234, excluding another QNB card",
    (source) => {
      const original = groundedStatedCard(source, "1234");
      const cardSpans = rowOf(original).accountEvidence.evidenceSpans;
      expect(cardSpans.some((span) => span.text === "1234")).toBe(true);
      const result = resolve(original, snapshots(qnbCardAccounts()));
      expect(rowOf(result).assignment).toMatchObject({
        state: "existing", accountId: R17.bank, origin: "exact",
      });
      expect(rowOf(result).selected).toBe(false);
    }
  );

  it.each(["VOICE", "SMS"] as const)(
    "%s explicit 9999 cannot match stored 1234/5678 or accept a default",
    (source) => {
      const original = groundedStatedCard(source, "9999");
      const current = snapshots([
        ...qnbCardAccounts(),
        account(R17.thirdBank, {
          name: "CIB", providerDisplayName: "CIB",
          senderNames: ["CIB"], isDefault: true,
        }),
      ]);
      const result = resolve(original, current);
      expect(unresolvedRow(result).candidateAccountIds).toEqual([]);
      expect(rowOf(result).assignment).not.toMatchObject({
        state: "existing", accountId: R17.thirdBank,
      });
    }
  );

  it("does not treat a missing stored card suffix as proof of a stated suffix", () => {
    const original = groundedStatedCard("SMS", "1234");
    const result = resolve(original, snapshots([
      account(R17.bank, { cardLast4: null, isDefault: true }),
    ]));
    expect(unresolvedRow(result).candidateAccountIds).toEqual([]);
    expect(rowOf(result).transaction.amount).toBe(50);
  });

  it("never copies an unowned model candidate ID into card-omission choices", () => {
    const original = withRow(groundedNoCard("SMS"), (row) => ({
      ...row,
      accountEvidence: {
        ...row.accountEvidence, candidateAccountIds: [R17.missingAccount],
      },
    }));
    const result = resolve(original, snapshots(qnbCardAccounts()));
    const ids = unresolvedRow(result).candidateAccountIds;
    expect([...ids].sort()).toEqual([R17.bank, R17.secondBank].sort());
    expect(ids).not.toContain(R17.missingAccount);
  });
});

describe("#395 T019 known-invalid evidence must never silently become default", () => {
  it("keeps an explicitly uncertain sender/account unresolved despite a valid default", () => {
    const original = withRow(session("SMS"), (row) => ({
      ...row,
      accountEvidence: { ...explicitEvidence("SMS"), state: "uncertain" },
      reviewReasons: ["account_identity_uncertain", "account_needed"],
    }));
    const result = resolve(original, snapshots([
      account(R17.bank, { isDefault: true }),
    ]));
    expect(unresolvedRow(result).candidateAccountIds).toEqual([]);
    expect(rowOf(result).reviewReasons).toContain("account_identity_uncertain");
  });

  it("preserves a removed identity as unresolved even if the only Bank is default", () => {
    const original = withRow(session("SMS"), (row) => ({
      ...row, assignment: unresolved("account_group_removed"),
      reviewReasons: ["account_group_removed"],
    }));
    const result = resolve(original, snapshots([
      account(R17.bank, { isDefault: true }),
    ]));
    expect(unresolvedRow(result).reasonCode).toBe("account_group_removed");
    expect(rowOf(result).reviewReasons).toContain("account_group_removed");
    expect(result.removedEvidenceKeys).toEqual(original.removedEvidenceKeys);
  });

  it("keeps legacy_unknown currency unconfirmed and cannot infer it from default", () => {
    const original = withRow(session("SMS"), (row) => ({
      ...row,
      currency: unconfirmed("legacy_unknown"),
      assignment: unresolved("currency_confirmation_needed"),
      reviewReasons: ["account_needed", "currency_confirmation_needed"],
    }));
    const result = resolve(original, snapshots([
      account(R17.bank, { isDefault: true }),
    ]));
    expect(unresolvedRow(result).reasonCode).toBe("currency_confirmation_needed");
    expect(rowOf(result).currency).toEqual(unconfirmed("legacy_unknown"));
    expect(rowOf(result).reviewReasons).toContain("currency_confirmation_needed");
    expect(rowOf(result).transaction.amount).toBe(50);
    expect(rowOf(result).selected).toBe(false);
  });
});
