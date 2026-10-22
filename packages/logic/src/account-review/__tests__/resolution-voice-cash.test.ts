/** Owner-approved Voice Cash matching; ordinary SMS and named identity stay strict. */
import { resolveAccountReviewSession } from "../resolution";
import type { AccountReviewRow, AccountReviewSession } from "../review-schemas";
import {
  R17,
  account,
  existing,
  rowOf,
  session,
  snapshots,
  unconfirmed,
  withRow,
  type ScopedAccount,
} from "./resolution-fixtures";

const cash = account(R17.cash, {
  name: "Pocket money",
  type: "CASH",
  providerDisplayName: null,
  senderNames: [],
});
const otherCash = { ...cash, id: R17.secondCash, name: "Other purse" };
const bank = account(R17.bank, { isDefault: true });

function cashReview(word = "cash"): AccountReviewSession {
  return withRow(session(), (row) => ({
    ...row,
    accountEvidence: {
      state: "explicit",
      name: word,
      type: "CASH",
      institutionId: null,
      providerDisplayName: null,
      cardLast4: null,
      candidateAccountIds: [],
      evidenceSpans: [
        {
          sourceRef: row.sourceRef,
          field: "transcript",
          start: 0,
          end: word.length,
          text: word,
        },
      ],
    },
  }));
}
function resolve(
  review: AccountReviewSession,
  accounts: readonly ScopedAccount[]
): AccountReviewSession {
  return resolveAccountReviewSession({
    session: review,
    accountSnapshots: snapshots(accounts),
  });
}
function expectChoice(result: AccountReviewSession, id: string): void {
  expect(rowOf(result).assignment).toMatchObject({
    state: "existing",
    accountId: id,
    currency: "EGP",
    origin: "exact",
  });
  expect(result.groups).toEqual([]);
  expect(result.saveIntent).toBeNull();
}

describe("Voice explicitly says Cash", () => {
  it.each(["cash", "CASH", "كاش", "نقدًا"])(
    "uses sole same-currency Cash for %s even with a Bank default",
    (word) => {
      const result = resolve(cashReview(word), [bank, cash]);
      expectChoice(result, cash.id);
      expect(rowOf(result).transaction.amount).toBe(
        rowOf(cashReview(word)).transaction.amount
      );
    }
  );
  it("prefers the actual compatible Cash default among multiple Cash accounts", () => {
    expectChoice(
      resolve(cashReview(), [
        otherCash,
        { ...cash, isDefault: true },
        { ...bank, isDefault: false },
      ]),
      cash.id
    );
  });
  it("never uses a wallet default instead of the sole matching Cash", () => {
    expectChoice(
      resolve(cashReview(), [{ ...bank, type: "DIGITAL_WALLET" }, cash]),
      cash.id
    );
  });
  it.each([
    ["no Cash", [bank]],
    ["wrong currency Cash", [bank, { ...cash, currency: "USD" }]],
    ["multiple nondefault Cash", [bank, cash, otherCash]],
    [
      "inconsistent Cash defaults",
      [
        { ...cash, isDefault: true },
        { ...otherCash, isDefault: true },
      ],
    ],
  ] as const)("requires choice for %s", (_name, accounts) => {
    expect(rowOf(resolve(cashReview(), accounts)).assignment.state).toBe(
      "unresolved"
    );
  });
  it("offers only compatible Cash candidates when several remain", () => {
    expect(
      rowOf(resolve(cashReview(), [bank, cash, otherCash])).assignment
    ).toMatchObject({
      state: "unresolved",
      reasonCode: "account_match_ambiguous",
      candidateAccountIds: [cash.id, otherCash.id],
    });
  });
  it.each([
    [
      "uncertain evidence",
      (row: AccountReviewRow) => ({
        ...row,
        accountEvidence: {
          ...row.accountEvidence,
          state: "uncertain" as const,
        },
      }),
    ],
    [
      "uncertain currency",
      (row: AccountReviewRow) => ({
        ...row,
        currency: unconfirmed("ambiguous"),
      }),
    ],
    [
      "low confidence",
      (row: AccountReviewRow) => ({
        ...row,
        transaction: { ...row.transaction, confidence: 0.7 },
      }),
    ],
    [
      "invalid evidence",
      (row: AccountReviewRow) => ({
        ...row,
        reviewReasons: ["account_evidence_invalid" as const],
      }),
    ],
  ] as const)("does not auto-match %s", (_name, change) => {
    const review = withRow(cashReview(), change);
    expect(rowOf(resolve(review, [bank, cash])).assignment.state).toBe(
      "unresolved"
    );
  });
  it.each(["Travel purse", "debit"])(
    "does not treat named or non-Cash proof %s as generic Cash",
    (name) => {
      expect(
        rowOf(resolve(cashReview(name), [bank, cash])).assignment.state
      ).toBe("unresolved");
    }
  );
  it("accepts null nickname only with an actual grounded Cash payment word", () => {
    const review = withRow(cashReview(), (row) => ({
      ...row,
      accountEvidence: { ...row.accountEvidence, name: null },
    }));
    expectChoice(resolve(review, [bank, cash]), cash.id);
    const badProof = withRow(review, (row) => ({
      ...row,
      accountEvidence: {
        ...row.accountEvidence,
        evidenceSpans: row.accountEvidence.evidenceSpans.map((span) => ({
          ...span,
          text: "bank",
        })),
      },
    }));
    expect(rowOf(resolve(badProof, [bank, cash])).assignment.state).toBe(
      "unresolved"
    );
  });
  it("invalidates a preferred Cash choice when the default changes among several purses", () => {
    const initial = resolve(cashReview(), [
      { ...cash, isDefault: true },
      otherCash,
    ]);
    expectChoice(initial, cash.id);
    const refreshed = resolve(initial, [
      cash,
      { ...otherCash, isDefault: true },
    ]);
    expect(rowOf(refreshed).assignment).toMatchObject({
      state: "unresolved",
      reasonCode: "account_unavailable",
    });
  });
  it("preserves a later explicit user override over the Cash rule", () => {
    const review = withRow(cashReview(), (row) => ({
      ...row,
      assignment: existing(bank.id, "user"),
      hasUserAccountOverride: true,
    }));
    expect(rowOf(resolve(review, [bank, cash])).assignment).toMatchObject({
      state: "existing",
      accountId: bank.id,
      origin: "user",
    });
  });
  it("revalidates an automatic Cash choice rather than selecting a different account", () => {
    const initial = resolve(cashReview(), [bank, cash]);
    expectChoice(resolve(initial, [bank, cash]), cash.id);
    expect(
      rowOf(resolve(initial, [bank, cash, otherCash])).assignment
    ).toMatchObject({ state: "unresolved", reasonCode: "account_unavailable" });
    expect(rowOf(resolve(initial, [bank])).assignment.state).toBe("unresolved");
  });
  it("keeps ordinary SMS Cash excluded", () => {
    const sms = session("SMS");
    const voiceEvidence = rowOf(cashReview()).accountEvidence;
    const review = withRow(sms, (row) => ({
      ...row,
      accountEvidence: voiceEvidence,
    }));
    expect(rowOf(resolve(review, [bank, cash])).assignment.state).toBe(
      "unresolved"
    );
  });
});
