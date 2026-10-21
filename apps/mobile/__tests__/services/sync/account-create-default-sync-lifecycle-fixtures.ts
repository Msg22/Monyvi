/**
 * #395 T069 SYNC/ACK/PULL tests FIRST. Actual Add command, approved foundation,
 * production action coordinator, sync push service and Watermelon synchronize
 * on Node SQLite. No SDK mock, missing-module import, monkeypatch or invented
 * financial writer. The only doubles are authenticated actor and remote I/O.
 *
 * Some cases intentionally remain dependent on successor40's dedicated Add
 * compensation and SDKworker45's writer hook integration. Root classifies
 * actual Red before any source grant; this test author has NOT RUN checks.
 */
import { createHash, randomUUID } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  type SyncPullResult,
  type SyncPushArgs,
  type SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import {
  synchronizeWithProtectedAccountActions,
  applyDeferredRejections,
} from "@/services/sync";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import {
  canonicalizeFinancialActionEnvelope,
  serializeCanonicalJsonValue,
  type CanonicalJsonValue,
} from "@monyvi/logic";
import {
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
} from "../../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";
import {
  accountFormSchema,
  type AccountFormData,
} from "@/validation/account-validation";
import { assertNoDuplicateAddAccountIdentity } from "@/services/account-service";
import { createAccountDefaultIntentService } from "@/services/account-default-intent-service";
import type { AccountDefaultPreparedCommand } from "@/services/account-default-intent-command";
import { createAccountReviewFinancialRegistry } from "@/services/account-review-financial-command-service";
import { createFinancialActionFoundationRepository } from "@/services/financial-action-foundation-repository";
import {
  createFinancialActionPushCoordinator,
  createFinancialActionSyncService,
  type FinancialActionPushCoordinator,
} from "@/services/financial-action-sync-service";
import { productionFinancialActionReconciliationService } from "@/services/financial-action-reconciliation-production";
import { collectAccountFinancialActionPushBundles } from "@/services/sync/account-protected-fields";
import { pushChanges } from "@/services/sync/push-service";
import {
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
} from "@/services/user-data-access";
import type { AppSyncDatabaseChangeSet } from "@/services/sync/types";
import {
  clearAndSeed,
  type SqliteLedger,
} from "../account-review-save-sqlite-test-helpers";
import { ADD_DEFAULT_IDS } from "../../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";

const OWNER = ADD_DEFAULT_IDS.owner;
const FOREIGN = ADD_DEFAULT_IDS.foreignOwner;
let mockForeignOwner: string = FOREIGN;
let mockActiveOwner = OWNER;
let mockAuthReadCount = 0;
let mockSwitchOwnerOnAuthRead: number | null = null;
let mockNextWatermark = Date.parse("2026-10-16T16:00:00.000Z");

interface RemoteUpsert {
  readonly table: string;
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
}
interface RemoteUpdate {
  readonly table: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly filters: Readonly<Record<string, unknown>>;
}
const mockUpserts: RemoteUpsert[] = [];
const mockUpdates: RemoteUpdate[] = [];
const mockFinancialTransport: Array<{
  readonly payloadHash: string;
  readonly payloadJson: string;
}> = [];
// External server readback only; never a fake local financial writer.
const mockCurrentServerFinancialAccounts = new Map<
  string,
  Readonly<Record<string, unknown>>
>();
// Jest hoists its mock factory; read the fixed fixture owner lazily only when
// the owner-filtered server query executes, never during mock initialization.
const mockFinancialReadOwnerId = (): string => OWNER;
let mockCurrentServerFinancialReadError: Readonly<{
  code: string;
  message: string;
}> | null = null;
const mockExternalUpsertError = {
  code: "23502",
  message: "not_null_violation",
};
let mockRejectPartialAccountUpserts = false;
let mockForceUnverifiedUpdateResult = false;
let mockRemoteDefaultAccountId: string | null = null;
let mockEnforceRemoteDefaultUnique = false;
let mockBeforeAccountMetadataUpdate:
  | ((observation: Readonly<AccountMetadataUpdateObservation>) => Promise<void>)
  | null = null;
let mockFailAccountMetadataUpdateOnceForId: string | null = null;
let mockAccountMetadataUpdateFailOnceUsed = false;

interface MockLedgerModule {
  readonly database: Database;
  readonly __original: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __setDatabase: (value: Database) => void;
  readonly __reopen: () => Promise<Database>;
}

// Keep real Watermelon/SQLite and all production model classes. Only the
// platform-specific SQLite dispatcher is resolved to its actual Node entry.
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
    typeof import("../../../../../packages/db/src/schema")
  >("../../../../../packages/db/src/schema");
  const { LEDGER_MODEL_CLASSES } = jest.requireActual<
    typeof import("../account-review-save-ledger-models")
  >("../account-review-save-ledger-models");
  const { Debt } = jest.requireActual<
    typeof import("../../../../../packages/db/src/models/Debt")
  >("../../../../../packages/db/src/models/Debt");
  const { RecurringPayment } = jest.requireActual<
    typeof import("../../../../../packages/db/src/models/RecurringPayment")
  >("../../../../../packages/db/src/models/RecurringPayment");
  // Guarded S23 recovery touches real Debt/RecurringPayment collections.
  // Keep the same production-complete registry across a genuine SQLite clone.
  const modelClasses = [...LEDGER_MODEL_CLASSES, Debt, RecurringPayment];
  const adapter = new Adapter({ schema });
  const original = new wm.Database({
    adapter,
    modelClasses,
  });
  let current = original;
  return {
    get database(): Database {
      return current;
    },
    __original: original,
    __adapter: adapter,
    __setDatabase: (database: Database): void => {
      current = database;
    },
    __reopen: async (): Promise<Database> => {
      const freshAdapter = await adapter.testClone();
      return new wm.Database({ adapter: freshAdapter, modelClasses });
    },
    schema,
    Q: wm.Q,
    ...Object.fromEntries(modelClasses.map((model) => [model.name, model])),
  };
});
jest.mock("expo-crypto", () => {
  const node = jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    randomUUID: (): string => node.randomUUID(),
    digestStringAsync: (_algorithm: string, raw: string): Promise<string> =>
      Promise.resolve(
        node.createHash("sha256").update(raw, "utf8").digest("hex")
      ),
  };
});
// External Supabase transport boundary only. The SDK synchronize and all
// application financial business/recovery/protection code run unmocked.
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => {
    mockAuthReadCount += 1;
    if (
      mockSwitchOwnerOnAuthRead !== null &&
      mockAuthReadCount >= mockSwitchOwnerOnAuthRead
    )
      mockActiveOwner = mockForeignOwner;
    return Promise.resolve(mockActiveOwner);
  },
  supabase: {
    from: (table: string): unknown => ({
      // Owner-filtered PostgREST account SELECT used only to substantiate
      // newer created-row financial fields before original SDK ACK.
      select: (columns: string): unknown => {
        const filters: Record<string, string> = {};
        const query = {
          eq: (column: string, value: string): unknown => {
            filters[column] = value;
            return query;
          },
          maybeSingle: (): Promise<{
            data: unknown;
            error: Readonly<{ code: string; message: string }> | null;
          }> => {
            const row =
              typeof filters.id === "string"
                ? mockCurrentServerFinancialAccounts.get(filters.id)
                : undefined;
            const valid =
              table === "accounts" &&
              columns ===
                "id,user_id,type,currency,created_at,balance,financial_revision" &&
              filters.user_id === mockFinancialReadOwnerId() &&
              row?.user_id === filters.user_id &&
              row?.id === filters.id;
            return Promise.resolve({
              data: valid && !mockCurrentServerFinancialReadError ? row : null,
              error: mockCurrentServerFinancialReadError,
            });
          },
        };
        return query;
      },
      upsert: (
        records: ReadonlyArray<Readonly<Record<string, unknown>>>
      ): Promise<{
        readonly error: null | {
          readonly code: string;
          readonly message: string;
        };
      }> => {
        mockUpserts.push({ table, rows: records });
        if (
          mockRejectPartialAccountUpserts &&
          table === "accounts" &&
          records.some((record) => !("name" in record))
        ) {
          return Promise.resolve({ error: mockExternalUpsertError });
        }
        return Promise.resolve({ error: null });
      },
      update: (values: Readonly<Record<string, unknown>>): unknown => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq: (column: string, value: unknown): unknown => {
            filters[column] = value;
            return query;
          },
          in: (column: string, values: readonly unknown[]): unknown => {
            filters[column] = values;
            return query;
          },
          select: (_columns: string): unknown => query,
          then: async (
            resolve: (value: {
              readonly error: null | {
                readonly code: string;
                readonly message: string;
              };
              readonly data: ReadonlyArray<{ readonly id: string }>;
              readonly count: number;
            }) => unknown
          ): Promise<unknown> => {
            mockUpdates.push({ table, values, filters: { ...filters } });
            const ids =
              typeof filters.id === "string"
                ? [filters.id]
                : Array.isArray(filters.id)
                  ? filters.id.filter(
                      (id): id is string => typeof id === "string"
                    )
                  : [];
            const confirmedIds = mockForceUnverifiedUpdateResult ? [] : ids;
            const defaultValue = values.is_default;
            const defaultTarget = ids[0];
            // Authorized observation seam: the update was captured, and the
            // observation happens BEFORE any success response or remote
            // default map mutation.
            if (mockBeforeAccountMetadataUpdate) {
              await mockBeforeAccountMetadataUpdate({
                table,
                values,
                filters: { ...filters },
              });
            }
            // A single controlled failure for one target id, before its map
            // mutation, so a later retry can succeed.
            if (
              table === "accounts" &&
              typeof defaultTarget === "string" &&
              mockFailAccountMetadataUpdateOnceForId === defaultTarget &&
              !mockAccountMetadataUpdateFailOnceUsed
            ) {
              mockAccountMetadataUpdateFailOnceUsed = true;
              return Promise.resolve({
                error: { code: "23505", message: "accounts_one_default" },
                data: [],
                count: 0,
              }).then(resolve);
            }
            if (
              mockEnforceRemoteDefaultUnique &&
              table === "accounts" &&
              typeof defaultTarget === "string" &&
              defaultValue === true &&
              mockRemoteDefaultAccountId !== null &&
              mockRemoteDefaultAccountId !== defaultTarget
            ) {
              return Promise.resolve({
                error: { code: "23505", message: "accounts_one_default" },
                data: [],
                count: 0,
              }).then(resolve);
            }
            if (
              mockEnforceRemoteDefaultUnique &&
              table === "accounts" &&
              typeof defaultTarget === "string"
            ) {
              if (
                defaultValue === false &&
                mockRemoteDefaultAccountId === defaultTarget
              )
                mockRemoteDefaultAccountId = null;
              if (defaultValue === true)
                mockRemoteDefaultAccountId = defaultTarget;
            }
            return Promise.resolve({
              error: null,
              data: confirmedIds.map((id) => ({ id })),
              count: confirmedIds.length,
            }).then(resolve);
          },
        };
        return query;
      },
    }),
    // Generic Supabase action RPC must never be consulted by the explicitly
    // injected coordinator. Calls here would hide a missing owned handoff.
    rpc: (): Promise<never> =>
      Promise.reject(new Error("unexpected_unscoped_add_rpc")),
  },
}));
jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: (): Promise<null> => Promise.resolve(null),
}));

const dbModule = jest.requireMock<MockLedgerModule>("@monyvi/db");
const ledger: SqliteLedger = {
  database: dbModule.__original,
  adapter: dbModule.__adapter,
};
const hashProvider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

function form(
  name: string,
  opening = "0",
  defaultIntent = true,
  type: AccountFormData["accountType"] = "BANK"
): AccountFormData {
  return accountFormSchema.parse({
    name,
    balance: opening,
    defaultIntent,
    accountType: type,
    currency: "EGP",
    institutionId: type === "BANK" ? "cib" : null,
    providerDisplayName: type === "BANK" ? "CIB" : "",
    senderNames: type === "CASH" ? [] : ["CIBEGYPT"],
    cardLast4: type === "BANK" ? "0007" : "",
  });
}

function addService(
  db: Database
): ReturnType<typeof createAccountDefaultIntentService> {
  return createAccountDefaultIntentService({
    database: db,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: (): string => randomUUID(),
    now: (): Date => new Date("2026-10-16T11:00:00.000Z"),
    hashProvider,
  });
}

function foundation(
  db: Database
): ReturnType<typeof createFinancialActionFoundationRepository> {
  return createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    registry: createAccountReviewFinancialRegistry(),
  });
}

async function commitAdd(
  db: Database,
  name: string,
  opening = "0",
  makeDefault = true,
  type: AccountFormData["accountType"] = "BANK"
): Promise<AccountDefaultPreparedCommand> {
  const service = addService(db);
  const command = await service.prepare(
    OWNER,
    form(name, opening, makeDefault, type)
  );
  await expect(service.commitPrepared(command)).resolves.toMatchObject({
    kind: "committed",
    accountId: command.accountId,
  });
  return command;
}

async function ownedRoot(
  db: Database,
  actionId: string
): Promise<FinancialActionGroup> {
  const roots = await db
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("action_id", actionId), Q.where("user_id", OWNER))
    .fetch();
  if (roots.length !== 1 || !roots[0])
    throw new Error("missing_original_owned_add_root");
  return roots[0];
}

function accepted(command: AccountDefaultPreparedCommand): unknown {
  return {
    actionId: command.envelope.actionId,
    status: "accepted",
    accountRevisions: command.effectId
      ? [{ accountId: command.accountId, revision: "1" }]
      : [],
    effectiveEventId: null,
    holdingRevision: null,
    serverAcceptedAt: "2026-10-16T11:00:00.000Z",
  };
}

function rejected(command: AccountDefaultPreparedCommand): unknown {
  return {
    actionId: command.envelope.actionId,
    status: "rejected",
    code: "DOMAIN_UNIQUE_CONFLICT",
    canonicalAccounts: [],
    canonicalAbsentAccountIds: [command.accountId],
    // The approved Add-only rejection receipt. This is immutable
    // rejection-time authority, not a read of a future live cloud state.
    canonicalDefaultSnapshot: command.snapshot,
  };
}

function actionCoordinator(
  db: Database,
  onTransport: (value: {
    readonly payloadHash: string;
    readonly payloadJson: string;
  }) => Promise<unknown>,
  onReconcile?: (
    actionId: string
  ) => Promise<"incomplete" | "reconciled" | "replay">
): FinancialActionPushCoordinator {
  const repo = foundation(db);
  return createFinancialActionPushCoordinator({
    ...repo,
    database: db,
    getFinancialActionGroup: repo.getFinancialActionGroup,
    invokeAccountFinancialActionRpc: (request) => {
      mockFinancialTransport.push({ ...request });
      return onTransport(request);
    },
    ...(onReconcile ? { reconcileFinancialActionGroup: onReconcile } : {}),
  });
}

function acceptedCoordinator(db: Database): FinancialActionPushCoordinator {
  return actionCoordinator(db, ({ payloadJson }): Promise<unknown> => {
    const raw: unknown = JSON.parse(payloadJson);
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("actionId" in raw) ||
      typeof raw.actionId !== "string"
    ) {
      throw new Error("invalid_real_action_payload");
    }
    return Promise.resolve({
      actionId: raw.actionId,
      status: "accepted",
      accountRevisions: [],
      effectiveEventId: null,
      holdingRevision: null,
      serverAcceptedAt: "2026-10-16T11:00:00.000Z",
    });
  });
}

interface RealSyncHooks {
  readonly pull?: (args: {
    readonly lastPulledAt: number | null;
  }) => Promise<SyncPullResult>;
  readonly afterPush?: () => Promise<void> | void;
  readonly coordinator?: FinancialActionPushCoordinator;
}

/**
 * Real SDK synchronization and production app push route. A single injected
 * coordinator controls only the outside-server transport response.
 */
async function realSynchronize(
  db: Database,
  options: RealSyncHooks = {}
): Promise<void> {
  const coordinator = options.coordinator ?? acceptedCoordinator(db);
  await synchronizeWithProtectedAccountActions({
    database: db,
    expectedOwnerId: OWNER,
    pullChanges: async (lastPulledAt): Promise<SyncPullResult> =>
      options.pull
        ? options.pull({ lastPulledAt })
        : Promise.resolve({ changes: {}, timestamp: ++mockNextWatermark }),
    pushChanges: async (args: SyncPushArgs, capability) => {
      const outcome = await pushChanges(
        db,
        args,
        OWNER,
        coordinator,
        capability
      );
      await options.afterPush?.();
      return outcome;
    },
  });
}

/** Local immutable acceptance is committed before the real SDK ACK. */
async function acceptThenAck(
  db: Database,
  command: AccountDefaultPreparedCommand
): Promise<void> {
  const sync = createFinancialActionSyncService({
    foundationRepository: foundation(db),
    invokeAccountFinancialActionRpc: (request): Promise<unknown> => {
      mockFinancialTransport.push({ ...request });
      return Promise.resolve(accepted(command));
    },
  });
  await sync.syncAction(command.envelope.actionId);
  expect((await ownedRoot(db, command.envelope.actionId)).state).toBe(
    "accepted"
  );
  await realSynchronize(db);
}

function networkRows(): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return mockUpserts.flatMap((entry) => entry.rows);
}

function outboundTouchesIds(ids: ReadonlySet<string>): boolean {
  if (
    mockUpserts.some((entry) =>
      entry.rows.some((row) => typeof row.id === "string" && ids.has(row.id))
    )
  )
    return true;
  return mockUpdates.some((entry) => {
    const filtered = entry.filters.id;
    return (
      (typeof filtered === "string" && ids.has(filtered)) ||
      (Array.isArray(filtered) &&
        filtered.some((value) => typeof value === "string" && ids.has(value)))
    );
  });
}

function noPrivateNetworkBytes(): void {
  expect(
    mockUpserts.every((entry) =>
      entry.rows.every((record) => !("local_recovery_snapshot_json" in record))
    )
  ).toBe(true);
  expect(
    mockUpdates.every(
      (entry) => !("local_recovery_snapshot_json" in entry.values)
    )
  ).toBe(true);
  expect(
    networkRows().some(
      (record) =>
        typeof record.payload_json === "string" &&
        record.payload_json.includes("local-save")
    )
  ).toBe(false);
  for (const request of mockFinancialTransport) {
    expect(request.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.payloadJson).not.toContain("local_recovery_snapshot_json");
    expect(request.payloadJson).not.toContain(
      "account-create-default-local-save/v1"
    );
    expect(request.payloadJson).not.toContain("smsDrafts");
  }
}

async function coldRestart(): Promise<Database> {
  const db = await dbModule.__reopen();
  dbModule.__setDatabase(db);
  return db;
}

async function cloudAccount(
  db: Database,
  accountId: string,
  fields: Readonly<Record<string, unknown>>
): Promise<Readonly<Record<string, unknown>>> {
  const row = await db.get<Account>("accounts").find(accountId);
  const raw = Object.fromEntries(
    Object.entries(row._raw).filter(
      ([key]) => key !== "_status" && key !== "_changed"
    )
  );
  return { ...raw, ...fields };
}

function tableUpdated(
  value: Readonly<Record<string, unknown>>
): SyncTableChangeSet {
  return { created: [], updated: [value], deleted: [] };
}

async function markRejected(
  db: Database,
  command: AccountDefaultPreparedCommand
): Promise<void> {
  const transport = createFinancialActionSyncService({
    foundationRepository: foundation(db),
    invokeAccountFinancialActionRpc: (): Promise<unknown> =>
      Promise.resolve(rejected(command)),
  });
  await transport.syncAction(command.envelope.actionId);
}

beforeEach(async (): Promise<void> => {
  mockActiveOwner = OWNER;
  mockForeignOwner = FOREIGN;
  mockAuthReadCount = 0;
  mockSwitchOwnerOnAuthRead = null;
  mockNextWatermark = Date.parse("2026-10-16T16:00:00.000Z");
  mockUpserts.length = 0;
  mockUpdates.length = 0;
  mockFinancialTransport.length = 0;
  mockCurrentServerFinancialAccounts.clear();
  mockCurrentServerFinancialReadError = null;
  mockRejectPartialAccountUpserts = true;
  mockForceUnverifiedUpdateResult = false;
  mockRemoteDefaultAccountId = null;
  mockEnforceRemoteDefaultUnique = false;
  dbModule.__setDatabase(dbModule.__original);
  await ledger.adapter.initializingPromise;
  await clearAndSeed(ledger.database, { onlyCategories: true });
});
afterEach((): void => {
  mockActiveOwner = OWNER;
  mockBeforeAccountMetadataUpdate = null;
  mockFailAccountMetadataUpdateOnceForId = null;
  mockAccountMetadataUpdateFailOnceUsed = false;
  dbModule.__setDatabase(dbModule.__original);
});

/** The captured owner-filtered UPDATE, observed before any response. */
export interface AccountMetadataUpdateObservation {
  readonly table: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly filters: Readonly<Record<string, unknown>>;
}

/** Mutable test transport controls backed by this module's exact Jest mocks.
 * Both suites use this typed facade rather than assigning imported ESM bindings.
 */
export const syncFixtureControls = {
  /** Observation seam: the captured owner-filtered UPDATE, before any response
   * or remote default map mutation. */
  set beforeAccountMetadataUpdate(
    hook:
      | ((
          observation: Readonly<AccountMetadataUpdateObservation>
        ) => Promise<void>)
      | null
  ) {
    mockBeforeAccountMetadataUpdate = hook;
  },
  /** Fail the first owner-filtered UPDATE for this account id once, before its
   * remote default map mutation. */
  set failAccountMetadataUpdateOnceForId(value: string | null) {
    mockFailAccountMetadataUpdateOnceForId = value;
    mockAccountMetadataUpdateFailOnceUsed = false;
  },
  // Synthetic remote outcome, not a local DB override. Must be set only
  // when the test has positively committed the corresponding remote RPC.
  setAccountFinancialReadback(
    value: Readonly<Record<string, unknown>> | null
  ): void {
    if (value === null) {
      mockCurrentServerFinancialAccounts.clear();
    } else if (typeof value.id === "string") {
      mockCurrentServerFinancialAccounts.set(value.id, { ...value });
    } else {
      throw new Error("invalid_test_remote_account_id");
    }
  },
  setAccountFinancialReadbackError(
    error: Readonly<{ code: string; message: string }> | null
  ): void {
    mockCurrentServerFinancialReadError = error;
  },
  get mockActiveOwner(): string {
    return mockActiveOwner;
  },
  set mockActiveOwner(value: string) {
    mockActiveOwner = value;
  },
  get mockAuthReadCount(): number {
    return mockAuthReadCount;
  },
  set mockAuthReadCount(value: number) {
    mockAuthReadCount = value;
  },
  get mockSwitchOwnerOnAuthRead(): number | null {
    return mockSwitchOwnerOnAuthRead;
  },
  set mockSwitchOwnerOnAuthRead(value: number | null) {
    mockSwitchOwnerOnAuthRead = value;
  },
  get mockNextWatermark(): number {
    return mockNextWatermark;
  },
  set mockNextWatermark(value: number) {
    mockNextWatermark = value;
  },
  get mockForceUnverifiedUpdateResult(): boolean {
    return mockForceUnverifiedUpdateResult;
  },
  set mockForceUnverifiedUpdateResult(value: boolean) {
    mockForceUnverifiedUpdateResult = value;
  },
  get mockRemoteDefaultAccountId(): string | null {
    return mockRemoteDefaultAccountId;
  },
  set mockRemoteDefaultAccountId(value: string | null) {
    mockRemoteDefaultAccountId = value;
  },
  get mockEnforceRemoteDefaultUnique(): boolean {
    return mockEnforceRemoteDefaultUnique;
  },
  set mockEnforceRemoteDefaultUnique(value: boolean) {
    mockEnforceRemoteDefaultUnique = value;
  },
};

export {
  Q,
  synchronizeWithProtectedAccountActions,
  applyDeferredRejections,
  canonicalizeFinancialActionEnvelope,
  serializeCanonicalJsonValue,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  accountFormSchema,
  assertNoDuplicateAddAccountIdentity,
  createAccountDefaultIntentService,
  createAccountReviewFinancialRegistry,
  createFinancialActionFoundationRepository,
  createFinancialActionPushCoordinator,
  createFinancialActionSyncService,
  productionFinancialActionReconciliationService,
  collectAccountFinancialActionPushBundles,
  pushChanges,
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
  randomUUID,
  OWNER,
  FOREIGN,
  mockUpserts,
  mockUpdates,
  mockFinancialTransport,
  dbModule,
  ledger,
  hashProvider,
  form,
  addService,
  foundation,
  commitAdd,
  ownedRoot,
  accepted,
  rejected,
  actionCoordinator,
  acceptedCoordinator,
  realSynchronize,
  acceptThenAck,
  networkRows,
  outboundTouchesIds,
  noPrivateNetworkBytes,
  coldRestart,
  cloudAccount,
  tableUpdated,
  markRejected,
};
export type {
  Database,
  Model,
  SyncPullResult,
  SyncPushArgs,
  SyncTableChangeSet,
  Account,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
  CanonicalJsonValue,
  AppSyncDatabaseChangeSet,
  AccountDefaultPreparedCommand,
  FinancialActionPushCoordinator,
  AccountFormData,
};
