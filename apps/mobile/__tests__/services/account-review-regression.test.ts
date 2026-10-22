/**
 * #395 T074 / M16+M20: genuine one-request Voice parser to canonical review
 * commands. Real Node SQLite categories, parser, source adapter, reducer and
 * Voice command bridge. Only external auth/provider/read-model are injected.
 *
 * Other T074 physical expiry, namespace, dependency and recovery proofs already
 * have dedicated non-overlapping SQLite suites (see validation report).
 */
import type { Session } from "@supabase/supabase-js";
import { database, type Category } from "@monyvi/db";
import { Q, type Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import {
  REVIEW_WIRE_IDS,
  makeVoiceV1Response,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import {
  explicitVoiceResponse,
  unmatchedVoiceResponse,
  PARSER_TEST_CATEGORY_IDS,
  voiceOptions,
  makeReviewAccountSnapshots,
} from "./account-review-parser-test-fixtures";
import type { AccountReviewAccountSnapshots } from "../../services/account-review-read-model-service";
import {
  isVoiceParserError,
  parseVoiceWithAi,
  type AiVoiceParserOptions,
} from "../../services/ai-voice-parser-service";

const mockNetworkInvoke = jest.fn<
  Promise<{ readonly data: unknown; readonly error: null }>,
  [
    name: string,
    options: { readonly body?: unknown; readonly signal?: AbortSignal },
  ]
>();
const mockReadOwnedAccounts = jest.fn<
  Promise<AccountReviewAccountSnapshots>,
  []
>();
let mockActorId: string = REVIEW_WIRE_IDS.ownerId;
const mockStableAuth: Session = {
  access_token: "t074-synthetic-only",
  refresh_token: "t074-synthetic-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: REVIEW_WIRE_IDS.ownerId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-14T00:00:00.000Z",
  },
};

// The categories passed to the actual parser are real Category models, not
// fabricated mocks of buildCategoryMap/parseCategory or mocked normalizer IDs.
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Adapter({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("expo-crypto", () => {
  const crypto =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    randomUUID: (): string => crypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, text: string): Promise<string> => {
      if (algorithm !== "SHA-256")
        throw new Error("unexpected_review_sha256_algorithm");
      return Promise.resolve(
        crypto.createHash("sha256").update(text, "utf8").digest("hex")
      );
    },
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockActorId),
  getStableAuthSession: (): Promise<{
    readonly data: { readonly session: Session };
    readonly error: null;
  }> => Promise.resolve({ data: { session: mockStableAuth }, error: null }),
  supabase: {
    functions: {
      invoke: (
        name: string,
        options: { readonly body?: unknown; readonly signal?: AbortSignal }
      ): ReturnType<typeof mockNetworkInvoke> =>
        mockNetworkInvoke(name, options),
    },
  },
}));
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (ownerId: string): Promise<void> =>
    mockActorId === ownerId
      ? Promise.resolve()
      : Promise.reject(new Error("AUTH_SCOPE_CHANGED")),
  getRequiredCurrentUserId: (): Promise<string> => Promise.resolve(mockActorId),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (): ReturnType<
    typeof mockReadOwnedAccounts
  > => mockReadOwnedAccounts(),
}));
jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLedger = jest.requireMock<{
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}>("@monyvi/db");
import { executeVoiceAccountReviewCommand } from "../../services/account-review-voice-command-service";

async function options(reviewMode: boolean): Promise<AiVoiceParserOptions> {
  const records = await database
    .get<Category>("categories")
    .query(Q.where("user_id", REVIEW_WIRE_IDS.ownerId))
    .fetch();
  if (records.length === 0) throw new Error("missing_real_category_models");
  return {
    ...voiceOptions(reviewMode),
    categoryRecords: records,
  };
}

function requireVoiceSession(
  value: Awaited<ReturnType<typeof parseVoiceWithAi>>
): AccountReviewSession {
  if (
    isVoiceParserError(value) ||
    !("reviewSession" in value) ||
    !value.reviewSession
  )
    throw new Error("expected_real_complete_voice_review_session");
  return accountReviewSessionSchema.parse(value.reviewSession);
}

function withCurrentScope(
  session: AccountReviewSession,
  extra: Pick<AccountReviewCommand, "kind"> & Record<string, unknown>
): AccountReviewCommand {
  // Use the real closed command schema for each transition below.
  const base = {
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
  };
  return accountReviewCommandSchema.parse({ ...base, ...extra });
}

async function review(
  session: AccountReviewSession,
  command: AccountReviewCommand
): ReturnType<typeof executeVoiceAccountReviewCommand> {
  return executeVoiceAccountReviewCommand({
    session,
    command,
    accountSnapshots: makeReviewAccountSnapshots(),
    nextUndoToken: null,
    undo: null,
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockActorId = REVIEW_WIRE_IDS.ownerId;
  mockReadOwnedAccounts.mockResolvedValue(makeReviewAccountSnapshots());
  await mockLedger.__adapter.initializingPromise;
  await database.write(async (): Promise<void> => {
    await database.unsafeResetDatabase();
  });
  // The real parser's category context must be genuinely owned by the same
  // synthetic actor as the captured Voice context, not an unrelated fixture.
  const category = database.get<Category>("categories").prepareCreate((row) => {
    row._raw.id = PARSER_TEST_CATEGORY_IDS.food;
    row.userId = REVIEW_WIRE_IDS.ownerId;
    row.type = "EXPENSE";
    row.deleted = false;
    row.displayName = "Food";
    row.systemName = "food";
    row.isSystem = false;
    row.isHidden = false;
    row.isInternal = false;
    row.icon = "wallet-outline";
    row.iconLibrary = "Ionicons";
    row.level = 0;
    row.usageCount = 0;
  });
  await database.write(async (): Promise<void> => {
    await database.batch(category);
  });
});

describe("#395 T074 cross-boundary regression, M16/M20 provider usage", () => {
  it("T074-V01 one genuine provider call then confirm, edit and correct a shared Voice group without another request", async () => {
    mockNetworkInvoke.mockResolvedValueOnce({
      data: unmatchedVoiceResponse(),
      error: null,
    });
    const result = await parseVoiceWithAi(await options(true));
    const first = requireVoiceSession(result);
    const original = first.rows[0];
    const group = first.groups[0];
    if (!original || !group || group.type === null)
      throw new Error("missing_grounded_cib_group");
    expect(group.status).toBe("pending");
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);

    const confirmed = await review(
      first,
      withCurrentScope(first, {
        kind: "confirm_group",
        groupId: group.groupId,
        expectedGroupRevision: group.revision,
      })
    );
    expect(confirmed.effect).toBe("session_only");
    expect(confirmed.reasonCodes).toEqual([]);
    const afterConfirm = confirmed.state.groups[0];
    if (!afterConfirm || afterConfirm.type === null)
      throw new Error("missing_confirmed_group");
    expect(afterConfirm.status).toBe("confirmed");
    const edited = await review(
      confirmed.state,
      withCurrentScope(confirmed.state, {
        kind: "edit_group",
        groupId: afterConfirm.groupId,
        expectedGroupRevision: afterConfirm.revision,
        reconfirm: true,
        identity: {
          name: "CIB Salary Review",
          type: afterConfirm.type,
          institutionId: afterConfirm.institutionId,
          providerDisplayName: afterConfirm.providerDisplayName,
          cardLast4: afterConfirm.cardLast4,
          senderNames: afterConfirm.senderNames,
        },
      })
    );
    expect(edited.effect).toBe("session_only");
    expect(edited.reasonCodes).toEqual([]);

    const chosenRow = edited.state.rows.find(
      (row) => row.rowId === original.rowId
    );
    if (!chosenRow) throw new Error("group_edit_removed_source_row");
    const currency = await review(
      edited.state,
      withCurrentScope(edited.state, {
        kind: "confirm_row_currency",
        rowId: chosenRow.rowId,
        expectedRowRevision: chosenRow.revision,
        currency: "USD",
      })
    );
    expect(currency.effect).toBe("session_only");
    expect(currency.reasonCodes).toEqual([]);
    const final = accountReviewSessionSchema.parse(currency.state);
    const finalRow = final.rows.find((row) => row.rowId === original.rowId);
    expect(finalRow?.currency).toEqual({
      state: "known",
      code: "USD",
      origin: "user",
    });
    expect(finalRow?.transaction.amount).toBe(original.transaction.amount);
    expect(finalRow?.amountDecimal).toBe(original.amountDecimal);
    expect(finalRow?.sourceRef).toBe(original.sourceRef);
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);
  });

  it("T074-V02 original absent account evidence selects the genuine owned Cash default; explicit Bank choice remains local", async () => {
    const base = explicitVoiceResponse();
    const response = {
      ...base,
      suggestedAccounts: [],
      transactions: base.transactions.map((row) => ({
        ...row,
        suggestionRef: null,
        currency: null,
        accountEvidence: {
          state: "absent" as const,
          name: null,
          type: null,
          institutionId: null,
          providerDisplayName: null,
          cardLast4: null,
          evidenceSpans: [],
          candidateAccountIds: [],
        },
        currencyEvidence: {
          state: "omitted" as const,
          statedCode: null,
          candidateCodes: [],
          evidenceSpans: [],
        },
      })),
    };
    mockNetworkInvoke.mockResolvedValueOnce({ data: response, error: null });
    const initial = requireVoiceSession(
      await parseVoiceWithAi(await options(true))
    );
    const row = initial.rows[0];
    if (!row) throw new Error("missing_default_eligible_voice_row");
    expect(row.accountEvidence.state).toBe("absent");
    expect(row.assignment).toMatchObject({
      state: "existing",
      origin: "default",
      accountId: REVIEW_WIRE_IDS.cashAccountId,
    });
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);

    const updated = await review(
      initial,
      withCurrentScope(initial, {
        kind: "choose_row_account",
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        accountId: REVIEW_WIRE_IDS.bankAccountId,
      })
    );
    expect(updated.effect).toBe("session_only");
    expect(updated.reasonCodes).toEqual([]);
    expect(updated.state.rows[0]?.assignment).toMatchObject({
      state: "existing",
      origin: "user",
      accountId: REVIEW_WIRE_IDS.bankAccountId,
    });
    expect(updated.state.rows[0]?.transaction.amount).toBe(50);
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);
  });

  it("T074-V03 one malformed currency advisory remains unresolved until a real local correction, never a second Gemini request", async () => {
    const base = explicitVoiceResponse();
    mockNetworkInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        suggestedAccounts: [],
        transactions: base.transactions.map((row) => ({
          ...row,
          suggestionRef: null,
          currency: null,
          currencyEvidence: {
            state: "conflicting" as const,
            statedCode: null,
            candidateCodes: ["EGP", "USD"],
            evidenceSpans: [],
          },
        })),
      },
      error: null,
    });
    const original = requireVoiceSession(
      await parseVoiceWithAi(await options(true))
    );
    const row = original.rows[0];
    if (!row) throw new Error("missing_conflicting_currency_row");
    expect(row.currency.state).toBe("unconfirmed");
    expect(row.selected).toBe(false);
    const decision = await review(
      original,
      withCurrentScope(original, {
        kind: "confirm_row_currency",
        rowId: row.rowId,
        expectedRowRevision: row.revision,
        currency: "EGP",
      })
    );
    expect(decision.effect).toBe("session_only");
    expect(decision.reasonCodes).toEqual([]);
    expect(decision.state.rows[0]?.currency).toEqual({
      state: "known",
      code: "EGP",
      origin: "user",
    });
    expect(decision.state.rows[0]?.transaction.amount).toBe(50);
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);
  });

  it("T074-V04 one old v1 request stays v1, one independently requested v2 adds review; local group action never makes a third request", async () => {
    mockNetworkInvoke.mockResolvedValueOnce({
      data: makeVoiceV1Response(),
      error: null,
    });
    const oldResult = await parseVoiceWithAi(await options(false));
    if (isVoiceParserError(oldResult))
      throw new Error("genuine_legacy_voice_parse_failed");
    expect(oldResult.transactions).toHaveLength(1);
    expect(oldResult.transactions[0]?.amount).toBe(50);
    expect(oldResult).not.toHaveProperty("reviewSession");
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);

    mockNetworkInvoke.mockResolvedValueOnce({
      data: unmatchedVoiceResponse(),
      error: null,
    });
    const latest = requireVoiceSession(
      await parseVoiceWithAi(await options(true))
    );
    const group = latest.groups[0];
    if (!group) throw new Error("v2_group_missing");
    const decision = await review(
      latest,
      withCurrentScope(latest, {
        kind: "confirm_group",
        groupId: group.groupId,
        expectedGroupRevision: group.revision,
      })
    );
    expect(decision.effect).toBe("session_only");
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(2);
    expect(mockNetworkInvoke.mock.calls.map((call) => call[0])).toEqual([
      "parse-voice",
      "parse-voice",
    ]);
  });

  it("T074-V05 logout during the owned snapshot read cannot publish a Voice review or replay the provider request", async () => {
    mockNetworkInvoke.mockResolvedValueOnce({
      data: unmatchedVoiceResponse(),
      error: null,
    });
    mockReadOwnedAccounts.mockImplementationOnce(() => {
      mockActorId = "00000000-0000-4000-8000-000000000999";
      return Promise.resolve(makeReviewAccountSnapshots());
    });
    const result = await parseVoiceWithAi(await options(true));
    expect(isVoiceParserError(result)).toBe(true);
    expect(result).not.toHaveProperty("reviewSession");
    expect(mockNetworkInvoke).toHaveBeenCalledTimes(1);
    expect(mockReadOwnedAccounts).toHaveBeenCalledTimes(1);
  });
});
