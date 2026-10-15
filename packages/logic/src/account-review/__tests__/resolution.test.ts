/**
 * #395 T017 — pure US1 resolver tests. Future T019 implementation import is
 * intentionally absent for a meaningful creation Red; do not mock or skip it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accountReviewSessionSchema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../schemas";
import { resolveAccountReviewSession } from "../resolution";
import {
  R17, account, atmSession, explicitEvidence, existing, known,
  pendingSession, rowOf, session, snapshots, unconfirmed, unresolved,
  withRow, type ResolutionSnapshots,
} from "./resolution-fixtures";

const BANK = account(R17.bank, { isDefault: true });
const CASH = account(R17.cash, {
  name: "Cash", type: "CASH", providerDisplayName: null, senderNames: [],
});
const WALLET = account(R17.wallet, {
  name: "Wallet", type: "DIGITAL_WALLET",
  providerDisplayName: null, senderNames: [],
});

function resolve(
  source: AccountReviewSession,
  context: ResolutionSnapshots
): AccountReviewSession {
  return accountReviewSessionSchema.parse(
    resolveAccountReviewSession({ session: source, accountSnapshots: context })
  );
}

function firstAssignment(review: AccountReviewSession): AccountReviewRow["assignment"] {
  return rowOf(review).assignment;
}

function expectExisting(
  review: AccountReviewSession, accountId: string,
  origin: "exact" | "default" | "user"
): void {
  expect(firstAssignment(review)).toMatchObject({
    state: "existing", accountId, origin, currency: "EGP",
  });
}

function expectUnresolved(review: AccountReviewSession): void {
  expect(firstAssignment(review).state).toBe("unresolved");
  expect(rowOf(review).selected).toBe(false);
}

function explicit(
  review: AccountReviewSession,
  source: "VOICE" | "SMS" = "VOICE"
): AccountReviewSession {
  return withRow(review, (row) => ({
    ...row, accountEvidence: explicitEvidence(source),
  }));
}

function selectedByUser(review: AccountReviewSession, id: string): AccountReviewSession {
  return withRow(review, (row) => ({
    ...row,
    assignment: existing(id, "user"),
    currency: known("EGP", "user"),
    hasUserAccountOverride: true,
    hasUserCurrencyOverride: true,
    selected: true,
    reviewReasons: [],
  }));
}

function atmWithSource(): AccountReviewSession {
  return atmSession(R17.bank);
}

describe("#395 T017 — absent evidence and unique default (M01/M02)", () => {
  it("resolves one active eligible Voice Bank default, never selecting or saving", () => {
    const result = resolve(session(), snapshots([BANK]));
    expectExisting(result, R17.bank, "default");
    expect(result.rows).toHaveLength(1);
    expect(result.groups).toEqual([]);
    expect(result.saveIntent).toBeNull();
    expect(rowOf(result).selected).toBe(false);
    expect(rowOf(result).transaction.accountId).toBeUndefined();
  });

  it("accepts one matching default among multiple nondefault active accounts", () => {
    const result = resolve(session(), snapshots([
      account(R17.secondBank, { currency: "USD" }), BANK, CASH, WALLET,
    ]));
    expectExisting(result, R17.bank, "default");
    expect(result.groups).toEqual([]);
  });

  it("Voice may accept the only eligible Cash default if no account was named", () => {
    const result = resolve(session(), snapshots([
      { ...CASH, isDefault: true }, account(R17.secondBank),
    ]));
    expectExisting(result, R17.cash, "default");
  });

  it.each([
    ["BANK", BANK, R17.bank],
    ["DIGITAL_WALLET", { ...WALLET, isDefault: true }, R17.wallet],
  ] as const)("SMS ordinary source accepts its compatible %s default", (_label, current, id) => {
    expectExisting(
      resolve(session("SMS"), snapshots([current, CASH])),
      id, "default"
    );
  });

  it("ordinary SMS rejects Cash default even when it is the only account", () => {
    expectUnresolved(resolve(session("SMS"), snapshots([{ ...CASH, isDefault: true }])));
  });

  it("never picks a first Bank merely because it is the only available account", () => {
    expectUnresolved(resolve(session("SMS"), snapshots([account(R17.bank)])));
  });

  it("does not choose a Bank when there is no default among several accounts", () => {
    expectUnresolved(resolve(session(), snapshots([
      account(R17.bank), account(R17.secondBank), CASH,
    ])));
  });

  it("rejects wrong-currency defaults instead of converting the amount", () => {
    const original = session("SMS");
    const result = resolve(original, snapshots([
      account(R17.bank, { currency: "USD", isDefault: true }),
    ]));
    expectUnresolved(result);
    expect(rowOf(result).amountDecimal).toBe("50");
    expect(rowOf(result).transaction.amount).toBe(50);
    expect(rowOf(result).currency).toEqual(known("EGP", "explicit"));
  });

  it("fails closed on two simultaneously marked eligible defaults", () => {
    expectUnresolved(resolve(session(), snapshots([
      BANK, account(R17.secondBank, { isDefault: true }),
    ])));
  });

  it("preserves non-account blockers when accepting the eligible default", () => {
    const original = withRow(session(), (row) => ({
      ...row,
      reviewReasons: [
        "account_needed", "low_confidence", "category_needed",
        "ambiguous_amount", "currency_confirmation_needed",
      ],
    }));
    const result = resolve(original, snapshots([BANK]));
    expectExisting(result, R17.bank, "default");
    expect(rowOf(result).reviewReasons).not.toContain("account_needed");
    expect(rowOf(result).reviewReasons).toEqual(expect.arrayContaining([
      "low_confidence", "category_needed", "ambiguous_amount",
      "currency_confirmation_needed",
    ]));
    expect(rowOf(result).selected).toBe(false);
    expect(rowOf(result).transaction.categoryId).toBe(R17.category);
    expect(rowOf(result).transaction.confidence).toBe(0.98);
  });
});

describe("#395 T017 — exact grounded candidates before any default", () => {
  it("accepts one confident owned existing identity without needing a default", () => {
    const result = resolve(explicit(session()), snapshots([account(R17.bank)]));
    expectExisting(result, R17.bank, "exact");
    expect(rowOf(result).reviewReasons).not.toContain("account_needed");
    expect(rowOf(result).selected).toBe(false);
  });

  it("SMS accepts grounded BANK evidence even when the sole default is ineligible Cash", () => {
    const result = resolve(explicit(session("SMS"), "SMS"), snapshots([
      account(R17.bank), { ...CASH, isDefault: true },
    ]));
    expectExisting(result, R17.bank, "exact");
    expect(rowOf(result).toAssignment).toBeNull();
  });

  it("chooses an exact nondefault QNB over a different named default", () => {
    const otherDefault = account(R17.secondBank, {
      name: "CIB", providerDisplayName: "CIB", senderNames: ["CIB"],
      isDefault: true,
    });
    expectExisting(resolve(explicit(session()), snapshots([
      otherDefault, account(R17.bank),
    ])), R17.bank, "exact");
  });

  it("does not use the default when grounded explicit identity is unmatched", () => {
    const otherDefault = account(R17.secondBank, {
      isDefault: true, name: "CIB", providerDisplayName: "CIB",
      senderNames: ["CIB"],
    });
    expectUnresolved(resolve(explicit(session()), snapshots([otherDefault])));
  });

  it("does not replace T014's pending unmatched group with an unrelated default", () => {
    const original = pendingSession();
    const context = snapshots([account(R17.secondBank, {
      name: "CIB", providerDisplayName: "CIB", senderNames: ["CIB"],
      isDefault: true,
    })]);
    const result = resolve(original, context);
    expect(firstAssignment(result)).toEqual(firstAssignment(original));
    expect(result.groups).toEqual(original.groups);
    expect(result.groups[0]?.status).toBe("pending");
    expect(rowOf(result).selected).toBe(false);
    expect(result.revision).toBe(original.revision);
    expect(result.saveIntent).toBeNull();
  });

  it("uncertain identity with a named candidate must not use the default", () => {
    const original = withRow(session(), (row) => ({
      ...row, accountEvidence: {
        ...explicitEvidence(), state: "uncertain",
      },
    }));
    expectUnresolved(resolve(original, snapshots([BANK])));
  });

  it("low confidence grounded identity cannot auto-accept a matching account", () => {
    const original = withRow(explicit(session()), (row) => {
      if (row.source !== "VOICE") throw new Error("Expected Voice review row");
      return {
        ...row, transaction: { ...row.transaction, confidence: 0.15 },
        reviewReasons: ["low_confidence", "account_needed"],
      };
    });
    expectUnresolved(resolve(original, snapshots([BANK])));
  });

  it("several compatible grounded accounts yield scoped candidate choices, not default", () => {
    const context = snapshots([
      account(R17.bank),
      account(R17.secondBank),
      account(R17.thirdBank, {
        name: "CIB", providerDisplayName: "CIB", senderNames: ["CIB"],
        isDefault: true,
      }),
    ]);
    const result = resolve(explicit(session()), context);
    const assignment = firstAssignment(result);
    expect(assignment.state).toBe("unresolved");
    if (assignment.state !== "unresolved") throw new Error("Expected candidate choice");
    expect([...assignment.candidateAccountIds].sort()).toEqual(
      [R17.bank, R17.secondBank].sort()
    );
    expect(rowOf(result).selected).toBe(false);
  });

  it.each([
    ["provider", { providerDisplayName: "CIB" }],
    ["type", { type: "DIGITAL_WALLET" }],
    ["card", { cardLast4: "9999" }],
    ["currency", { currency: "USD" }],
  ] as const)("incompatible grounded %s evidence never becomes an exact match", (_kind, patch) => {
    const result = resolve(explicit(session()), snapshots([account(R17.bank, patch)]));
    expectUnresolved(result);
  });

  it("a merchant label cannot become grounded account identity", () => {
    const original = withRow(session("SMS"), (row) => {
      if (row.source !== "SMS") throw new Error("Expected SMS review row");
      return {
        ...row, transaction: { ...row.transaction, counterparty: "QNB", merchant: "QNB" },
      };
    });
    expectUnresolved(resolve(original, snapshots([account(R17.bank)])));
  });
});

describe("#395 T017 — currency provenance and scoped account snapshots (M02/M03)", () => {
  it.each([
    "ambiguous", "conflicting", "unsupported", "legacy_unknown",
  ] as const)("never assigns the default with %s unconfirmed currency", (reason) => {
    const input = withRow(session(), (row) => ({
      ...row, currency: unconfirmed(reason),
      assignment: unresolved("currency_confirmation_needed"),
      reviewReasons: ["account_needed", "currency_confirmation_needed"],
    }));
    const result = resolve(input, snapshots([BANK]));
    expectUnresolved(result);
    expect(rowOf(result).currency).toEqual(unconfirmed(reason));
    expect(rowOf(result).transaction.currency).toBe("EGP");
    expect(rowOf(result).reviewReasons).toContain("currency_confirmation_needed");
  });

  it("accepts an already-proven omission using captured currency, not a new model guess", () => {
    const input = withRow(session(), (row) => ({
      ...row, currency: known("EGP", "preferred_omission"),
    }));
    const result = resolve(input, snapshots([BANK]));
    expectExisting(result, R17.bank, "default");
    expect(rowOf(result).currency).toEqual(known("EGP", "preferred_omission"));
    expect(rowOf(result).amountDecimal).toBe("50");
  });

  it("does not rewrite a previously captured EGP omission to USD", () => {
    const input = withRow(session(), (row) => ({
      ...row, currency: known("EGP", "preferred_omission"),
    }));
    const result = resolve(input, snapshots([account(R17.bank, {
      currency: "USD", isDefault: true,
    })]));
    expectUnresolved(result);
    expect(rowOf(result).currency).toEqual(known("EGP", "preferred_omission"));
    expect(rowOf(result).transaction.amount).toBe(50);
  });

  it("rejects a foreign owner snapshot instead of trusting matching UUID syntax", () => {
    expect(() => resolve(session(), snapshots([BANK], R17.foreignOwner))).toThrow();
  });

  it("rejects a stale providerContext that disagrees with available account IDs", () => {
    const initial = snapshots([BANK]);
    const mismatched: ResolutionSnapshots = {
      ...initial,
      providerContext: snapshots([account(R17.secondBank)]).providerContext,
    };
    expect(() => resolve(session(), mismatched)).toThrow();
  });

  it("rejects a changed preferred profile context rather than silently rewriting the session", () => {
    const original = snapshots([BANK]);
    expect(() => resolve(session(), {
      ...original, preferredCurrency: "USD",
    })).toThrow();
  });

  it("does not treat a deleted or foreign account ID as eligible when absent from the owned active snapshot", () => {
    const selected = selectedByUser(session(), R17.missingAccount);
    const result = resolve(selected, snapshots([BANK]));
    expectUnresolved(result);
    expect(firstAssignment(result)).not.toMatchObject({ accountId: R17.bank });
  });

  it("must not invent ownership from a syntactically valid outside candidate UUID", () => {
    const source = withRow(explicit(session()), (row) => ({
      ...row, accountEvidence: {
        ...explicitEvidence(),
        candidateAccountIds: [R17.missingAccount],
      },
    }));
    const result = resolve(source, snapshots([account(R17.bank)]));
    const assignment = firstAssignment(result);
    if (assignment.state === "existing") {
      expect(assignment.accountId).not.toBe(R17.missingAccount);
    }
    if (assignment.state === "unresolved") {
      expect(assignment.candidateAccountIds).not.toContain(R17.missingAccount);
    }
  });
});

describe("#395 T017 — explicit user overrides and immutable resolution", () => {
  it("preserves a valid explicit user account and currency on repeated refresh", () => {
    const input = selectedByUser(session(), R17.secondBank);
    const context = snapshots([
      BANK, account(R17.secondBank),
    ]);
    const first = resolve(input, context);
    const repeat = resolve(first, context);
    expect(firstAssignment(first)).toEqual(existing(R17.secondBank, "user"));
    expect(firstAssignment(repeat)).toEqual(existing(R17.secondBank, "user"));
    expect(rowOf(repeat).currency).toEqual(known("EGP", "user"));
    expect(rowOf(repeat).hasUserAccountOverride).toBe(true);
    expect(rowOf(repeat).hasUserCurrencyOverride).toBe(true);
    expect(rowOf(repeat).selected).toBe(true);
  });

  it("invalidates a removed user choice without silently substituting the current default", () => {
    const original = selectedByUser(session(), R17.secondBank);
    const result = resolve(original, snapshots([BANK]));
    expectUnresolved(result);
    expect(firstAssignment(result)).not.toMatchObject({ accountId: R17.bank });
  });

  it("invalidates a user-selected account whose currency changed, without conversion", () => {
    const source = selectedByUser(session(), R17.secondBank);
    const result = resolve(source, snapshots([
      BANK, account(R17.secondBank, { currency: "USD" }),
    ]));
    expectUnresolved(result);
    expect(rowOf(result).currency).toEqual(known("EGP", "user"));
    expect(rowOf(result).amountDecimal).toBe("50");
    expect(rowOf(result).transaction.amount).toBe(50);
  });

  it("does not retain an explicitly chosen Cash source in ordinary SMS", () => {
    const input = selectedByUser(session("SMS"), R17.cash);
    const result = resolve(input, snapshots([
      BANK, CASH,
    ]));
    expectUnresolved(result);
    expect(firstAssignment(result)).not.toMatchObject({ accountId: R17.bank });
  });

  it("preserves source objects, original snapshot lists, group IDs and non-account fields", () => {
    const input = session();
    const context = snapshots([BANK]);
    const inputBefore = structuredClone(input);
    const contextBefore = structuredClone(context);
    Object.freeze(input.rows);
    Object.freeze(input);
    Object.freeze(context.accounts);
    Object.freeze(context);
    const result = resolve(input, context);
    expect(input).toEqual(inputBefore);
    expect(context).toEqual(contextBefore);
    expect(result).not.toBe(input);
    expect(result.sessionId).toBe(input.sessionId);
    expect(result.rows.map((row) => row.rowId)).toEqual(input.rows.map((row) => row.rowId));
    expect(result.groups).toEqual(input.groups);
    expect(result.revision).toBe(input.revision);
    expect(result.operationGeneration).toBe(input.operationGeneration);
    expect(result.removedEvidenceKeys).toEqual(input.removedEvidenceKeys);
    expect(result.filter).toBe(input.filter);
    expect(result.saveIntent).toBe(input.saveIntent);
  });

  it("does not resolve a second explicitly uncertain row while resolving the absent one", () => {
    const base = session();
    const first = rowOf(base);
    const second: AccountReviewRow = {
      ...first, rowId: R17.secondBank,
      sourceRef: "synthetic-second-voice-row",
      accountEvidence: { ...explicitEvidence(), state: "uncertain" },
    };
    const input = accountReviewSessionSchema.parse({
      ...base, rows: [first, second],
    });
    const result = resolve(input, snapshots([BANK]));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.assignment.state).toBe("existing");
    expect(result.rows[1]?.assignment.state).toBe("unresolved");
    expect(result.rows[1]?.rowId).toBe(second.rowId);
    expect(result.groups).toEqual([]);
  });
});

describe("#395 T017 — independent ATM Cash destination and ordinary endpoints", () => {
  it("keeps user-selected Bank source while choosing compatible Cash default destination", () => {
    const result = resolve(atmWithSource(), snapshots([
      account(R17.bank), { ...CASH, isDefault: true },
    ]));
    expect(firstAssignment(result)).toEqual(existing(R17.bank, "user"));
    expect(rowOf(result).toAssignment).toMatchObject({
      state: "existing", accountId: R17.cash, origin: "default", currency: "EGP",
    });
    expect(rowOf(result).selected).toBe(false);
    expect(result.saveIntent).toBeNull();
  });

  it("uses the sole compatible Cash destination when none is marked default", () => {
    const result = resolve(atmWithSource(), snapshots([
      account(R17.bank), CASH,
    ]));
    expect(rowOf(result).toAssignment).toMatchObject({
      state: "existing", accountId: R17.cash, currency: "EGP",
    });
    expect(firstAssignment(result)).toEqual(existing(R17.bank, "user"));
  });

  it("offers explicit choice rather than taking the first of two compatible Cash destinations", () => {
    const result = resolve(atmWithSource(), snapshots([
      account(R17.bank), CASH,
      account(R17.secondCash, {
        ...CASH, id: R17.secondCash, name: "Other Cash",
      }),
    ]));
    const to = rowOf(result).toAssignment;
    expect(to?.state).toBe("unresolved");
    if (to?.state !== "unresolved") throw new Error("Expected Cash destination choice");
    expect([...to.candidateAccountIds].sort()).toEqual([R17.cash, R17.secondCash].sort());
  });

  it("ignores incompatible USD Cash default and uses sole EGP Cash instead", () => {
    const result = resolve(atmWithSource(), snapshots([
      account(R17.bank),
      account(R17.secondCash, {
        ...CASH, id: R17.secondCash, currency: "USD", isDefault: true,
      }),
      CASH,
    ]));
    expect(rowOf(result).toAssignment).toMatchObject({
      state: "existing", accountId: R17.cash, currency: "EGP",
    });
  });

  it("leaves ATM destination unresolved when no compatible Cash exists", () => {
    const result = resolve(atmWithSource(), snapshots([
      account(R17.bank),
      account(R17.cash, { ...CASH, currency: "USD", isDefault: true }),
    ]));
    expect(rowOf(result).toAssignment?.state).toBe("unresolved");
  });

  it("retains a valid explicitly chosen Cash destination even if another default exists", () => {
    const original = withRow(atmWithSource(), (row) => {
      if (row.source !== "SMS") throw new Error("Expected ATM SMS");
      return { ...row, toAssignment: existing(R17.cash, "user") };
    });
    const result = resolve(original, snapshots([
      account(R17.bank), CASH,
    ]));
    expect(rowOf(result).toAssignment).toEqual(existing(R17.cash, "user"));
  });

  it("never assigns the same source and destination account, even for malformed prior source choice", () => {
    const invalidSource = atmSession(R17.cash);
    const result = resolve(invalidSource, snapshots([
      account(R17.bank), { ...CASH, isDefault: true },
    ]));
    const from = firstAssignment(result);
    const to = rowOf(result).toAssignment;
    if (from.state === "existing" && to?.state === "existing") {
      expect(from.accountId).not.toBe(to.accountId);
    }
    expect(from).not.toMatchObject({ state: "existing", accountId: R17.cash });
  });

  it("ordinary SMS cannot gain a Cash destination or become a transfer", () => {
    const result = resolve(session("SMS"), snapshots([
      account(R17.bank), { ...CASH, isDefault: true },
    ]));
    expect(rowOf(result).toAssignment).toBeNull();
    expect(result.groups).toEqual([]);
    expect(rowOf(result).transaction.type).toBe("EXPENSE");
  });

  it("Voice Cash expenses have no automatic transfer destination", () => {
    const result = resolve(session(), snapshots([{ ...CASH, isDefault: true }]));
    expect(rowOf(result).toAssignment).toBeNull();
    expect(rowOf(result).transaction.type).toBe("EXPENSE");
  });
});

describe("#395 T017 — future resolver ownership boundary", () => {
  it("stays pure logic and never calls DB, mobile, parser or provider runtime APIs", () => {
    const code = readFileSync(join(__dirname, "../resolution.ts"), "utf8");
    expect(code).not.toMatch(/from ["'][^"']*(?:apps\/mobile|@\/|@monyvi\/db)["']/);
    expect(code).not.toMatch(/(?:WatermelonDB|database\.|Deno\.env|process\.env|supabase\.)/);
    expect(code).not.toMatch(/(?:parseVoiceWithAi|parseSmsWithAi|createHash\(|fetch\()/);
  });

  it("does not create group IDs, auto-confirm pending groups or select rows", () => {
    const original = pendingSession();
    const result = resolve(original, snapshots([
      account(R17.secondBank, {
        name: "CIB", providerDisplayName: "CIB", isDefault: true,
      }),
    ]));
    expect(result.groups).toEqual(original.groups);
    expect(result.rows.map((row) => row.rowId)).toEqual(
      original.rows.map((row) => row.rowId)
    );
    expect(rowOf(result).selected).toBe(false);
    expect(result.saveIntent).toBeNull();
  });
});
