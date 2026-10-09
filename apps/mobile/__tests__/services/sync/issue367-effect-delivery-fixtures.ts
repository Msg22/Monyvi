/**
 * #367 effect delivery and pending financial-root collision.
 *
 * Real syncDatabase, configuration, pull helpers, Watermelon synchronize,
 * SQLite, financial commands, outcome handling, and reconciliation.
 * Network responses are scripted. The database singleton and native adapters
 * are bound to the disposable test runtime; unrelated legacy-Metals repairs
 * are isolated as in the existing #255 SQLite suite.
 *
 * Direct-helper probes distinguish conversion defects from missing routing.
 * No historical-repair marker, old-checkpoint backfill, device, or real
 * Supabase backend is exercised. No execution result is claimed here.
 */
import { createHash } from "node:crypto";

import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  CurrencyType,
  FinancialActionGroup,
  Transaction,
} from "@monyvi/db";
import {
  canonicalizeFinancialActionEnvelope,
  serializeCanonicalJsonValue,
  type CanonicalJsonValue,
  type FinancialActionEnvelopeV1,
} from "@monyvi/logic";
import { hashFinancialActionEnvelope } from "../../../../../packages/logic/src/financial-actions";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.unmock("@nozbe/watermelondb/sync");

// Bind the singleton used by production financial services to the same real
// database passed to syncDatabase. Do not import the production DB initializer.
jest.mock("@monyvi/db", () => {
  const { Database: ActualDatabase, Model: ActualModel } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../../packages/db/src/schema")
  >("../../../../../packages/db/src/schema");
  const namedModels: Record<string, typeof ActualModel> = {};
  for (const name of [
    "Account",
    "AccountFinancialEffect",
    "FinancialActionGroup",
    "Transaction",
    "Transfer",
    "RecurringPayment",
    "Asset",
    "AssetMetal",
    "MetalHoldingState",
    "MetalActionEvidence",
    "MetalLifecycleEvent",
    "MetalRateReference",
    "Profile",
  ]) {
    const exported = jest.requireActual<Record<string, typeof ActualModel>>(
      `../../../../../packages/db/src/models/${name}`
    );
    const model = exported[name];
    if (typeof model !== "function") {
      throw new Error(`issue367_fixture_model_missing:${name}`);
    }
    namedModels[name] = model;
  }
  const byTable = new Map<string, typeof ActualModel>();
  Object.values(namedModels).forEach((model) =>
    byTable.set(model.table, model)
  );
  const modelClasses = Object.keys(schema.tables).map((table) => {
    class EmptyFixtureModel extends ActualModel {
      static table = table;
    }
    return byTable.get(table) ?? EmptyFixtureModel;
  });
  const adapter = new Adapter({
    schema,
    dbName: "file:issue367-effect-delivery?mode=memory&cache=shared",
  });
  return {
    ...namedModels,
    schema,
    database: new ActualDatabase({ adapter, modelClasses }),
    __adapter: adapter,
  };
});

// Execute SHA-256, rather than returning a dummy digest, when production
// reconciliation verifies the canonical account/effect evidence.
jest.mock("expo-crypto", () => {
  const crypto =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, value: string): Promise<string> => {
      if (algorithm !== "SHA-256") {
        throw new Error("issue367_fixture_hash_algorithm");
      }
      return Promise.resolve(
        crypto.createHash("sha256").update(value, "utf8").digest("hex")
      );
    },
    randomUUID: (): string => crypto.randomUUID(),
  };
});

jest.mock("../../../services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("11111111-1111-4111-8111-111111111111"),
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (...args: readonly unknown[]): unknown => mockRpc(...args),
  },
}));
jest.mock("../../../services/legacy-metal-add-repair-service", () => ({
  repairLegacyMetalAdds: (): Promise<{
    repaired: number;
    skipped: ReadonlyArray<{ actionId: string; reason: string }>;
  }> => Promise.resolve({ repaired: 0, skipped: [] }),
}));
jest.mock("../../../services/legacy-metal-edit-repair-service", () => ({
  repairLegacyMetalEdits: (): Promise<{
    repaired: number;
    skipped: ReadonlyArray<{ actionId: string; reason: string }>;
  }> => Promise.resolve({ repaired: 0, skipped: [] }),
}));

import { syncDatabase } from "../../../services/sync";
import { synchronize } from "@nozbe/watermelondb/sync";
import { pullMetalDedicatedTable } from "../../../services/sync/pull-strategies";
import { productionAccountBalanceCommandService } from "../../../services/account-balance-command-production";
import {
  getFinancialActionGroup,
  markFinancialActionGroupSyncPending,
  recordFinancialActionGroupServerOutcome,
  type FinancialActionLinkedOperationPlan,
} from "../../../services/financial-action-foundation-repository";
import { productionFinancialActionReconciliationService } from "../../../services/financial-action-reconciliation-production";

interface FixtureDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}
const { database, __adapter: adapter } =
  jest.requireMock<FixtureDatabaseModule>("@monyvi/db");

const USER = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const CATEGORY = "33333333-3333-4333-8333-333333333333";
const ACTION = "44444444-4444-4444-8444-444444444444";
const EFFECT = "55555555-5555-4555-8555-555555555555";
const TRANSACTION = "66666666-6666-4666-8666-666666666666";
const REMOTE_ROOT = "77777777-7777-4777-8777-777777777777";
const NEXT_ACTION = "44444444-4444-4444-8444-444444444445";
const NEXT_EFFECT = "55555555-5555-4555-8555-555555555556";
const NEXT_TRANSACTION = "66666666-6666-4666-8666-666666666667";
const NEXT_ROOT = "77777777-7777-4777-8777-777777777778";
const WINNER_ACTION = "88888888-8888-4888-8888-888888888888";
const WINNER_EFFECT = "99999999-9999-4999-8999-999999999999";
const CREATED = "2026-10-07T10:00:00.000Z";
const UPDATED = "2026-10-07T10:00:00.123456Z";
const COMPENSATED = "2026-10-07T11:00:00.456Z";
const UPPER = "2026-10-07T12:00:00.000Z";
const UPPER_2 = "2026-10-07T14:00:00.000Z";
const CHECKPOINT = "__watermelon_last_pulled_at";

type Row = Record<string, unknown>;
type JsonObject = Readonly<Record<string, CanonicalJsonValue>>;

interface Page {
  readonly data: readonly Row[] | null;
  readonly count: number | null;
  readonly error: { readonly message: string } | null;
}
interface Chain {
  readonly select: (
    columns: string,
    options?: { readonly count?: string }
  ) => Chain;
  readonly eq: (...args: readonly unknown[]) => Chain;
  readonly gt: (...args: readonly unknown[]) => Chain;
  readonly lte: (...args: readonly unknown[]) => Chain;
  readonly or: (...args: readonly unknown[]) => Chain;
  readonly order: (...args: readonly unknown[]) => Chain;
  readonly limit: (...args: readonly unknown[]) => Chain;
  readonly in: (...args: readonly unknown[]) => Chain;
  readonly update: (...args: readonly unknown[]) => Chain;
  readonly upsert: (rows: unknown) => Promise<{
    readonly data: null;
    readonly error: null;
  }>;
  readonly then: (
    resolve: (page: Page) => unknown,
    reject?: (error: unknown) => unknown
  ) => Promise<unknown>;
}
interface ActionFixture {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly payloadJson: string;
  readonly payloadHash: string;
  readonly effectId: string;
  readonly transactionId: string;
  readonly amountMinorUnits: string;
  readonly currency: CurrencyType;
  readonly acceptedRevision: string;
}

const mockFrom = jest.fn();
const mockRpc = jest.fn();
let pages = new Map<string, readonly Page[]>();
let upper = UPPER;
let financialOutcome: JsonObject | null = null;
let financialRpcInputs: Array<Readonly<Record<string, unknown>>> = [];
let writes: Array<{ readonly table: string; readonly rows: unknown }> = [];

function chainFor(table: string): Chain {
  let projection = "*";
  let exactCount = false;
  let isWrite = false;
  const chain: Chain = {
    select: (columns, options): Chain => {
      projection = columns;
      exactCount = options?.count === "exact";
      return chain;
    },
    eq: (): Chain => chain,
    gt: (): Chain => chain,
    lte: (): Chain => chain,
    or: (): Chain => chain,
    order: (): Chain => chain,
    limit: (): Chain => chain,
    in: (): Chain => chain,
    update: (...args): Chain => {
      isWrite = true;
      writes.push({ table, rows: args });
      return chain;
    },
    upsert: (rows): Promise<{ data: null; error: null }> => {
      writes.push({ table, rows });
      return Promise.resolve({ data: null, error: null });
    },
    then: (resolve, reject): Promise<unknown> =>
      Promise.resolve()
        .then((): Page => {
          if (isWrite) return { data: [], count: null, error: null };
          const [next, ...remaining] = pages.get(table) ?? [];
          pages.set(table, remaining);
          const response = next ?? { data: [], count: 0, error: null };
          return {
            ...response,
            count: exactCount ? response.count : null,
            data:
              response.data?.map((record) =>
                Object.fromEntries(
                  Object.entries(record).filter(
                    ([key]) =>
                      !key.endsWith("_text") || projection.includes(`${key}:`)
                  )
                )
              ) ?? null,
          };
        })
        .then(resolve, reject),
  };
  return chain;
}

function stage(table: string, ...rows: readonly Row[]): void {
  pages.set(table, [{ data: rows, count: rows.length, error: null }]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
const hashProvider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(sha256(value)),
};

async function actionFixture(
  amountMinorUnits = "2500",
  expectedRevision = "1",
  currency: CurrencyType = "EGP",
  ids = {
    actionId: ACTION,
    effectId: EFFECT,
    transactionId: TRANSACTION,
  }
): Promise<ActionFixture> {
  const amount = BigInt(amountMinorUnits);
  const envelope = canonicalizeFinancialActionEnvelope({
    accountGuards: [{ accountId: ACCOUNT, expectedRevision }],
    actionId: ids.actionId,
    domain: "transactions",
    domainReferenceId: ids.transactionId,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: CREATED,
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT,
          amountMinorUnits,
          currency,
          effectId: ids.effectId,
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              accountId: ACCOUNT,
              amountMinorUnits: (amount < 0n ? -amount : amount).toString(),
              categoryId: CATEGORY,
              counterparty: null,
              createdAt: CREATED,
              currency,
              date: "2026-10-07",
              deleted: false,
              id: ids.transactionId,
              isDraft: false,
              linkedAssetId: null,
              linkedDebtId: null,
              linkedRecurringId: null,
              note: null,
              smsFingerprint: null,
              source: "MANUAL",
              type: amount < 0n ? "EXPENSE" : "INCOME",
            },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [ids.transactionId],
      operationCode: "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: USER,
  });
  const hashed = await hashFinancialActionEnvelope(envelope, hashProvider);
  return {
    envelope,
    payloadJson: hashed.canonicalText,
    payloadHash: hashed.payloadHash,
    effectId: ids.effectId,
    transactionId: ids.transactionId,
    amountMinorUnits,
    currency,
    acceptedRevision: (BigInt(expectedRevision) + 1n).toString(),
  };
}

function accountRow(
  balance: number,
  revision: string,
  currency: CurrencyType = "EGP",
  updatedAt = UPDATED
): Row {
  return {
    id: ACCOUNT,
    user_id: USER,
    name: "Effect delivery fixture",
    type: "CASH",
    currency,
    balance,
    financial_revision: Number(revision),
    financial_revision_text: revision,
    is_default: true,
    institution_id: null,
    provider_display_name: null,
    created_at: CREATED,
    updated_at: updatedAt,
    deleted: false,
  };
}

function staleOutcome(actionId = ACTION): JsonObject {
  const effectBody = {
    acceptedRevision: "2",
    actionId: WINNER_ACTION,
    amountMinorUnits: "1000",
    effectId: WINNER_EFFECT,
    kind: "transaction.create",
  };
  const canonical = {
    accountId: ACCOUNT,
    balanceMinorUnits: "11000",
    canonicalActionId: WINNER_ACTION,
    canonicalRevision: "2",
    currency: "EGP",
    effectChain: [
      {
        ...effectBody,
        effectEvidenceHash: sha256(serializeCanonicalJsonValue(effectBody)),
      },
    ],
  };
  return {
    actionId,
    canonicalAccounts: [
      {
        ...canonical,
        canonicalEvidenceHash: sha256(
          serializeCanonicalJsonValue({ ...canonical, userId: USER })
        ),
      },
    ],
    canonicalHoldingActionId: null,
    canonicalHoldingEvidenceHash: null,
    canonicalHoldingRevision: null,
    code: "ACCOUNT_REVISION_STALE",
    staleAccountIds: [ACCOUNT],
    status: "stale",
  };
}

function rootRow(
  action: ActionFixture,
  id = REMOTE_ROOT,
  outcome: JsonObject | null = null,
  updatedAt = UPDATED
): Row {
  const resolvedOutcome = outcome ?? {
    actionId: action.envelope.actionId,
    accountRevisions: [
      {
        accountId: ACCOUNT,
        revision: action.acceptedRevision,
      },
    ],
    effectiveEventId: null,
    holdingRevision: null,
    serverAcceptedAt: CREATED,
    status: "accepted",
  };
  const guards = JSON.stringify(action.envelope.accountGuards);
  const serializedOutcome = serializeCanonicalJsonValue(resolvedOutcome);
  return {
    id,
    user_id: USER,
    action_id: action.envelope.actionId,
    domain: "transactions",
    kind: "create",
    domain_reference_id: action.transactionId,
    payload_json: action.payloadJson,
    payload_json_text: action.payloadJson,
    payload_hash: action.payloadHash,
    account_guards_json: action.envelope.accountGuards,
    account_guards_json_text: guards,
    outcome_json: resolvedOutcome,
    outcome_json_text: serializedOutcome,
    state: outcome === null ? "accepted" : "reconciled",
    server_outcome: outcome === null ? "accepted" : "stale",
    rejection_code: outcome === null ? null : "account_revision_stale",
    created_at: CREATED,
    updated_at: updatedAt,
    deleted: false,
  };
}

function effectRow(
  action: ActionFixture,
  compensatedAt: string | null = null,
  updatedAt = UPDATED
): Row {
  return {
    id: action.effectId,
    user_id: USER,
    account_id: ACCOUNT,
    action_id: action.envelope.actionId,
    domain: "transactions",
    kind: "transaction.create",
    currency: action.currency,
    amount_minor_units: Number(action.amountMinorUnits),
    amount_minor_units_text: action.amountMinorUnits,
    accepted_account_revision: Number(action.acceptedRevision),
    accepted_account_revision_text: action.acceptedRevision,
    is_effective: compensatedAt === null,
    compensated_at: compensatedAt,
    reverses_effect_id: null,
    created_at: CREATED,
    updated_at: updatedAt,
    deleted: false,
  };
}

async function effects(): Promise<AccountFinancialEffect[]> {
  return database
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("user_id", USER))
    .fetch();
}
async function roots(): Promise<FinancialActionGroup[]> {
  return database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("user_id", USER))
    .fetch();
}
async function account(): Promise<Account> {
  return database.get<Account>("accounts").find(ACCOUNT);
}

async function createOptimisticGroup(historicalBaseline = false): Promise<{
  readonly action: ActionFixture;
  readonly root: FinancialActionGroup;
}> {
  if (historicalBaseline) {
    await synchronize({
      database,
      sendCreatedAsUpdated: true,
      pullChanges: () =>
        Promise.resolve({
          timestamp: Date.parse(UPPER),
          changes: {
            accounts: {
              created: [],
              deleted: [],
              updated: [
                {
                  ...accountRow(100, "1"),
                  created_at: Date.parse(CREATED),
                  updated_at: Date.parse(UPDATED),
                  financial_revision: "1",
                },
              ],
            },
          },
        }),
    });
    await database.adapter.setLocal("__monyvi_sync_owner_user_id", USER);
  } else {
    stage("accounts", accountRow(100, "1"));
    await syncDatabase(database);
  }
  const currentAccount = await account();
  const action = await actionFixture();
  const result = await productionAccountBalanceCommandService.execute({
    envelope: action.envelope,
    hashProvider,
    prepareDomainOperationPlan:
      (): Promise<FinancialActionLinkedOperationPlan> => {
        const transaction = database
          .get<Transaction>("transactions")
          .prepareCreate((row) => {
            row._raw.id = TRANSACTION;
            row._setRaw("created_at", Date.parse(CREATED));
            row.accountId = ACCOUNT;
            row.amount = 25;
            row.categoryId = CATEGORY;
            row.currency = "EGP";
            row.date = new Date("2026-10-07T00:00:00");
            row.deleted = false;
            row.isDraft = false;
            row.source = "MANUAL";
            row.type = "INCOME";
            row.updatedAt = new Date(CREATED);
            row.userId = USER;
          });
        return Promise.resolve<FinancialActionLinkedOperationPlan>({
          preparedCreates: [transaction],
          existingOperations: [
            {
              kind: "update",
              model: currentAccount,
              update: (model: Model): void => {
                if (model !== currentAccount) {
                  throw new Error("issue367_fixture_account_identity");
                }
                currentAccount.balance = 125;
                currentAccount.financialRevision = "2";
              },
            },
          ],
          assertCachedOwnership: (input): Promise<void> => {
            expect(input.userId).toBe(USER);
            input.cachedPreimages.forEach((row) =>
              expect(row.raw).toMatchObject({ user_id: USER })
            );
            return Promise.resolve();
          },
          assertPreparedOwnership: (input): Promise<void> => {
            expect(input.userId).toBe(USER);
            input.preparedPostimages.forEach((row) =>
              expect(row.raw).toMatchObject({ user_id: USER })
            );
            return Promise.resolve();
          },
        });
      },
  });
  expect(result.kind).toBe("committed");
  expect(result.record.state).toBe("local_complete");
  expect(result.record.payloadHash).toBe(action.payloadHash);
  expect(result.record.payloadJson).toBe(action.payloadJson);
  expect(await getFinancialActionGroup(ACTION)).toBe(result.record);
  expect(currentAccount.balance).toBe(125);
  expect((await effects()).map((row) => row.id)).toEqual([EFFECT]);
  return { action, root: result.record };
}

beforeAll(async () => {
  await adapter.initializingPromise;
});
beforeEach(() => {
  jest.clearAllMocks();
  pages = new Map();
  upper = UPPER;
  financialOutcome = null;
  financialRpcInputs = [];
  writes = [];
  mockFrom.mockImplementation((table: string): Chain => chainFor(table));
  mockRpc.mockImplementation(
    (
      name: string,
      args: Readonly<Record<string, unknown>> = {}
    ): Promise<unknown> => {
      if (name === "pull_market_rate_snapshots_page_v2") {
        return Promise.resolve({
          data: { snapshots: [], nextCursor: null, upperWatermark: upper },
          error: null,
        });
      }
      if (name === "seal_sync_pull_v1") {
        return Promise.resolve({ data: args.p_upper_watermark, error: null });
      }
      if (name === "pull_snapshot_deletions_page_v1") {
        return Promise.resolve({
          data: { rows: [], count: 0, upperWatermark: upper },
          error: null,
        });
      }
      if (name === "apply_account_financial_action_v1" && financialOutcome) {
        financialRpcInputs.push(args);
        return Promise.resolve({ data: financialOutcome, error: null });
      }
      throw new Error(`issue367_unexpected_rpc:${name}`);
    }
  );
});
afterEach(async () => {
  // Dispose only this suite's in-memory fixture; never reset an installed DB.
  await database.write(() => database.unsafeResetDatabase());
});

export function setUpper(value: string): void {
  upper = value;
}
export function setFinancialOutcome(value: JsonObject | null): void {
  financialOutcome = value;
}

export {
  serializeCanonicalJsonValue,
  syncDatabase,
  pullMetalDedicatedTable,
  getFinancialActionGroup,
  markFinancialActionGroupSyncPending,
  recordFinancialActionGroupServerOutcome,
  productionFinancialActionReconciliationService,
  database,
  adapter,
  USER,
  ACCOUNT,
  ACTION,
  EFFECT,
  TRANSACTION,
  REMOTE_ROOT,
  NEXT_ACTION,
  NEXT_EFFECT,
  NEXT_TRANSACTION,
  NEXT_ROOT,
  COMPENSATED,
  UPPER,
  UPPER_2,
  CHECKPOINT,
  financialOutcome,
  financialRpcInputs,
  writes,
  stage,
  actionFixture,
  accountRow,
  staleOutcome,
  rootRow,
  effectRow,
  effects,
  roots,
  account,
  createOptimisticGroup,
  mockFrom,
  mockRpc,
  WINNER_ACTION,
  WINNER_EFFECT,
  CREATED,
  UPDATED,
};
export type { Transaction, ActionFixture, Row, JsonObject, Page };

export { chainFor };
