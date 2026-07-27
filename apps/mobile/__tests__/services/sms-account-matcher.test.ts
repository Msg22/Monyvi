import {
  fetchAccountsWithDetails,
  matchAccountCore,
  matchTransaction,
  matchTransactionsBatched,
  type AccountMatch,
  type AccountWithBankDetails,
  type MatchInput,
} from "../../services/sms-account-matcher";
import {
  LOCAL_SMS_FIXTURE_CORPUS,
  parseSmsWithLocalParser,
  type ReviewableTransaction,
} from "@monyvi/logic";

type TestTransaction = ReviewableTransaction & {
  readonly cardLast4?: string;
};

const E2E_LOCAL_PARSER_SAVEABLE_PROVIDER_IDS = new Set([
  "nbe",
  "qnb-egypt",
  "vodafone-cash",
]);

const E2E_PARSER_CATEGORIES = [
  { id: "cat-shopping", systemName: "shopping", displayName: "Shopping" },
  { id: "cat-salary", systemName: "salary", displayName: "Salary" },
  { id: "cat-other", systemName: "other", displayName: "Other" },
] as const;

const mockQueryOwned = jest.fn();
const mockQueryChildrenOfOwnedParents = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => ({
      query: jest.fn(() => ({
        fetch: jest.fn(() => Promise.resolve([])),
      })),
    })),
  },
}));

jest.mock("../../services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve("user-1"),
}));

jest.mock("../../services/user-data-access", () => ({
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
  queryChildrenOfOwnedParents: (...args: readonly unknown[]): unknown =>
    mockQueryChildrenOfOwnedParents(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sms-account-matcher - matchAccountCore", () => {
  const baseDate = new Date("2026-01-01T00:00:00Z");

  // Base accounts setup
  const accBank1: AccountWithBankDetails = {
    id: "acc_bank1",
    name: "CIB Account",
    currency: "EGP",
    isDefault: false,
    createdAt: baseDate,
    type: "BANK",
    smsSenderNames: ["CIB"],
    bankName: "Commercial International Bank",
    cardLast4: 1234,
  };

  const accBank2: AccountWithBankDetails = {
    id: "acc_bank2",
    name: "NBE Visa",
    currency: "USD",
    isDefault: true, // Used for Step 4
    createdAt: new Date(baseDate.getTime() + 1000), // Created later
    type: "BANK",
    smsSenderNames: ["NBE"],
    cardLast4: 5678,
  };

  const accBank3: AccountWithBankDetails = {
    id: "acc_bank3",
    name: "Banque Misr",
    currency: "EGP",
    isDefault: false,
    createdAt: new Date(baseDate.getTime() - 1000), // Created first (for Step 5)
    type: "BANK", // maps to Step 5 fallback
    smsSenderNames: [],
  };

  const accounts: AccountWithBankDetails[] = [accBank1, accBank2, accBank3];

  it("Step 1: Matches based on card last 4 AND sender match (highest confidence)", () => {
    const input: MatchInput = {
      senderDisplayName: "CIB-EGYPT", // Matches "CIB" bidirectionally
      cardLast4: "1234",
    };
    const result = matchAccountCore(input, accounts);
    expect(result.accountId).toBe("acc_bank1");
    expect(result.matchReason).toBe("card_last4");
  });

  it("leaves a card and sender match unresolved when its currency differs", () => {
    const result = matchAccountCore(
      {
        senderDisplayName: "CIB-EGYPT",
        cardLast4: "1234",
        currency: "USD",
      },
      [accBank1]
    );

    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 1: Matches parsed card digits with leading zeroes against stored integer digits", () => {
    const leadingZeroAccount: AccountWithBankDetails = {
      id: "acc_leading_zero",
      name: "CIB Zero Card",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      smsSenderNames: ["CIB"],
      bankName: "Commercial International Bank",
      cardLast4: 123,
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIB", cardLast4: "0123" },
      [leadingZeroAccount]
    );

    expect(result.accountId).toBe("acc_leading_zero");
    expect(result.matchReason).toBe("card_last4");
  });

  it("Step 1: Leaves duplicate card and sender matches unresolved", () => {
    const duplicateCardAccount: AccountWithBankDetails = {
      ...accBank1,
      id: "acc_bank1_duplicate_card",
      name: "CIB Secondary Card",
      createdAt: new Date(baseDate.getTime() + 1000),
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIB-EGYPT", cardLast4: "1234" },
      [accBank1, duplicateCardAccount]
    );

    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 1b: Leaves explicit card evidence unresolved when sender doesn't match", () => {
    const input: MatchInput = {
      senderDisplayName: "UNKNOWN SENDER xyz",
      cardLast4: "1234",
    };
    const result = matchAccountCore(input, accounts);
    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 1b: Falls back to a unique sender when the stored card suffix differs", () => {
    const result = matchAccountCore(
      { senderDisplayName: "NBE", cardLast4: "9999" },
      accounts
    );

    expect(result).toMatchObject({
      accountId: "acc_bank2",
      matchReason: "sms_sender",
    });
  });

  it("Step 1b: Leaves a mismatched card unresolved when the sender is ambiguous", () => {
    const duplicateSenderAccount: AccountWithBankDetails = {
      ...accBank2,
      id: "acc_bank2_secondary",
      name: "NBE Secondary",
      cardLast4: 4321,
    };

    const result = matchAccountCore(
      { senderDisplayName: "NBE", cardLast4: "9999" },
      [accBank2, duplicateSenderAccount]
    );

    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 2: Matches based on sender alone (bank_details / account name)", () => {
    const input: MatchInput = {
      senderDisplayName: "NBE",
      // No card last 4
    };
    const result = matchAccountCore(input, accounts);
    expect(result.accountId).toBe("acc_bank2");
    expect(result.matchReason).toBe("sms_sender");
  });

  it("leaves a sender-only match unresolved when its currency differs", () => {
    const result = matchAccountCore(
      { senderDisplayName: "NBE", currency: "EGP" },
      [accBank2]
    );

    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 2: Leaves the account unresolved when a sender matches multiple accounts", () => {
    const duplicateSenderAccount: AccountWithBankDetails = {
      ...accBank2,
      id: "acc_bank2_usd_secondary",
      name: "NBE Secondary",
      isDefault: false,
      cardLast4: 9012,
    };

    const result = matchAccountCore({ senderDisplayName: "NBE" }, [
      accBank2,
      duplicateSenderAccount,
    ]);

    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 2b: falls back to provider and account names when no sender rows are saved", () => {
    const accountWithoutSenderRows: AccountWithBankDetails = {
      id: "acc_provider_only",
      name: "CIB Savings",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      smsSenderNames: [],
      bankName: "CIB",
      cardLast4: 1234,
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIB-EGYPT", cardLast4: "1234" },
      [accountWithoutSenderRows]
    );

    expect(result.accountId).toBe("acc_provider_only");
    expect(result.matchReason).toBe("card_last4");
  });

  it("matches registry sender patterns from the saved institution id without editable sender chips", () => {
    const knownProviderAccount: AccountWithBankDetails = {
      id: "acc_cib",
      name: "Main",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      institutionId: "cib",
      smsSenderNames: [],
      bankName: "CIB",
      cardLast4: 1234,
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIBEGYPT", cardLast4: "1234", currency: "EGP" },
      [knownProviderAccount]
    );

    expect(result).toMatchObject({
      accountId: "acc_cib",
      matchReason: "card_last4",
    });
  });

  it("uses custom sender rows in addition to registry senders for known providers", () => {
    const knownProviderAccount: AccountWithBankDetails = {
      id: "acc_cib",
      name: "Main",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      institutionId: "cib",
      smsSenderNames: ["CIBCUSTOM"],
      bankName: "CIB",
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIBCUSTOM", currency: "EGP" },
      [knownProviderAccount]
    );

    expect(result).toMatchObject({
      accountId: "acc_cib",
      matchReason: "sms_sender",
    });
  });

  it("does not loosely match known-provider display snapshots as senders", () => {
    const knownProviderAccount: AccountWithBankDetails = {
      id: "acc_cib",
      name: "Main",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      institutionId: "cib",
      smsSenderNames: [],
      bankName: "CIB",
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIBStore", currency: "EGP" },
      [knownProviderAccount]
    );

    expect(result).toMatchObject({
      accountId: null,
      matchReason: "none",
    });
  });

  it("falls back to provider name when custom sender rows do not match", () => {
    const accountWithCustomSender: AccountWithBankDetails = {
      id: "acc_cib",
      name: "Main",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      smsSenderNames: ["CIBCUSTOM"],
      bankName: "CIB",
      cardLast4: 1234,
    };

    const result = matchAccountCore(
      { senderDisplayName: "CIB", cardLast4: "1234", currency: "EGP" },
      [accountWithCustomSender]
    );

    expect(result).toMatchObject({
      accountId: "acc_cib",
      matchReason: "card_last4",
    });
  });

  it("Step 3: Matches based on bank registry name and currency", () => {
    const input: MatchInput = {
      senderDisplayName: "BANQUEMISR", // Known financial sender mapped to "Banque Misr"
      currency: "EGP",
    };
    const result = matchAccountCore(input, accounts);
    expect(result.accountId).toBe("acc_bank3");
    expect(result.matchReason).toBe("bank_registry");
  });

  it("Step 3: prefers stable institution id when registry sender resolves the provider", () => {
    const renamedKnownProviderAccount: AccountWithBankDetails = {
      id: "acc_banque_misr",
      name: "Main",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      institutionId: "banque-misr",
      smsSenderNames: [],
    };

    const result = matchAccountCore(
      { senderDisplayName: "BANQUEMISR", currency: "EGP" },
      [renamedKnownProviderAccount]
    );

    expect(result).toMatchObject({
      accountId: "acc_banque_misr",
      matchReason: "sms_sender",
    });
  });

  it("Step 4: Falls back to default account if NO other match and not a known bank", () => {
    const input: MatchInput = {
      senderDisplayName: "RANDOM_STORE",
      currency: "USD",
    };
    const result = matchAccountCore(input, accounts);
    expect(result.accountId).toBe("acc_bank2"); // accBank2 is default
    expect(result.matchReason).toBe("default");
  });

  it("does not use a default account whose currency differs", () => {
    const result = matchAccountCore(
      { senderDisplayName: "RANDOM_STORE", currency: "EGP" },
      [accBank2]
    );

    expect(result).toEqual({
      accountId: null,
      accountName: null,
      matchReason: "none",
    });
  });

  it("Step 5: Returns 'none' if no default and no match (first_bank fallback removed)", () => {
    // Remove the default account and ensure they are sorted by createdAt ASC like fetchAccountsWithDetails does
    const accountsNoDefault = [accBank3, accBank1];
    const input: MatchInput = {
      senderDisplayName: "RANDOM_STORE",
    };
    const result = matchAccountCore(input, accountsNoDefault);
    // first_bank fallback was removed — user must explicitly select
    expect(result.accountId).toBe(null);
    expect(result.matchReason).toBe("none");
  });

  it("Returns 'none' if empty account list, or no rules apply", () => {
    const fallbackAccounts: AccountWithBankDetails[] = [
      {
        id: "acc_cash",
        name: "Cash",
        currency: "EGP",
        isDefault: false,
        createdAt: baseDate,
        type: "CASH",
        smsSenderNames: [],
      },
    ];

    const input: MatchInput = {
      senderDisplayName: "UNKNOWN",
    };
    const result = matchAccountCore(input, fallbackAccounts);
    expect(result.matchReason).toBe("none");

    // Also verify empty account list returns "none"
    const emptyResult = matchAccountCore(input, []);
    expect(emptyResult.matchReason).toBe("none");
    expect(emptyResult.accountId).toBe(null);
  });
});

describe("sms-account-matcher - fetchAccountsWithDetails", () => {
  it("pairs each bank account with its single bank details row", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const nbeAccount = {
      id: "acc_nbe",
      name: "E2E NBE Bank",
      currency: "EGP",
      isDefault: false,
      createdAt,
      type: "BANK",
      providerDisplayName: "NBE",
    };
    const qnbAccount = {
      id: "acc_qnb",
      name: "E2E QNB Bank",
      currency: "EGP",
      isDefault: false,
      createdAt: new Date(createdAt.getTime() + 1000),
      type: "BANK",
      providerDisplayName: "QNB",
    };
    const nbeDetails = {
      accountId: "acc_nbe",
      cardLast4: 4321,
    };
    const qnbDetails = {
      accountId: "acc_qnb",
      cardLast4: 5566,
    };
    const nbeSender = {
      accountId: "acc_nbe",
      senderName: "NBE",
    };
    const qnbSender = {
      accountId: "acc_qnb",
      senderName: "QNB",
    };

    mockQueryOwned.mockReturnValueOnce({
      fetch: jest.fn<
        Promise<ReadonlyArray<typeof nbeAccount | typeof qnbAccount>>,
        []
      >(() => Promise.resolve([nbeAccount, qnbAccount])),
    });
    mockQueryChildrenOfOwnedParents.mockReturnValueOnce({
      fetch: jest.fn<
        Promise<ReadonlyArray<typeof nbeDetails | typeof qnbDetails>>,
        []
      >(() => Promise.resolve([nbeDetails, qnbDetails])),
    });
    mockQueryChildrenOfOwnedParents.mockReturnValueOnce({
      fetch: jest.fn<
        Promise<ReadonlyArray<typeof nbeSender | typeof qnbSender>>,
        []
      >(() => Promise.resolve([nbeSender, qnbSender])),
    });

    const accounts = await fetchAccountsWithDetails("user-1", "BANK");

    expect(accounts).toHaveLength(2);
    expect(accounts.map((entry) => entry.cardLast4)).toEqual([4321, 5566]);
    expect(
      matchAccountCore(
        { senderDisplayName: "QNB", cardLast4: "5566", currency: "EGP" },
        accounts
      )
    ).toMatchObject({
      accountId: "acc_qnb",
      accountName: "E2E QNB Bank",
      matchReason: "card_last4",
    });
  });
});

describe("sms-account-matcher - source-aware transaction matching", () => {
  const baseDate = new Date("2026-01-01T00:00:00Z");

  const cashDefault: AccountWithBankDetails = {
    id: "acc_cash_default",
    name: "Cash",
    currency: "EGP",
    isDefault: true,
    createdAt: baseDate,
    type: "CASH",
    smsSenderNames: [],
  };

  const bankDefault: AccountWithBankDetails = {
    id: "acc_bank_default",
    name: "CIB Main",
    currency: "EGP",
    isDefault: true,
    createdAt: new Date(baseDate.getTime() + 1000),
    type: "BANK",
    smsSenderNames: [],
  };

  const bankRegular: AccountWithBankDetails = {
    id: "acc_bank_regular",
    name: "NBE",
    currency: "EGP",
    isDefault: false,
    createdAt: new Date(baseDate.getTime() + 2000),
    type: "BANK",
    smsSenderNames: [],
  };

  const walletDefault: AccountWithBankDetails = {
    id: "acc_wallet_default",
    name: "Vodafone wallet",
    currency: "EGP",
    isDefault: true,
    createdAt: new Date(baseDate.getTime() + 3000),
    type: "DIGITAL_WALLET",
    smsSenderNames: [],
  };

  function tx(overrides: Partial<TestTransaction> = {}): TestTransaction {
    return {
      amount: 100,
      currency: "EGP",
      type: "EXPENSE",
      date: baseDate,
      categoryId: "cat-1",
      categoryDisplayName: "Other",
      confidence: 0.9,
      originLabel: "UNKNOWN",
      source: "SMS",
      ...overrides,
    };
  }

  it("matches every local-parser E2E inbox suggestion to a seeded account", () => {
    const fixtures = LOCAL_SMS_FIXTURE_CORPUS.filter((fixture) =>
      E2E_LOCAL_PARSER_SAVEABLE_PROVIDER_IDS.has(fixture.providerId)
    );
    const candidatesByMessageId = new Map(
      fixtures.map((fixture) => [fixture.id, fixture])
    );
    const parserResult = parseSmsWithLocalParser({
      candidates: fixtures.map((fixture) => ({
        messageId: fixture.id,
        sender: fixture.sender,
        body: fixture.body,
        receivedAtMs: fixture.receivedAtMs,
        smsFingerprint: `sms-${fixture.id}`,
      })),
      categories: E2E_PARSER_CATEGORIES,
      supportedCurrencies: ["EGP"],
    });
    const seededAccounts: readonly AccountWithBankDetails[] = [
      cashDefault,
      {
        id: "acc_nbe",
        name: "E2E NBE Bank",
        currency: "EGP",
        isDefault: false,
        createdAt: baseDate,
        type: "BANK",
        institutionId: "nbe",
        smsSenderNames: ["NBE"],
        bankName: "NBE",
        cardLast4: 4321,
      },
      {
        id: "acc_qnb",
        name: "E2E QNB Bank",
        currency: "EGP",
        isDefault: false,
        createdAt: baseDate,
        type: "BANK",
        institutionId: "qnb-egypt",
        smsSenderNames: ["QNB"],
        bankName: "QNB",
        cardLast4: 5566,
      },
      {
        id: "acc_vodafone_cash",
        name: "Vodafone Cash Wallet",
        currency: "EGP",
        isDefault: false,
        createdAt: baseDate,
        type: "DIGITAL_WALLET",
        institutionId: "vodafone-cash",
        smsSenderNames: ["VodafoneCash"],
        bankName: "Vodafone Cash",
      },
    ];

    expect(parserResult.error).toBeUndefined();
    expect(parserResult.transactions.length).toBeGreaterThan(3);

    const missingAccountRows = parserResult.transactions.flatMap(
      (transaction) => {
        const fixture = candidatesByMessageId.get(transaction.messageId);
        const match = matchTransaction(
          tx({
            originLabel: fixture?.sender ?? "",
            cardLast4: transaction.cardLast4,
            currency: transaction.currency,
            type: transaction.type,
          }),
          seededAccounts
        );

        return match.accountId
          ? []
          : [
              {
                fixtureId: fixture?.id,
                sender: fixture?.sender,
                cardLast4: transaction.cardLast4,
                counterparty: transaction.counterparty,
              },
            ];
      }
    );

    expect(missingAccountRows).toEqual([]);
  });

  it("keeps SMS fallback bank-scoped and ignores a default cash account", () => {
    const result = matchTransaction(tx(), [cashDefault, bankRegular]);

    expect(result.accountId).toBe(null);
    expect(result.matchReason).toBe("none");
  });

  it("allows SMS fallback to a default bank account", () => {
    const result = matchTransaction(tx(), [cashDefault, bankDefault]);

    expect(result.accountId).toBe("acc_bank_default");
    expect(result.matchReason).toBe("default");
  });

  it("keeps known bank SMS fallback scoped away from a default wallet account", () => {
    const result = matchTransaction(tx({ originLabel: "CIB-EGYPT" }), [
      walletDefault,
      bankRegular,
    ]);

    expect(result.accountId).toBe(null);
    expect(result.matchReason).toBe("none");
  });

  it("keeps batched SMS review bank-scoped even when preloaded accounts include cash", async () => {
    const batches: Array<ReadonlyMap<number, AccountMatch>> = [];

    await matchTransactionsBatched(
      [tx()],
      "user-1",
      20,
      (batch) => batches.push(batch),
      [cashDefault, bankRegular]
    );

    expect(batches).toHaveLength(1);
    expect(batches[0].get(0)?.accountId).toBe(null);
    expect(batches[0].get(0)?.matchReason).toBe("none");
  });

  it("matches separate sender/card identities through separate bank accounts", async () => {
    const batches: Array<ReadonlyMap<number, AccountMatch>> = [];
    const qnbTransaction = {
      originLabel: "QNB",
      cardLast4: "5566",
    };

    await matchTransactionsBatched(
      [tx(qnbTransaction)],
      "user-1",
      20,
      (batch) => batches.push(batch),
      [
        cashDefault,
        {
          id: "acc_bank_nbe",
          name: "E2E NBE Bank",
          currency: "EGP",
          isDefault: false,
          createdAt: baseDate,
          type: "BANK",
          smsSenderNames: ["NBE"],
          bankName: "NBE",
          cardLast4: 4321,
        },
        {
          id: "acc_bank_qnb",
          name: "E2E QNB Bank",
          currency: "EGP",
          isDefault: false,
          createdAt: baseDate,
          type: "BANK",
          smsSenderNames: ["QNB"],
          bankName: "QNB",
          cardLast4: 5566,
        },
      ]
    );

    expect(batches).toHaveLength(1);
    expect(batches[0].get(0)).toMatchObject({
      accountId: "acc_bank_qnb",
      accountName: "E2E QNB Bank",
      matchReason: "card_last4",
    });
  });

  it("matches wallet SMS senders without bank details", () => {
    const wallet: AccountWithBankDetails = {
      id: "wallet-1",
      name: "Vodafone wallet",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "DIGITAL_WALLET",
      smsSenderNames: ["VFCash", "VodafoneCash"],
      bankName: "Vodafone Cash",
    };

    const result = matchTransaction(tx({ originLabel: "VodafoneCash" }), [
      cashDefault,
      bankRegular,
      wallet,
    ]);

    expect(result).toMatchObject({
      accountId: "wallet-1",
      accountName: "Vodafone wallet",
      matchReason: "sms_sender",
    });
  });

  it("checks every saved sender row for an account", () => {
    const bank: AccountWithBankDetails = {
      id: "bank-1",
      name: "CIB",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      smsSenderNames: ["CIB", "CIBEGYPT"],
      bankName: "CIB",
    };

    const result = matchTransaction(tx({ originLabel: "CIBEGYPT" }), [bank]);

    expect(result).toMatchObject({
      accountId: "bank-1",
      matchReason: "sms_sender",
    });
  });

  it("does not use loose provider matching when saved sender chips exist", () => {
    const bank: AccountWithBankDetails = {
      id: "bank-abc",
      name: "Bank ABC Account",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      smsSenderNames: ["abc"],
      bankName: "Bank ABC",
    };

    const result = matchTransaction(tx({ originLabel: "ABCStore" }), [bank]);

    expect(result).toMatchObject({
      accountId: null,
      matchReason: "none",
    });
  });

  it("keeps sender plus card last four ahead of sender-only matches", () => {
    const firstSenderMatch: AccountWithBankDetails = {
      id: "bank-sender-only",
      name: "CIB Old Card",
      currency: "EGP",
      isDefault: false,
      createdAt: baseDate,
      type: "BANK",
      smsSenderNames: ["CIB"],
      bankName: "CIB",
      cardLast4: 1111,
    };
    const cardMatch: AccountWithBankDetails = {
      id: "bank-card-match",
      name: "CIB New Card",
      currency: "EGP",
      isDefault: false,
      createdAt: new Date(baseDate.getTime() + 1000),
      type: "BANK",
      smsSenderNames: ["CIB"],
      bankName: "CIB",
      cardLast4: 2222,
    };

    const result = matchTransaction(
      tx({ originLabel: "CIB", cardLast4: "2222" }),
      [firstSenderMatch, cardMatch]
    );

    expect(result).toMatchObject({
      accountId: "bank-card-match",
      matchReason: "card_last4",
    });
  });

  it("uses a valid AI account id for voice transactions", () => {
    const result = matchTransaction(
      tx({ source: "VOICE", accountId: "acc_bank_regular" }),
      [cashDefault, bankRegular]
    );

    expect(result.accountId).toBe("acc_bank_regular");
    expect(result.matchReason).toBe("voice_ai");
  });

  it("allows voice AI selection to target non-bank accounts", () => {
    const result = matchTransaction(
      tx({ source: "VOICE", accountId: "acc_cash_default" }),
      [cashDefault, bankRegular]
    );

    expect(result.accountId).toBe("acc_cash_default");
    expect(result.matchReason).toBe("voice_ai");
  });

  it("falls voice transactions back to the global default account", () => {
    const result = matchTransaction(tx({ source: "VOICE" }), [
      cashDefault,
      bankRegular,
    ]);

    expect(result.accountId).toBe("acc_cash_default");
    expect(result.matchReason).toBe("default");
  });

  it("requires review when voice has no valid AI account and no default account", () => {
    const result = matchTransaction(
      tx({ source: "VOICE", accountId: "missing-account" }),
      [bankRegular]
    );

    expect(result.accountId).toBe(null);
    expect(result.matchReason).toBe("none");
  });
});
