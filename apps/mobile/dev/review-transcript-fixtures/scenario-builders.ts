/**
 * #395 review transcript fixtures — static data types and builders.
 *
 * Pure, development-only helpers shared by the fixture catalogue. No DB,
 * provider transport, navigation, or runtime side effects. The scenario list
 * itself stays in `scenarios.ts`; this module is the small typed vocabulary it
 * is written in.
 *
 * @module review-transcript-fixtures/scenario-builders
 */

import type { AccountType, CurrencyType, TransactionType } from "@monyvi/db";

/** Ordinary Voice review supports only EXPENSE/INCOME; no transfers/ATM. */
export type ReviewTranscriptFixtureKind = Extract<
  TransactionType,
  "EXPENSE" | "INCOME"
>;

export type ReviewTranscriptFixtureEvidenceState = "absent" | "explicit";

export type ReviewTranscriptFixtureCurrencyState =
  | "omitted"
  | "explicit"
  | "ambiguous"
  | "conflicting"
  | "unsupported";

/**
 * One prepared account role. A role is a prerequisite the setup service may
 * create (idempotently) so grounded evidence can resolve to a real account.
 * Roles never carry financial data or a default flag.
 */
export interface ReviewTranscriptFixtureAccountRole {
  readonly key: string;
  readonly label: string;
  readonly accountType: AccountType;
  readonly currency: CurrencyType;
  /** Grounded provider identity used both for setup and evidence matching. */
  readonly providerDisplayName: string;
  /** Optional grounded card suffix prepared with the role's bank details. */
  readonly cardLast4?: string;
}

export interface ReviewTranscriptFixtureAccountEvidence {
  readonly state: ReviewTranscriptFixtureEvidenceState;
  readonly name: string | null;
  readonly type: AccountType | null;
  readonly institutionId: string | null;
  readonly providerDisplayName: string | null;
  readonly cardLast4: string | null;
  /** Literal transcript substrings that ground this evidence. */
  readonly spanTexts: readonly string[];
}

export interface ReviewTranscriptFixtureCurrencyEvidence {
  readonly state: ReviewTranscriptFixtureCurrencyState;
  readonly statedCode: string | null;
  readonly candidateCodes: readonly CurrencyType[];
  readonly spanTexts: readonly string[];
}

export interface ReviewTranscriptFixtureSuggestion {
  readonly suggestionRef: string;
  readonly name: string;
  readonly type: AccountType | null;
  readonly currency: CurrencyType | null;
  readonly institutionId: string | null;
  readonly providerDisplayName: string | null;
  readonly cardLast4: string | null;
  readonly senderNames: readonly string[];
  readonly transactionRefs: readonly string[];
}

export interface ReviewTranscriptFixtureTransaction {
  readonly transactionRef: string;
  readonly suggestionRef: string | null;
  readonly amount: number;
  readonly kind: ReviewTranscriptFixtureKind;
  readonly counterparty: string | null;
  readonly description: string;
  /** Preferred category system name; the launcher falls back by type. */
  readonly preferredCategorySystemName: string;
  readonly categoryType: TransactionType;
  /** `null` means the source truly omitted a currency. */
  readonly currency: CurrencyType | null;
  /** Calendar date, `YYYY-MM-DD`, matched to the mapped Date locally. */
  readonly date: string;
  readonly confidenceScore: number;
  readonly accountEvidence: ReviewTranscriptFixtureAccountEvidence;
  readonly currencyEvidence: ReviewTranscriptFixtureCurrencyEvidence;
}

export interface ReviewTranscriptFixtureExpectations {
  readonly rowCount: number;
  readonly types: readonly TransactionType[];
  readonly currencyStates: ReadonlyArray<"known" | "unconfirmed">;
  readonly accountEvidenceStates: readonly ReviewTranscriptFixtureEvidenceState[];
}

export interface ReviewTranscriptFixtureScenario {
  readonly id: string;
  /** Development-only English label; never persisted financial content. */
  readonly label: string;
  readonly transcript: string;
  readonly detectedLanguage: "en" | "ar";
  readonly transactions: readonly ReviewTranscriptFixtureTransaction[];
  readonly suggestedAccounts: readonly ReviewTranscriptFixtureSuggestion[];
  readonly requiredAccountRoles: readonly ReviewTranscriptFixtureAccountRole[];
  readonly expectations: ReviewTranscriptFixtureExpectations;
}

// ---------------------------------------------------------------------------
// Shared role definitions
// ---------------------------------------------------------------------------

export const REVIEW_TRANSCRIPT_FIXTURE_BANK_ROLE: ReviewTranscriptFixtureAccountRole =
  Object.freeze({
    key: "test-bank-egp",
    label: "TEST Bank",
    accountType: "BANK",
    currency: "EGP",
    providerDisplayName: "QNB",
  });

export const REVIEW_TRANSCRIPT_FIXTURE_CARD_BANK_ROLE: ReviewTranscriptFixtureAccountRole =
  Object.freeze({
    ...REVIEW_TRANSCRIPT_FIXTURE_BANK_ROLE,
    key: "test-bank-egp-card",
    label: "TEST Card Bank",
    providerDisplayName: "TEST Card Bank",
    cardLast4: "1234",
  });

export const REVIEW_TRANSCRIPT_FIXTURE_WALLET_ROLE: ReviewTranscriptFixtureAccountRole =
  Object.freeze({
    key: "test-wallet-usd",
    label: "TEST Wallet",
    accountType: "DIGITAL_WALLET",
    currency: "USD",
    providerDisplayName: "TEST Wallet",
  });

/** Shared provider, distinguishable only by label + card suffix. */
export const REVIEW_TRANSCRIPT_FIXTURE_SHARED_ROLE_A: ReviewTranscriptFixtureAccountRole =
  Object.freeze({
    key: "test-shared-a",
    label: "TEST Shared",
    accountType: "BANK",
    currency: "EGP",
    providerDisplayName: "TEST Shared",
    cardLast4: "1111",
  });

export const REVIEW_TRANSCRIPT_FIXTURE_SHARED_ROLE_B: ReviewTranscriptFixtureAccountRole =
  Object.freeze({
    ...REVIEW_TRANSCRIPT_FIXTURE_SHARED_ROLE_A,
    key: "test-shared-b",
    label: "TEST Shared 2",
    cardLast4: "2222",
  });

// ---------------------------------------------------------------------------
// Evidence helpers
// ---------------------------------------------------------------------------

const ABSENT_ACCOUNT: ReviewTranscriptFixtureAccountEvidence = Object.freeze({
  state: "absent",
  name: null,
  type: null,
  institutionId: null,
  providerDisplayName: null,
  cardLast4: null,
  spanTexts: [],
});

interface AccountSeed {
  readonly name: string;
  readonly type: AccountType;
  readonly providerDisplayName: string;
  readonly cardLast4?: string;
  readonly spanTexts: readonly string[];
}

function explicitAccount(
  seed: AccountSeed
): ReviewTranscriptFixtureAccountEvidence {
  return {
    state: "explicit",
    name: seed.name,
    type: seed.type,
    institutionId: null,
    providerDisplayName: seed.providerDisplayName,
    cardLast4: seed.cardLast4 ?? null,
    spanTexts: seed.spanTexts,
  };
}

export const QNB_ACCOUNT = explicitAccount({
  name: "QNB",
  type: "BANK",
  providerDisplayName: "QNB",
  spanTexts: ["QNB"],
});

export const WALLET_ACCOUNT = explicitAccount({
  name: "TEST Wallet",
  type: "DIGITAL_WALLET",
  providerDisplayName: "TEST Wallet",
  spanTexts: ["TEST Wallet"],
});

export const CARD_BANK_ACCOUNT = explicitAccount({
  name: "TEST Card Bank",
  type: "BANK",
  providerDisplayName: "TEST Card Bank",
  cardLast4: "1234",
  spanTexts: ["1234", "TEST Card Bank"],
});

export const CASH_ACCOUNT: ReviewTranscriptFixtureAccountEvidence = {
  state: "explicit",
  name: "Cash",
  type: "CASH",
  institutionId: null,
  providerDisplayName: null,
  cardLast4: null,
  spanTexts: ["cash"],
};

export const SHARED_ACCOUNT = explicitAccount({
  name: "TEST Shared",
  type: "BANK",
  providerDisplayName: "TEST Shared",
  spanTexts: ["TEST Shared"],
});

export function explicitCurrency(
  code: CurrencyType,
  spanTexts: readonly string[] = [code]
): ReviewTranscriptFixtureCurrencyEvidence {
  return {
    state: "explicit",
    statedCode: code,
    candidateCodes: [code],
    spanTexts,
  };
}

export const OMITTED_CURRENCY: ReviewTranscriptFixtureCurrencyEvidence =
  Object.freeze({
    state: "omitted",
    statedCode: null,
    candidateCodes: [],
    spanTexts: [],
  });

export const ARABIC_EGP: ReviewTranscriptFixtureCurrencyEvidence =
  explicitCurrency("EGP", ["جنيه"]);

export function unresolvedCurrency(
  state: Exclude<ReviewTranscriptFixtureCurrencyState, "omitted" | "explicit">,
  statedCode: string | null,
  candidateCodes: readonly CurrencyType[],
  spanTexts: readonly string[]
): ReviewTranscriptFixtureCurrencyEvidence {
  return { state, statedCode, candidateCodes, spanTexts };
}

export function draftAccount(
  name: string,
  type: AccountType,
  cardLast4?: string
): ReviewTranscriptFixtureAccountEvidence {
  return explicitAccount({
    name,
    type,
    providerDisplayName: name,
    cardLast4,
    spanTexts: cardLast4 === undefined ? [name] : [cardLast4, name],
  });
}

// ---------------------------------------------------------------------------
// Scenario builder (expectations derived once from the seeds)
// ---------------------------------------------------------------------------

const DATE = "2026-10-14";

export interface TransactionSeed {
  readonly ref: string;
  readonly amount: number;
  readonly kind: ReviewTranscriptFixtureKind;
  readonly counterparty: string | null;
  readonly description: string;
  readonly category: string;
  readonly currency: CurrencyType | null;
  readonly account: ReviewTranscriptFixtureAccountEvidence;
  readonly currencyEvidence?: ReviewTranscriptFixtureCurrencyEvidence;
  readonly suggestionRef?: string;
  readonly confidence?: number;
}

export function item(
  ref: string,
  amount: number,
  kind: ReviewTranscriptFixtureKind,
  counterparty: string,
  description: string,
  category: string,
  account: ReviewTranscriptFixtureAccountEvidence,
  currencyEvidence: ReviewTranscriptFixtureCurrencyEvidence
): TransactionSeed {
  return {
    ref,
    amount,
    kind,
    counterparty,
    description,
    category,
    currency: "EGP",
    account,
    currencyEvidence,
  };
}

function transaction(
  seed: TransactionSeed
): ReviewTranscriptFixtureTransaction {
  return {
    transactionRef: seed.ref,
    suggestionRef: seed.suggestionRef ?? null,
    amount: seed.amount,
    kind: seed.kind,
    counterparty: seed.counterparty,
    description: seed.description,
    preferredCategorySystemName: seed.category,
    categoryType: seed.kind,
    currency: seed.currency,
    date: DATE,
    confidenceScore: seed.confidence ?? 0.94,
    accountEvidence: seed.account,
    currencyEvidence:
      seed.currencyEvidence ??
      (seed.currency === null
        ? OMITTED_CURRENCY
        : explicitCurrency(seed.currency)),
  };
}

export interface ScenarioSeed {
  readonly id: string;
  readonly label: string;
  readonly transcript: string;
  readonly language: "en" | "ar";
  readonly seeds: readonly TransactionSeed[];
  readonly suggestions?: readonly ReviewTranscriptFixtureSuggestion[];
  readonly roles?: readonly ReviewTranscriptFixtureAccountRole[];
}

export function scenario(seed: ScenarioSeed): ReviewTranscriptFixtureScenario {
  const transactions = seed.seeds.map(transaction);
  return {
    id: seed.id,
    label: seed.label,
    transcript: seed.transcript,
    detectedLanguage: seed.language,
    transactions,
    suggestedAccounts: seed.suggestions ?? [],
    requiredAccountRoles: seed.roles ?? [],
    expectations: {
      rowCount: transactions.length,
      types: transactions.map((entry) => entry.kind),
      currencyStates: transactions.map((entry) =>
        entry.currencyEvidence.state === "explicit" ||
        entry.currencyEvidence.state === "omitted"
          ? "known"
          : "unconfirmed"
      ),
      accountEvidenceStates: transactions.map(
        (entry) => entry.accountEvidence.state
      ),
    },
  };
}

export function draftSuggestions(
  drafts: ReadonlyArray<{
    readonly ref: string;
    readonly name: string;
    readonly type: AccountType;
    readonly currency: CurrencyType;
    readonly cardLast4?: string;
    readonly transactionRefs: readonly string[];
  }>
): readonly ReviewTranscriptFixtureSuggestion[] {
  return drafts.map((draft) => ({
    suggestionRef: draft.ref,
    name: draft.name,
    type: draft.type,
    currency: draft.currency,
    institutionId: null,
    // Same grounded provider identity as `draftAccount()`: group admission
    // requires row evidence and suggestion evidence to agree on all identity
    // fields, including a null provider versus a named one.
    providerDisplayName: draft.name,
    cardLast4: draft.cardLast4 ?? null,
    senderNames: [],
    transactionRefs: draft.transactionRefs,
  }));
}

export { ABSENT_ACCOUNT };
