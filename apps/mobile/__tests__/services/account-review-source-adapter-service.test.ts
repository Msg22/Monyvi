/**
 * #395 T014-M — mobile composition over the real pure normalizer.
 * The service under test is NOT mocked. T010/auth/platform boundaries only.
 * This is a tests-first file; production adapter source is a separate grant.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accountReviewSessionSchema,
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
  normalizeAccountReviewParserResult,
  type AccountReviewOwnedContext,
  type AccountReviewRow,
  type AccountReviewSession,
} from "@monyvi/logic";
import {
  createVoiceAccountReviewSession,
  createSmsAccountReviewSession,
} from "@/services/account-review-source-adapter-service";
import {
  ADAPTER_IDS, makeAdapterSnapshots,
  makeAdapterVoiceInput, makeAdapterSmsInput, makeAdapterTwoSmsInput,
  makeAdapterVoiceCashInput, makeAdapterAtmInput,
  makeAdapterSmsCashSourceInput, makeAdapterRepeatedVoiceInput,
  makeAdapterSmsOmittedCurrencyInput, makeSameOwnerChangedSnapshots,
  realNodeSha256,
} from "./account-review-source-adapter-fixtures";

const mockLoadSnapshots = jest.fn<Promise<AccountReviewOwnedContext>, []>();
const mockGetRequiredCurrentUserId = jest.fn<Promise<string>, []>();
const mockDigestStringAsync = jest.fn(
  (_algorithm: string, text: string): Promise<string> =>
    realNodeSha256.digestUtf8(text)
);

jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (): Promise<AccountReviewOwnedContext> =>
    mockLoadSnapshots(),
}));

jest.mock("@/services/user-data-access", () => ({
  getRequiredCurrentUserId: (): Promise<string> =>
    mockGetRequiredCurrentUserId(),
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockGetRequiredCurrentUserId().then((ownerId) => {
      if (ownerId !== expectedUserId) throw new Error("AUTH_SCOPE_CHANGED");
    }),
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (...args: readonly [string, string]): Promise<string> =>
    mockDigestStringAsync(...args),
}));

function requireRow(session: AccountReviewSession): AccountReviewRow {
  const first = session.rows[0];
  if (!first) throw new Error("Missing canonical review row");
  return first;
}

function checkUnselectedInitialSession(session: AccountReviewSession): void {
  expect(accountReviewSessionSchema.parse(session)).toEqual(session);
  expect(session.ownerId).toBe(ADAPTER_IDS.owner);
  expect(session.sessionId).toBe(ADAPTER_IDS.session);
  expect(session.revision).toBe("0");
  expect(session.operationGeneration).toBe("0");
  expect(session.saveIntent).toBeNull();
  expect(session.rows.every((row) => !row.selected)).toBe(true);
  expect(session.groups.every((group) => group.status === "pending")).toBe(true);
}

beforeEach(() => {
  mockGetRequiredCurrentUserId.mockReset();
  mockGetRequiredCurrentUserId.mockResolvedValue(ADAPTER_IDS.owner);
  mockLoadSnapshots.mockReset();
  mockLoadSnapshots.mockResolvedValue(makeAdapterSnapshots());
  mockDigestStringAsync.mockClear();
});

describe("#395 T014-M — one original parser success to one canonical review session", () => {
  it("produces a grounded Voice session with exact original finance, owner and group", async () => {
    const input = makeAdapterVoiceInput();
    const response = accountReviewVoiceResponseV2Schema.parse(input.providerResponse);
    expect(response.transactions).toHaveLength(1);
    const session = await createVoiceAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(1);
    expect(session.groups).toHaveLength(1);
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(ADAPTER_IDS.food);
    expect(row.accountEvidence.name).toBe("QNB");
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(row.toAccountEvidence).toBeNull();
    expect(row.assignment.state).toBe("suggested");
    expect(session.groups[0]?.linkedRowIds).toContain(row.rowId);
    expect(session).toEqual(await normalizeAccountReviewParserResult(input));
  });

  it("creates the SMS review only from the submitted original fingerprint and finance", async () => {
    const input = makeAdapterSmsInput();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await createSmsAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    expect(session.source).toBe("SMS");
    expect(session.rows).toHaveLength(1);
    const row = requireRow(session);
    if (row.source !== "SMS") throw new Error("Expected source SMS");
    expect(row.sourceFingerprint).toBe(ADAPTER_IDS.fingerprint);
    expect(row.transaction.smsFingerprint).toBe(ADAPTER_IDS.fingerprint);
    expect(row.transaction.rawSmsBody).toBe(input.submittedMessages[0]?.body);
    expect(row.transaction.categoryId).toBe(ADAPTER_IDS.shopping);
    expect(row.transaction.amount).toBe(50);
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(row.assignment.state).toBe("suggested");
    expect(session.groups[0]?.linkedRowIds).toContain(row.rowId);
    expect(session).toEqual(await normalizeAccountReviewParserResult(input));
  });

  it("uses the pinned owner-scoped context and the ZERO-argument T010 reader", async () => {
    const input = makeAdapterVoiceInput();
    const originalProvider = input.reviewAccountSnapshots.providerContext;
    expect(originalProvider).not.toHaveProperty("ownerId");
    expect(originalProvider.accounts[0]).not.toHaveProperty("isDefault");
    expect(originalProvider.accounts[0]).not.toHaveProperty("balance");
    const session = await createVoiceAccountReviewSession(input);
    expect(session.preferredCurrency).toBe("EGP");
    expect(mockLoadSnapshots).toHaveBeenCalledWith();
    expect(mockLoadSnapshots.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockGetRequiredCurrentUserId.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(session.ownerId).toBe(input.ownerId);
  });

  it("retains grounded Voice CASH instead of applying the ordinary SMS source filter", async () => {
    const input = makeAdapterVoiceCashInput();
    expect(accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await createVoiceAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    expect(session.groups).toHaveLength(1);
    expect(session.groups[0]?.type).toBe("CASH");
    const row = requireRow(session);
    expect(row.accountEvidence.type).toBe("CASH");
    expect(row.currency.state).toBe("known");
    expect(row.toAssignment).toBeNull();
    expect(row.selected).toBe(false);
  });

  it("keeps an ATM Cash destination proof separate from BANK source and account choice", async () => {
    const input = makeAdapterAtmInput();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await createSmsAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    const row = requireRow(session);
    expect(row.accountEvidence.name).toBe("QNB");
    expect(row.accountEvidence.type).toBe("BANK");
    expect(row.toAccountEvidence).toMatchObject({
      state: "explicit", name: "Cash", type: "CASH",
      candidateAccountIds: [ADAPTER_IDS.cash],
    });
    expect(row.toAssignment).toBeNull();
    expect(row.reviewReasons).toContain("cash_transfer_review");
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(ADAPTER_IDS.shopping);
  });

  it("does not accept Cash as ordinary SMS source or pick the Cash default", async () => {
    const input = makeAdapterSmsCashSourceInput();
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await createSmsAccountReviewSession(input);
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.currency.state).toBe("known");
    expect(row.accountEvidence.state).toBe("uncertain");
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expect(row.assignment.state).toBe("unresolved");
    expect(row.selected).toBe(false);
    expect(session.groups).toEqual([]);
  });
});

describe("#395 T014-M — first immutable session identity and completion", () => {
  it("preserves two valid identical Voice expenses as separate unselected row identities", async () => {
    const input = makeAdapterRepeatedVoiceInput();
    expect(accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    const session = await createVoiceAccountReviewSession(input);
    expect(session.rows).toHaveLength(2);
    expect(new Set(session.rows.map((row) => row.rowId)).size).toBe(2);
    expect(session.groups).toHaveLength(1);
    expect(session.groups[0]?.linkedRowIds).toEqual(expect.arrayContaining(
      session.rows.map((row) => row.rowId)
    ));
    expect(session.rows.every((row) => !row.selected)).toBe(true);
  });

  it("keeps final SMS batch membership and IDs stable across chunk order and retry keys", async () => {
    const input = makeAdapterTwoSmsInput();
    const initial = await createSmsAccountReviewSession(input);
    const response = accountReviewSmsResponseV2Schema.parse(input.providerResponse);
    const replay = await createSmsAccountReviewSession({
      ...input, requestKey: "transport-chunk-retry-2",
      financialRows: [...input.financialRows].reverse(),
      mappedTransactions: [...input.mappedTransactions].reverse(),
      submittedMessages: [...input.submittedMessages].reverse(),
      providerResponse: {
        ...response, transactions: [...response.transactions].reverse(),
      },
    });
    expect(initial.rows).toHaveLength(2);
    expect(replay.rows).toHaveLength(2);
    expect(initial.rows.map((row) => row.rowId).sort()).toEqual(
      replay.rows.map((row) => row.rowId).sort()
    );
    expect(initial.groups[0]?.evidenceKey).toBe(replay.groups[0]?.evidenceKey);
    expect(initial.groups[0]?.groupId).toBe(replay.groups[0]?.groupId);
    expect(initial.sessionId).toBe(ADAPTER_IDS.session);
    expect(new Set(initial.rows.map((row) => row.sourceFingerprint)).size).toBe(2);
    expect(replay.rows.every((row) => !row.selected)).toBe(true);
  });

  it("retains stable Voice IDs on a parser alias retry without reusing another recording", async () => {
    const input = makeAdapterVoiceInput();
    const initial = await createVoiceAccountReviewSession(input);
    const parsed = accountReviewVoiceResponseV2Schema.parse(input.providerResponse);
    const first = parsed.transactions[0];
    if (!first) throw new Error("Missing Voice alias row");
    const renamed = { ...first, transactionRef: "voice-alias-retry" };
    const response = {
      ...parsed, transactions: [renamed],
      suggestedAccounts: parsed.suggestedAccounts.map((group) => ({
        ...group, transactionRefs: [renamed.transactionRef],
      })),
    };
    const retry = await createVoiceAccountReviewSession({
      ...input, financialRows: [renamed], providerResponse: response,
      sourceRevision: "1",
    });
    const differentRecording = await createVoiceAccountReviewSession({
      ...input, sessionId: ADAPTER_IDS.secondSession,
    });
    expect(retry.rows[0]?.rowId).toBe(initial.rows[0]?.rowId);
    expect(retry.groups[0]?.evidenceKey).toBe(initial.groups[0]?.evidenceKey);
    expect(differentRecording.rows[0]?.rowId).not.toBe(initial.rows[0]?.rowId);
    expect(differentRecording.groups[0]?.groupId).not.toBe(initial.groups[0]?.groupId);
  });

  it("uses real SHA-256, never source text as a row/group identity key", async () => {
    const session = await createSmsAccountReviewSession(makeAdapterSmsInput());
    expect(await realNodeSha256.digestUtf8("adapter-sha-proof"))
      .toMatch(/^[0-9a-f]{64}$/);
    expect(session.groups[0]?.evidenceKey).toMatch(/^[0-9a-f]{64}$/);
    expect(session.rows[0]?.rowId).toMatch(/^[0-9a-f]{8}-/);
    expect(session.groups[0]?.evidenceKey).not.toContain("QNB purchase EGP 50");
    expect(mockDigestStringAsync.mock.calls.every(
      ([, input]) => !input.includes("QNB purchase EGP 50")
    )).toBe(true);
  });
});

describe("#395 T014-M — conservative old and malformed source evidence", () => {
  it("retains old-server Voice financial content with unconfirmed legacy currency", async () => {
    const input = makeAdapterVoiceInput();
    const original = accountReviewVoiceResponseV2Schema.parse(input.providerResponse);
    const legacy = {
      transcript: original.transcript,
      original_transcript: original.original_transcript,
      detected_language: original.detected_language,
      transactions: original.transactions,
    };
    const session = await createVoiceAccountReviewSession({
      ...input, providerResponse: legacy,
    });
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(ADAPTER_IDS.food);
    expect(row.currency).toMatchObject({
      state: "unconfirmed", reason: "legacy_unknown",
    });
    expect(row.assignment.state).toBe("unresolved");
    expect(row.selected).toBe(false);
    expect(session.groups).toEqual([]);
  });

  it("retains original SMS fingerprint/category on v1 or trusted local no-v2 evidence", async () => {
    const input = makeAdapterSmsInput();
    const session = await createSmsAccountReviewSession({
      ...input, providerResponse: { transactions: input.financialRows },
    });
    const row = requireRow(session);
    if (row.source !== "SMS") throw new Error("Expected original SMS");
    expect(row.transaction.amount).toBe(50);
    expect(row.sourceFingerprint).toBe(ADAPTER_IDS.fingerprint);
    expect(row.transaction.categoryId).toBe(ADAPTER_IDS.shopping);
    expect(row.currency).toMatchObject({ state: "unconfirmed", reason: "legacy_unknown" });
    expect(row.assignment.state).toBe("unresolved");
    expect(session.groups).toEqual([]);
  });

  it("keeps valid financial rows when v2 advisory has a noncanonical private field", async () => {
    const input = makeAdapterSmsInput();
    const parsed = accountReviewSmsResponseV2Schema.parse(input.providerResponse);
    const session = await createSmsAccountReviewSession({
      ...input, providerResponse: { ...parsed, privateCardData: "not-shared" },
    });
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.categoryId).toBe(ADAPTER_IDS.shopping);
    expect(row.reviewReasons).toContain("account_evidence_invalid");
    expect(row.currency.state).toBe("unconfirmed");
    expect(row.assignment.state).toBe("unresolved");
    expect(session.groups).toEqual([]);
  });
});

describe("#395 T014-M — current-owner and source scope guards", () => {
  it("rejects the wrong signed-in owner before releasing a session", async () => {
    mockGetRequiredCurrentUserId.mockResolvedValue(ADAPTER_IDS.otherOwner);
    await expect(createVoiceAccountReviewSession(makeAdapterVoiceInput()))
      .rejects.toThrow();
  });

  it("rejects an owner change after the awaited zero-argument T010 read", async () => {
    mockLoadSnapshots.mockImplementationOnce(() => {
      mockGetRequiredCurrentUserId.mockResolvedValue(ADAPTER_IDS.otherOwner);
      return Promise.resolve(makeAdapterSnapshots());
    });
    await expect(createVoiceAccountReviewSession(makeAdapterVoiceInput()))
      .rejects.toThrow();
    expect(mockLoadSnapshots).toHaveBeenCalledWith();
  });

  it("rejects an owner-switched current snapshot without trusting supplied input", async () => {
    mockLoadSnapshots.mockResolvedValue({
      ...makeAdapterSnapshots(), ownerId: ADAPTER_IDS.otherOwner,
    });
    await expect(createSmsAccountReviewSession(makeAdapterSmsInput()))
      .rejects.toThrow();
  });

  it("rejects stale owner-scoped input rather than refetching to mask mismatches", async () => {
    const input = makeAdapterVoiceInput();
    await expect(createVoiceAccountReviewSession({
      ...input, reviewAccountSnapshots: {
        ...input.reviewAccountSnapshots, ownerId: ADAPTER_IDS.otherOwner,
      },
    })).rejects.toThrow();
  });

  it("rejects inaccessible category UUID mappings without replacing parsed finance", async () => {
    const input = makeAdapterVoiceInput();
    await expect(createVoiceAccountReviewSession({
      ...input, categoryIdsBySystemName: new Map([
        ["food", ADAPTER_IDS.cash],
      ]),
    })).rejects.toThrow();
  });

  it("does not import or replay the Voice/SMS parser from the source adapter", () => {
    const source = readFileSync(join(
      __dirname, "../../services/account-review-source-adapter-service.ts"
    ), "utf8");
    expect(source).not.toMatch(
      /from\s+["'][^"']*(?:ai-voice-parser|ai-sms-parser|sms-parser-orchestrator)/
    );
    expect(source).not.toMatch(/(?:from|require\()["'][^"']*(?:@monyvi\/db|@nozbe\/)/);
    expect(source).not.toMatch(/(?:parseVoiceWithAi|parseSmsWithAi|parseSmsWithOrchestrator)\(/);
  });
});

describe("#395 T014-M — same-owner freshness cannot erase pinned finance", () => {
  it("keeps the captured Voice review when another owned account appears during processing", async () => {
    const input = makeAdapterVoiceInput();
    const fresh = makeSameOwnerChangedSnapshots("added");
    expect(fresh.ownerId).toBe(input.ownerId);
    expect(fresh.accounts).toHaveLength(input.reviewAccountSnapshots.accounts.length + 1);
    expect(fresh.providerContext.accounts).toHaveLength(fresh.accounts.length);
    mockLoadSnapshots.mockResolvedValue(fresh);

    const session = await createVoiceAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    expect(session).toEqual(await normalizeAccountReviewParserResult(input));
    expect(requireRow(session).transaction.categoryId).toBe(ADAPTER_IDS.food);
    expect(requireRow(session).transaction.amount).toBe(50);
    expect(session.groups[0]?.confirmedIdentityRevision).toBeNull();
    expect(mockLoadSnapshots).toHaveBeenCalledWith();
    expect(mockGetRequiredCurrentUserId.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("retains original SMS proof when same-owner name, provider, card, aliases and default change", async () => {
    const input = makeAdapterSmsInput();
    const fresh = makeSameOwnerChangedSnapshots("metadata");
    expect(fresh.ownerId).toBe(input.ownerId);
    expect(fresh.accounts.find((account) => account.id === ADAPTER_IDS.bank))
      .toMatchObject({
        name: "QNB updated", providerDisplayName: "QNB new",
        cardLast4: "4321", senderNames: ["QNB-new"], isDefault: true,
      });
    expect(fresh.providerContext.accounts[0]).not.toHaveProperty("isDefault");
    mockLoadSnapshots.mockResolvedValue(fresh);

    const session = await createSmsAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    expect(session).toEqual(await normalizeAccountReviewParserResult(input));
    const row = requireRow(session);
    expect(row.accountEvidence.name).toBe("QNB");
    expect(row.accountEvidence.providerDisplayName).toBe("QNB");
    expect(row.transaction.amount).toBe(50);
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(row.assignment.state).toBe("suggested");
    expect(session.groups[0]?.confirmedIdentityRevision).toBeNull();
    expect(row.selected).toBe(false);
  });

  it("uses captured EGP for actual SMS omission despite fresh same-owner preferred USD", async () => {
    const input = makeAdapterSmsOmittedCurrencyInput();
    const fresh = makeSameOwnerChangedSnapshots("preferred");
    expect(input.reviewAccountSnapshots.preferredCurrency).toBe("EGP");
    expect(fresh.ownerId).toBe(input.ownerId);
    expect(fresh.preferredCurrency).toBe("USD");
    expect(fresh.providerContext.preferredCurrency).toBe("USD");
    expect(accountReviewSmsResponseV2Schema.safeParse(input.providerResponse).success)
      .toBe(true);
    mockLoadSnapshots.mockResolvedValue(fresh);

    const session = await createSmsAccountReviewSession(input);
    checkUnselectedInitialSession(session);
    expect(session).toEqual(await normalizeAccountReviewParserResult(input));
    expect(session.preferredCurrency).toBe("EGP");
    const row = requireRow(session);
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.currency).toBe("EGP");
    expect(row.currency).toEqual({
      state: "known", code: "EGP", origin: "preferred_omission",
    });
    expect(row.assignment.state).toBe("unresolved");
    expect(row.selected).toBe(false);
    expect(session.groups).toEqual([]);
  });
});
