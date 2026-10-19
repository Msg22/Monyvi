/**
 * #395 review transcript fixtures — scenario grounding, runtime gates, setup.
 *
 * Uses the REAL builder, REAL canonical normalizer/resolver, and the real
 * launch/setup services over synthetic owned data. Only auth/DB boundaries are
 * mocked; normalizer/resolver/group building are never mocked.
 */

import { createHash } from "node:crypto";
import {
  accountReviewRequestContextSchema,
  normalizeAccountReviewParserResult,
  resolveAccountReviewSession,
  type AccountReviewOwnedContext,
  type AccountReviewSession,
  type Sha256Provider,
  type VoiceReviewNormalizationInput,
} from "@monyvi/logic";
import type { AccountFormData } from "../../validation/account-validation";
import type { CreateAccountResult } from "../../services/account-service";
import type { AccountReviewLocalAccountSnapshot } from "../../services/account-review-read-model-service";
import type { ReviewTranscriptFixturesContext } from "../../services/review-transcript-fixtures-context-service";

import { REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS } from "../../dev/review-transcript-fixtures/scenarios";
import { buildVoiceReviewNormalizationInput } from "../../dev/review-transcript-fixtures/voice-normalization";
import {
  findRoleAccountId,
  listReviewTranscriptFixtureScenarios,
  REVIEW_TRANSCRIPT_FIXTURE_SCENARIO_IDS,
} from "../../dev/review-transcript-fixtures/catalog";

let mockUuidCounter = 0;
const mockCreateSession = jest.fn<
  Promise<AccountReviewSession>,
  [VoiceReviewNormalizationInput]
>();
const mockCreateAccount = jest.fn<
  Promise<CreateAccountResult>,
  [string, AccountFormData]
>();
const mockAssertUser = jest.fn<Promise<void>, [string]>();
const mockLoadContext = jest.fn<Promise<ReviewTranscriptFixturesContext>, []>();

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => {
    mockUuidCounter += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter).padStart(12, "0")}`;
  },
}));
jest.mock("../../services/account-review-source-adapter-service", () => ({
  createVoiceAccountReviewSession: (
    input: VoiceReviewNormalizationInput
  ): Promise<AccountReviewSession> => mockCreateSession(input),
}));
jest.mock("../../services/account-balance-command-production", () => {
  const { createHash: createNodeHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    productionFinancialActionHashProvider: {
      digestUtf8: (text: string): Promise<string> =>
        Promise.resolve(
          createNodeHash("sha256").update(text, "utf8").digest("hex")
        ),
    },
  };
});
jest.mock("../../services/user-data-access", () => ({
  getRequiredCurrentUserId: (): Promise<string> =>
    Promise.resolve("00000000-0000-4000-8000-000000000101"),
  assertExpectedCurrentUser: (userId: string): Promise<void> =>
    mockAssertUser(userId),
}));
jest.mock("../../services/review-transcript-fixtures-context-service", () => ({
  loadReviewTranscriptFixturesContext:
    (): Promise<ReviewTranscriptFixturesContext> => mockLoadContext(),
}));
jest.mock("../../services/account-service", () => ({
  createAccountForUser: (
    userId: string,
    form: AccountFormData
  ): Promise<CreateAccountResult> => mockCreateAccount(userId, form),
  CREATE_ACCOUNT_ERROR_CODES: { VALIDATION_FAILED: "validation_failed" },
}));

import {
  buildReviewTranscriptFixtureLaunch,
  isReviewTranscriptFixturesRuntimeAvailable,
} from "../../services/review-transcript-fixtures-launcher-service";
import { prepareReviewTranscriptFixtureAccounts } from "../../services/review-transcript-fixtures-setup-service";

const OWNER = "00000000-0000-4000-8000-000000000101";

const ids = {
  bank: "00000000-0000-4000-8000-000000000102",
  cardBank: "00000000-0000-4000-8000-000000000103",
  wallet: "00000000-0000-4000-8000-000000000104",
  sharedA: "00000000-0000-4000-8000-000000000105",
  sharedB: "00000000-0000-4000-8000-000000000106",
  cash: "00000000-0000-4000-8000-000000000107",
  food: "00000000-0000-4000-8000-000000000201",
  shopping: "00000000-0000-4000-8000-000000000202",
  salary: "00000000-0000-4000-8000-000000000203",
  bills: "00000000-0000-4000-8000-000000000204",
  health: "00000000-0000-4000-8000-000000000205",
  other: "00000000-0000-4000-8000-000000000206",
} as const;

const realNodeSha256: Sha256Provider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};

/** `process.env.NODE_ENV` is readonly in the Node typings. */
function setNodeEnv(value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
    return;
  }
  Reflect.set(process.env, "NODE_ENV", value);
}

function makeSnapshots(
  preferredCurrency: AccountReviewOwnedContext["preferredCurrency"] = "EGP"
): AccountReviewOwnedContext {
  const accounts: AccountReviewOwnedContext["accounts"] = [
    {
      id: ids.bank,
      name: "TEST Bank",
      type: "BANK",
      currency: "EGP",
      institutionId: null,
      providerDisplayName: "QNB",
      cardLast4: null,
      senderNames: [],
      isDefault: false,
    },
    {
      id: ids.cardBank,
      name: "TEST Card Bank",
      type: "BANK",
      currency: "EGP",
      institutionId: null,
      providerDisplayName: "TEST Card Bank",
      cardLast4: "1234",
      senderNames: [],
      isDefault: false,
    },
    {
      id: ids.wallet,
      name: "TEST Wallet",
      type: "DIGITAL_WALLET",
      currency: "USD",
      institutionId: null,
      providerDisplayName: "TEST Wallet",
      cardLast4: null,
      senderNames: [],
      isDefault: false,
    },
    {
      id: ids.sharedA,
      name: "TEST Shared",
      type: "BANK",
      currency: "EGP",
      institutionId: null,
      providerDisplayName: "TEST Shared",
      cardLast4: "1111",
      senderNames: [],
      isDefault: false,
    },
    {
      id: ids.sharedB,
      name: "TEST Shared 2",
      type: "BANK",
      currency: "EGP",
      institutionId: null,
      providerDisplayName: "TEST Shared",
      cardLast4: "2222",
      senderNames: [],
      isDefault: false,
    },
    {
      id: ids.cash,
      name: "Cash",
      type: "CASH",
      currency: "EGP",
      institutionId: null,
      providerDisplayName: null,
      cardLast4: null,
      senderNames: [],
      isDefault: true,
    },
  ];
  const providerContext = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institutionId: account.institutionId,
      providerDisplayName: account.providerDisplayName,
      cardLast4: account.cardLast4,
      senderNames: [...account.senderNames],
    })),
  });
  return {
    ownerId: OWNER,
    preferredCurrency,
    accounts,
    providerContext,
  };
}

const CATEGORY_IDS: ReadonlyMap<string, string> = new Map([
  ["food", ids.food],
  ["shopping", ids.shopping],
  ["salary", ids.salary],
  ["bills", ids.bills],
  ["health", ids.health],
  ["other", ids.other],
]);

const FALLBACKS = new Map<"EXPENSE" | "INCOME", string>([
  ["EXPENSE", "food"],
  ["INCOME", "salary"],
]);

function sessionIdFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 300).padStart(12, "0")}`;
}

function requestKeyFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 500).padStart(12, "0")}`;
}

async function resolveScenario(
  scenario: (typeof REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS)[number],
  index: number,
  snapshots: AccountReviewOwnedContext = makeSnapshots()
): Promise<AccountReviewSession> {
  const input = buildVoiceReviewNormalizationInput({
    scenario,
    ownerId: snapshots.ownerId,
    sessionId: sessionIdFor(index),
    requestKey: requestKeyFor(index),
    reviewAccountSnapshots: snapshots,
    categoryIdsBySystemName: CATEGORY_IDS,
    fallbackCategorySystemNameByType: FALLBACKS,
    hashProvider: realNodeSha256,
  });
  const normalized = await normalizeAccountReviewParserResult(input);
  return resolveAccountReviewSession({
    session: normalized,
    accountSnapshots: snapshots,
  });
}

describe("#395 review transcript fixture catalogue", () => {
  it("ships 19 unique scenarios with in-bounds, grounded seeds", () => {
    expect(REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS).toHaveLength(19);
    expect(new Set(REVIEW_TRANSCRIPT_FIXTURE_SCENARIO_IDS).size).toBe(19);
    for (const scenario of REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS) {
      expect(scenario.transcript.trim().length).toBeGreaterThan(0);
      expect(scenario.expectations.rowCount).toBe(scenario.transactions.length);
    }
  });

  it.each(
    REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS.map((scenario, index) => ({
      scenario,
      index,
    }))
  )(
    "$scenario.id grounds every span and keeps TEST labels",
    async ({ scenario, index }) => {
      const session = await resolveScenario(scenario, index);
      expect(session.rows).toHaveLength(scenario.expectations.rowCount);
      expect(session.source).toBe("VOICE");
      expect(session.ownerId).toBe(OWNER);
      expect(session.rows.map((row) => row.transaction.type)).toEqual(
        scenario.expectations.types
      );
      expect(
        session.rows.map((row) =>
          row.currency.state === "known" ? "known" : "unconfirmed"
        )
      ).toEqual(scenario.expectations.currencyStates);
      expect(session.rows.map((row) => row.accountEvidence.state)).toEqual(
        scenario.expectations.accountEvidenceStates
      );

      const ownedIds = new Set(makeSnapshots().accounts.map((a) => a.id));
      for (const row of session.rows) {
        expect(row.source).toBe("VOICE");
        expect(row.toAccountEvidence).toBeNull();
        if (row.source === "VOICE") {
          expect(row.transaction.note.startsWith("[TEST] ")).toBe(true);
          if (row.transaction.counterparty !== undefined) {
            expect(row.transaction.counterparty.startsWith("[TEST] ")).toBe(
              true
            );
          }
        }
        if (row.assignment.state === "existing") {
          expect(ownedIds.has(row.assignment.accountId)).toBe(true);
        }
        const currencySpans =
          row.currency.state === "unconfirmed"
            ? row.currency.evidenceSpans
            : [];
        for (const span of [
          ...row.accountEvidence.evidenceSpans,
          ...currencySpans,
        ]) {
          expect(span.sourceRef).toBe(requestKeyFor(index));
          expect(span.field).toBe("transcript");
          expect(scenario.transcript.slice(span.start, span.end)).toBe(
            span.text
          );
        }
      }
      for (const group of session.groups) {
        expect(group.name.startsWith("TEST")).toBe(true);
      }
    }
  );

  it("keeps shared draft membership exact and suggestions TEST-prefixed", async () => {
    const session = await resolveById("voice-shared-drafts-qnb-cib");
    expect(session.rows).toHaveLength(6);
    expect(session.groups).toHaveLength(2);
    const qnb = session.groups.find((group) => group.name === "TEST NEW QNB");
    const cib = session.groups.find((group) => group.name === "TEST CIB");
    expect(qnb?.linkedRowIds).toHaveLength(3);
    expect(cib?.linkedRowIds).toHaveLength(1);
    const suggested = session.rows.filter(
      (row) => row.assignment.state === "suggested"
    );
    expect(suggested).toHaveLength(4);
    expect(
      suggested.every(
        (row) =>
          row.assignment.state === "suggested" &&
          row.assignment.confirmation === "pending"
      )
    ).toBe(true);
    // The evidence-absent row still auto-links the default account, and the
    // ambiguous-currency row stays unresolved without inventing an account.
    expect(session.rows[4]?.assignment.state).toBe("existing");
    expect(session.rows[5]?.currency.state).toBe("unconfirmed");
    expect(session.rows[5]?.assignment).toMatchObject({
      state: "unresolved",
      reasonCode: "currency_confirmation_needed",
    });
  });

  it("splits a same-name draft bank by card suffix and currency", async () => {
    const session = await resolveById("voice-draft-identity-split");
    expect(session.rows).toHaveLength(3);
    expect(session.groups).toHaveLength(3);
    expect(session.groups.map((group) => group.linkedRowIds.length)).toEqual([
      1, 1, 1,
    ]);
    const linkedKeys = session.groups.flatMap((group) => [
      ...group.linkedRowIds,
    ]);
    expect(new Set(linkedKeys).size).toBe(3);
    expect(
      session.rows.every(
        (row) =>
          row.assignment.state === "suggested" &&
          row.assignment.confirmation === "pending"
      )
    ).toBe(true);
    expect(
      session.rows.map((row) =>
        row.currency.state === "known" ? row.currency.code : null
      )
    ).toEqual(["EGP", "EGP", "USD"]);
  });

  it("resolves Arabic explicit جنيه rows as known EGP", async () => {
    for (const id of [
      "voice-arabic-junaih-groceries",
      "voice-arabic-junaih-salary-rent",
      "voice-arabic-junaih-fuel-mobile",
    ]) {
      const session = await resolveById(id);
      expect(session.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of session.rows) {
        expect(row.currency).toMatchObject({ state: "known", code: "EGP" });
        expect(row.assignment).toMatchObject({
          state: "existing",
          accountId: ids.bank,
        });
      }
    }
  });

  it("isolates cards by suffix and mixed currencies by code", async () => {
    const card = await resolveById("voice-bank-card-expense-egp");
    expect(card.rows[0]?.assignment).toMatchObject({
      state: "existing",
      accountId: ids.cardBank,
      origin: "exact",
    });
    expect(card.rows[0]?.assignment).not.toMatchObject({ accountId: ids.bank });

    const split = await resolveById("voice-split-currency");
    expect(split.rows[0]?.assignment).toMatchObject({
      state: "existing",
      accountId: ids.bank,
    });
    // Same provider, but USD has no eligible QNB account.
    expect(split.rows[1]?.currency).toMatchObject({
      state: "known",
      code: "USD",
    });
    expect(split.rows[1]?.assignment.state).toBe("unresolved");
    expect(split.rows[2]?.assignment).toMatchObject({
      state: "existing",
      accountId: ids.wallet,
    });
  });

  it("renders every bulk row and both shared-bank candidates", async () => {
    const bulk = await resolveById("voice-bulk-long-decimals");
    expect(bulk.rows).toHaveLength(9);
    expect(bulk.rows.every((row) => row.assignment.state === "existing")).toBe(
      true
    );

    const shared = await resolveById("voice-shared-bank-ambiguous");
    expect(shared.rows[0]?.assignment).toMatchObject({
      state: "unresolved",
      reasonCode: "account_match_ambiguous",
    });
    expect(
      shared.rows[0]?.assignment.state === "unresolved"
        ? [...shared.rows[0].assignment.candidateAccountIds].sort()
        : []
    ).toEqual([ids.sharedA, ids.sharedB].sort());
  });

  it("keeps unsupported XYZ grounded and unresolved", async () => {
    const session = await resolveById("voice-unsupported-xyz");
    expect(session.rows[0]?.currency.state).toBe("unconfirmed");
    expect(session.rows[0]?.assignment).toMatchObject({
      state: "unresolved",
      reasonCode: "currency_confirmation_needed",
    });
  });

  it("honors a captured non-EGP preferred currency for omitted rows", async () => {
    const usdSnapshots = makeSnapshots("USD");
    const index = REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS.findIndex(
      (scenario) => scenario.id === "voice-preferred-omission-egp"
    );
    const scenario = REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS[index];
    if (!scenario) throw new Error("missing_preferred_omission_scenario");
    const session = await resolveScenario(scenario, index, usdSnapshots);
    const row = session.rows[0];
    if (!row) throw new Error("missing_preferred_omission_row");

    // Both the review read model and the mapped transaction must carry the
    // captured USD preference rather than the EGP default.
    expect(row.currency).toMatchObject({ state: "known", code: "USD" });
    expect(row.transaction.currency).toBe("USD");
    // The EGP-only QNB account and EGP default must not absorb a USD row.
    expect(row.assignment.state).toBe("unresolved");
    expect(makeSnapshots("USD").accounts).toEqual(makeSnapshots().accounts);
  });

  it("never invents account ids when the owner has no matching account", async () => {
    const snapshots = makeSnapshots();
    const empty: AccountReviewOwnedContext = {
      ...snapshots,
      accounts: [],
      providerContext: accountReviewRequestContextSchema.parse({
        reviewContractVersion: "account-review/v2",
        preferredCurrency: "EGP",
        accounts: [],
      }),
    };
    const scenario = listReviewTranscriptFixtureScenarios().find(
      (item) => item.id === "voice-bank-expense-egp"
    );
    if (!scenario) throw new Error("missing_bank_scenario");
    const session = await resolveScenario(scenario, 0, empty);
    expect(session.rows[0]?.assignment).toMatchObject({
      state: "unresolved",
      reasonCode: "account_needed",
    });
  });
});

async function resolveCanonicalVoiceSession(
  input: VoiceReviewNormalizationInput
): Promise<AccountReviewSession> {
  const normalized = await normalizeAccountReviewParserResult(input);
  return resolveAccountReviewSession({
    session: normalized,
    accountSnapshots: input.reviewAccountSnapshots,
  });
}

async function resolveById(id: string): Promise<AccountReviewSession> {
  const index = REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS.findIndex(
    (scenario) => scenario.id === id
  );
  const scenario = REVIEW_TRANSCRIPT_FIXTURE_SCENARIOS[index];
  if (!scenario) throw new Error(`missing_scenario:${id}`);
  return resolveScenario(scenario, index);
}

describe("#395 review transcript fixture runtime gate", () => {
  const globalGate = globalThis as { __DEV__?: boolean };
  const originalDev = globalGate.__DEV__;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    globalGate.__DEV__ = originalDev;
    setNodeEnv(originalNodeEnv);
  });

  it("is unavailable outside a real dev build", () => {
    globalGate.__DEV__ = false;
    expect(isReviewTranscriptFixturesRuntimeAvailable()).toBe(false);
  });

  it("is unavailable in production even when __DEV__ is set", () => {
    globalGate.__DEV__ = true;
    setNodeEnv("production");
    expect(isReviewTranscriptFixturesRuntimeAvailable()).toBe(false);
  });

  it("fails closed before session work when the runtime is unavailable", async () => {
    globalGate.__DEV__ = false;
    const result = await buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-bank-expense-egp",
      context: {
        ownerId: OWNER,
        preferredCurrency: "EGP",
        accounts: [],
        providerContext: accountReviewRequestContextSchema.parse({
          reviewContractVersion: "account-review/v2",
          preferredCurrency: "EGP",
          accounts: [],
        }),
        categoryIdsBySystemName: CATEGORY_IDS,
        categoryDisplayNamesBySystemName: new Map(),
        fallbackCategorySystemNameByType: FALLBACKS,
        categories: [],
      },
    });
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "runtime_unavailable",
      session: null,
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe("#395 review transcript fixture launch identity", () => {
  const globalGate = globalThis as { __DEV__?: boolean };
  const originalDev = globalGate.__DEV__;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    globalGate.__DEV__ = true;
    setNodeEnv("test");
    mockUuidCounter = 0;
    jest.clearAllMocks();
    mockCreateSession.mockImplementation((input) =>
      resolveCanonicalVoiceSession(input)
    );
  });

  afterEach(() => {
    globalGate.__DEV__ = originalDev;
    setNodeEnv(originalNodeEnv);
  });

  const context = (): ReviewTranscriptFixturesContext => {
    const snapshots = makeSnapshots();
    return {
      ...snapshots,
      categoryIdsBySystemName: CATEGORY_IDS,
      categoryDisplayNamesBySystemName: new Map(),
      fallbackCategorySystemNameByType: FALLBACKS,
      categories: [],
    };
  };

  it("uses a fresh UUID request key and session per launch", async () => {
    const first = await buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-bank-expense-egp",
      context: context(),
    });
    const second = await buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-bank-expense-egp",
      context: context(),
    });
    const firstInput = mockCreateSession.mock.calls[0]?.[0];
    const secondInput = mockCreateSession.mock.calls[1]?.[0];
    expect(first.status).toBe("launched");
    expect(second.status).toBe("launched");
    expect(firstInput?.requestKey).not.toBe(secondInput?.requestKey);
    expect(firstInput?.sessionId).not.toBe(secondInput?.sessionId);
  });

  it("rejects any parallel launch while one scenario is in flight", async () => {
    let signalEntered: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockCreateSession.mockImplementationOnce(async (input) => {
      signalEntered();
      await gate;
      return resolveCanonicalVoiceSession(input);
    });
    const first = buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-bank-expense-egp",
      context: context(),
    });
    await entered;
    const second = await buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-wallet-expense-usd",
      context: context(),
    });
    expect(second).toMatchObject({
      status: "unavailable",
      reason: "already_launching",
    });
    // The first factory is still gated, so the second admission was truly
    // refused while a launch was in flight.
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toMatchObject({ status: "launched" });
  });

  it("refuses a changed owner before building a session", async () => {
    const changed: ReviewTranscriptFixturesContext = {
      ...context(),
      ownerId: "00000000-0000-4000-8000-000000000999",
    };
    const result = await buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-bank-expense-egp",
      context: changed,
    });
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "owner_changed",
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe("#395 review transcript fixture role matching", () => {
  it("requires the declared card suffix", () => {
    const role = {
      key: "card",
      label: "TEST Card Bank",
      accountType: "BANK" as const,
      currency: "EGP" as const,
      providerDisplayName: "TEST Card Bank",
      cardLast4: "1234",
    };
    const wrongCard = [
      {
        id: "a",
        name: "TEST Card Bank",
        type: "BANK" as const,
        currency: "EGP" as const,
        providerDisplayName: "TEST Card Bank",
        cardLast4: "9999",
      },
    ];
    expect(findRoleAccountId(role, wrongCard)).toBeNull();
    expect(
      findRoleAccountId(role, [
        ...wrongCard,
        { ...wrongCard[0], id: "b", cardLast4: "1234" },
      ])
    ).toBe("b");
  });
});

describe("#395 review transcript fixture setup", () => {
  const globalGate = globalThis as { __DEV__?: boolean };
  const originalDev = globalGate.__DEV__;

  type AccountRow = ReviewTranscriptFixturesContext["accounts"][number];

  let accounts: AccountRow[];
  let createCalls: number;

  const contextWith = (
    rows: readonly AccountRow[]
  ): ReviewTranscriptFixturesContext => ({
    ownerId: OWNER,
    preferredCurrency: "EGP",
    accounts: rows,
    providerContext: accountReviewRequestContextSchema.parse({
      reviewContractVersion: "account-review/v2",
      preferredCurrency: "EGP",
      accounts: rows.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        institutionId: account.institutionId,
        providerDisplayName: account.providerDisplayName,
        cardLast4: account.cardLast4,
        senderNames: [...account.senderNames],
      })),
    }),
    categoryIdsBySystemName: CATEGORY_IDS,
    categoryDisplayNamesBySystemName: new Map(),
    fallbackCategorySystemNameByType: FALLBACKS,
    categories: [],
  });

  const createdRow = (
    form: AccountFormData,
    id: string
  ): AccountReviewLocalAccountSnapshot => ({
    id,
    name: form.name,
    type: form.accountType,
    currency: form.currency,
    providerDisplayName: form.providerDisplayName ?? null,
    cardLast4: form.cardLast4 ?? null,
    institutionId: form.institutionId ?? null,
    senderNames: [],
    isDefault: false,
  });

  beforeEach(() => {
    globalGate.__DEV__ = true;
    accounts = [
      {
        id: ids.bank,
        name: "TEST Bank",
        type: "BANK",
        currency: "EGP",
        providerDisplayName: "QNB",
        cardLast4: null,
        institutionId: null,
        senderNames: [],
        isDefault: true,
      },
    ];
    createCalls = 0;
    mockLoadContext.mockImplementation(() =>
      Promise.resolve(contextWith(accounts))
    );
    mockAssertUser.mockResolvedValue(undefined);
    mockCreateAccount.mockImplementation((_owner: string, form) => {
      createCalls += 1;
      const created = createdRow(
        form,
        `00000000-0000-4000-8000-${String(900 + createCalls).padStart(12, "0")}`
      );
      accounts = [...accounts, created];
      return Promise.resolve({ success: true, accountId: created.id });
    });
  });

  afterEach(() => {
    globalGate.__DEV__ = originalDev;
  });

  it("creates safe prerequisites once, then reports idempotent existing roles", async () => {
    const first = await prepareReviewTranscriptFixtureAccounts();
    expect(first.status).toBe("prepared");
    // Bank is pre-existing; the other four roles are created, not re-created.
    const statuses = first.roles.map((role) => role.status);
    expect(statuses.filter((status) => status === "existing")).toHaveLength(1);
    expect(statuses.filter((status) => status === "created")).toHaveLength(4);
    expect(createCalls).toBe(4);
    for (const call of mockCreateAccount.mock.calls) {
      expect(call[1].balance).toBe("0");
      expect(call[1].defaultIntent).toBe(false);
    }
    // Default/preferred metadata of the pre-existing account stays untouched.
    expect(accounts[0]).toMatchObject({ id: ids.bank, isDefault: true });
    expect(mockCreateAccount).not.toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({ defaultIntent: true })
    );

    const second = await prepareReviewTranscriptFixtureAccounts();
    expect(second.status).toBe("prepared");
    expect(second.roles.every((role) => role.status === "existing")).toBe(true);
    expect(createCalls).toBe(4);
  });

  it("blocks with no primary account and creates nothing", async () => {
    accounts = [];
    const result = await prepareReviewTranscriptFixtureAccounts();
    expect(result).toMatchObject({
      status: "blocked",
      reason: "no_primary_account",
    });
    expect(createCalls).toBe(0);
  });

  it("does not treat a same-provider wrong-card account as the card role", async () => {
    accounts = [
      {
        id: ids.cardBank,
        name: "TEST Card Bank",
        type: "BANK",
        currency: "EGP",
        providerDisplayName: "TEST Card Bank",
        cardLast4: "9999",
        institutionId: null,
        senderNames: [],
        isDefault: true,
      },
    ];
    await prepareReviewTranscriptFixtureAccounts();
    const cardRoleCall = mockCreateAccount.mock.calls.find(
      (call) =>
        (call[1] as { readonly cardLast4?: string }).cardLast4 === "1234"
    );
    expect(cardRoleCall).toBeDefined();
  });
});
