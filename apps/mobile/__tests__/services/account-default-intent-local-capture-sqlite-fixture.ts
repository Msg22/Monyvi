/**
 * #395 T064/T069 TESTS FIRST: immutable Add-only private capture at the
 * existing production Add -> registered foundation -> real SQLite boundary.
 *
 * Baseline behavior is a successful Add with a NULL root private carrier.
 * The positive cases deliberately fail on that persisted behavior, not on
 * missing future schema/modules or a synthetic business writer.
 */
import { createHash, randomUUID } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import { serializeAccountCreateDefaultLocalRecoverySnapshotJson } from "../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import {
  hashFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
} from "../../../../packages/logic/src/financial-actions";
import { accountReviewLocalSaveSnapshotSchema } from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import { validateAccountCreateDefaultPayload } from "../../../../packages/logic/src/financial-actions/account-create-default";
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
  hashAccountReviewLocalPostimage,
  physicalRawField,
} from "@/services/account-review-local-snapshot-postimages";
import { cloneWatermelonRaw } from "@/services/watermelon-raw-integrity";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "@/services/user-data-access";
import {
  clearAndSeed,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import { LEGACY_FINANCIAL_ACTION_TEST_REGISTRY } from "./financial-action-foundation-test-registry";
import { ADD_DEFAULT_IDS } from "../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";

interface TestDbModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}
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
  >("./account-review-save-ledger-models");
  const adapter = new Adapter({ schema });
  const database = new wm.Database({
    adapter,
    modelClasses: models.LEDGER_MODEL_CLASSES,
  });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(
      models.LEDGER_MODEL_CLASSES.map((model) => [model.name, model])
    ),
  };
});
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (algorithm: string, text: string): Promise<string> => {
    if (algorithm !== "SHA-256")
      return Promise.reject(new Error("unsupported_test_crypto_algorithm"));
    return Promise.resolve(
      jest
        .requireActual<typeof import("node:crypto")>("node:crypto")
        .createHash("sha256")
        .update(text, "utf8")
        .digest("hex")
    );
  },
}));
let mockCurrentOwner: string = ADD_DEFAULT_IDS.owner;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentOwner),
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: (): Promise<null> => Promise.resolve(null),
}));

export const moduleDb = jest.requireMock<TestDbModule>("@monyvi/db");
export const ledger: SqliteLedger = {
  database: moduleDb.database,
  adapter: moduleDb.__adapter,
};
export const OWNER = ADD_DEFAULT_IDS.owner;
export const hashProvider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};
export const HASH = /^[0-9a-f]{64}$/;
export const ADD_KEYS = [
  "version",
  "actionId",
  "ownerId",
  "rootBinding",
  "payloadHash",
  "expectedDefaultSnapshot",
  "preparedDefaultSnapshot",
  "dependencyRoots",
  "createdAccount",
  "createdChildren",
  "openingEffect",
  "priorDefault",
] as const;
export type AccountType = AccountFormData["accountType"];
export type PriorImage = Readonly<Model["_raw"]>;

export function fail(reason: string): never {
  throw new Error("t069_capture_fixture_" + reason);
}
export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function record(
  value: unknown,
  reason: string
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) fail(reason);
  return value;
}
export function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}
export function form(
  type: AccountType,
  opening: string,
  intent: boolean
): AccountFormData {
  return accountFormSchema.parse({
    name: "T069 " + type + " " + opening + " " + String(intent),
    accountType: type,
    balance: opening,
    currency: "EGP",
    defaultIntent: intent,
    institutionId: type === "BANK" ? "cib" : null,
    providerDisplayName:
      type === "BANK"
        ? "CIB"
        : type === "DIGITAL_WALLET"
          ? "Manual Wallet"
          : "",
    senderNames: type === "CASH" ? [] : ["CIBEGYPT"],
    cardLast4: type === "BANK" ? "0042" : "",
    accountNumber: type === "BANK" ? "0088997766" : "",
  });
}
export function service(): ReturnType<
  typeof createAccountDefaultIntentService
> {
  return createAccountDefaultIntentService({
    database: ledger.database,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: (): string => randomUUID(),
    now: (): Date => new Date("2026-10-16T11:00:00.000Z"),
    hashProvider,
  });
}
export async function seedPriorDefault(): Promise<void> {
  await ledger.database.write(async (): Promise<void> => {
    const row = ledger.database
      .get<Account>("accounts")
      .prepareCreate((model) => {
        model._raw.id = ADD_DEFAULT_IDS.previous;
        model.userId = OWNER;
        model.name = "Original owned cash";
        model.type = "CASH";
        model.currency = "EGP";
        model.balance = 100;
        model.financialRevision = "5";
        model.isDefault = true;
        model.deleted = false;
      });
    await ledger.database.batch(row);
  });
}
export async function fresh(): Promise<Database> {
  return reopenSqliteLedger(ledger);
}
export async function rootFor(
  db: Database,
  actionId: string
): Promise<FinancialActionGroup> {
  const roots = await db
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("action_id", actionId))
    .fetch();
  if (roots.length !== 1 || !roots[0]) fail("missing_or_duplicate_real_root");
  return roots[0];
}
export async function create(
  formData: AccountFormData
): Promise<AccountDefaultPreparedCommand> {
  const svc = service();
  const prepared = await svc.prepare(OWNER, formData);
  await expect(svc.commitPrepared(prepared)).resolves.toEqual({
    kind: "committed",
    accountId: prepared.accountId,
  });
  return prepared;
}
export function privateFromActualRoot(root: FinancialActionGroup): {
  readonly raw: string;
  readonly value: Readonly<Record<string, unknown>>;
} {
  // The baseline Add already reaches this root, but the existing writer has
  // localRecoverySnapshotJson === null. This is the intended behavioral Red.
  expect(typeof root.localRecoverySnapshotJson).toBe("string");
  const raw = root.localRecoverySnapshotJson;
  if (typeof raw !== "string") fail("missing_add_private_snapshot");
  const parsed: unknown = JSON.parse(raw);
  const value = record(parsed, "invalid_add_private_object");
  exactKeys(value, ADD_KEYS);
  expect(value.version).toBe("account-create-default-local-save/v1");
  // Strict authoritative twelve-key schema and canonical serialization:
  // an arbitrary Record<string, unknown> is never silently cast to JSON.
  expect(raw).toBe(
    serializeAccountCreateDefaultLocalRecoverySnapshotJson(value)
  );
  return { raw, value };
}
export function transport(raw: PriorImage): Readonly<{
  status: "created" | "updated" | "synced";
  changedColumns: readonly string[];
}> {
  if (
    raw._status !== "created" &&
    raw._status !== "updated" &&
    raw._status !== "synced"
  )
    fail("invalid_real_transport_status");
  return {
    status: raw._status,
    changedColumns: raw._changed.split(",").filter(Boolean).sort(),
  };
}
export async function physicalHash(table: string, row: Model): Promise<string> {
  return hashAccountReviewLocalPostimage({
    table,
    id: row.id,
    raw: row._raw,
    hashProvider,
  });
}
export async function actualDefaultGraph(db: Database): Promise<
  Readonly<{
    activeAccountIds: readonly string[];
    defaultAccount: Readonly<{ accountId: string; isDefault: true }> | null;
  }>
> {
  const accounts = await db.get<Account>("accounts").query().fetch();
  const owned = accounts.filter((row) => row.userId === OWNER && !row.deleted);
  const defaults = owned.filter((row) => row.isDefault);
  if (defaults.length > 1) fail("invalid_real_active_default_graph");
  return {
    activeAccountIds: owned.map((row) => row.id).sort(),
    defaultAccount: defaults[0]
      ? { accountId: defaults[0].id, isDefault: true }
      : null,
  };
}
export async function expectedChildren(
  db: Database,
  command: AccountDefaultPreparedCommand
): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> {
  const [banks, senders] = await Promise.all([
    db
      .get<BankDetails>("bank_details")
      .query(Q.where("account_id", command.accountId))
      .fetch(),
    db
      .get<AccountSmsSender>("account_sms_senders")
      .query(Q.where("account_id", command.accountId))
      .fetch(),
  ]);
  expect(banks.map((item) => item.id)).toEqual(
    command.bankDetailId ? [command.bankDetailId] : []
  );
  expect(senders.map((item) => item.id).sort()).toEqual(
    command.senders.map((item) => item.id).sort()
  );
  const mapped = await Promise.all([
    ...banks.map(async (item) => ({
      entity: "bank_details",
      id: item.id,
      accountId: command.accountId,
      preimage: null,
      expectedPostimageHash: await physicalHash("bank_details", item),
    })),
    ...senders.map(async (item) => ({
      entity: "account_sms_sender",
      id: item.id,
      accountId: command.accountId,
      preimage: null,
      expectedPostimageHash: await physicalHash("account_sms_senders", item),
    })),
  ]);
  return mapped.sort((a, b) => {
    const left = a.entity + ":" + a.id;
    const right = b.entity + ":" + b.id;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
export async function assertCapturedPhysicalAdd(input: {
  readonly command: AccountDefaultPreparedCommand;
  readonly priorRaw: PriorImage | null;
}): Promise<void> {
  const db = await fresh(); // An independent adapter/cache must read committed bytes.
  const { command, priorRaw } = input;
  const root = await rootFor(db, command.envelope.actionId);
  const { raw, value } = privateFromActualRoot(root);
  expect(root.userId).toBe(OWNER);
  expect(root.domain).toBe("accounts");
  expect(root.kind).toBe("create_with_default");
  expect(root.domainReferenceId).toBe(command.accountId);
  expect(root.state).toBe("local_complete");
  const hashed = await hashFinancialActionEnvelope(
    command.envelope,
    hashProvider,
    createAccountReviewFinancialRegistry()
  );
  expect(root.payloadJson).toBe(hashed.canonicalText);
  expect(root.payloadHash).toBe(hashed.payloadHash);
  expect(root.accountGuardsJson).toBe(
    JSON.stringify(command.envelope.accountGuards)
  );
  expect(value.actionId).toBe(root.actionId);
  expect(value.ownerId).toBe(OWNER);
  expect(value.payloadHash).toBe(root.payloadHash);
  expect(value.payloadHash).toEqual(expect.stringMatching(HASH));
  exactKeys(record(value.rootBinding, "root_binding"), [
    "domain",
    "kind",
    "domainReferenceId",
    "payloadVersion",
  ]);
  expect(value.rootBinding).toEqual({
    domain: "accounts",
    kind: "create_with_default",
    domainReferenceId: command.accountId,
    payloadVersion: "account.create-default/v1",
  });
  expect(value.expectedDefaultSnapshot).toEqual(command.snapshot);
  expect(value.expectedDefaultSnapshot).toEqual(
    command.envelope.payload.expectedDefaultSnapshot
  );
  expect(value.preparedDefaultSnapshot).toEqual(await actualDefaultGraph(db));
  expect(value.dependencyRoots).toEqual([]);

  const account = await db.get<Account>("accounts").find(command.accountId);
  const created = record(value.createdAccount, "created_account");
  exactKeys(created, [
    "accountId",
    "preimage",
    "postimage",
    "expectedPostimageHash",
  ]);
  expect(created.accountId).toBe(command.accountId);
  expect(created.preimage).toBeNull();
  expect(created.postimage).toEqual({
    userId: OWNER,
    currency: account.currency,
    balanceMinorUnits: command.openingMinorUnits,
    financialRevision: command.effectId === null ? "0" : "1",
    isDefault: account.isDefault,
    deleted: false,
  });
  expect(created.expectedPostimageHash).toBe(
    await physicalHash("accounts", account)
  );
  expect(created.expectedPostimageHash).toEqual(expect.stringMatching(HASH));

  const children = value.createdChildren;
  if (!Array.isArray(children)) fail("created_children_not_array");
  for (const item of children) {
    exactKeys(record(item, "child_item"), [
      "entity",
      "id",
      "accountId",
      "preimage",
      "expectedPostimageHash",
    ]);
  }
  expect(children).toEqual(await expectedChildren(db, command));
  const physicalEffects = await db
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("action_id", command.envelope.actionId))
    .fetch();
  expect(physicalEffects).toHaveLength(command.effectId ? 1 : 0);
  expect(command.envelope.payload.accountEffects).toHaveLength(
    command.effectId ? 1 : 0
  );
  expect(command.envelope.accountGuards).toHaveLength(command.effectId ? 1 : 0);
  if (!command.effectId) {
    expect(value.openingEffect).toBeNull();
    expect(account.balance).toBe(0);
    expect(account.financialRevision).toBe("0");
  } else {
    const effect = physicalEffects[0];
    if (!effect) fail("real_opening_effect_missing");
    const opening = record(value.openingEffect, "opening_effect");
    exactKeys(opening, [
      "effectId",
      "accountId",
      "userId",
      "actionId",
      "preimage",
      "postimage",
      "expectedPostimageHash",
    ]);
    expect(opening).toEqual({
      effectId: effect.id,
      accountId: command.accountId,
      userId: OWNER,
      actionId: command.envelope.actionId,
      preimage: null,
      postimage: {
        amountMinorUnits: effect.amountMinorUnits,
        currency: effect.currency,
        acceptedAccountRevision: "1",
        domain: "accounts",
        kind: "account.create-default",
        isEffective: true,
        deleted: false,
        compensatedAt: null,
        reversesEffectId: null,
      },
      expectedPostimageHash: await physicalHash(
        "account_financial_effects",
        effect
      ),
    });
    expect(effect.amountMinorUnits).toBe(command.openingMinorUnits);
    expect(account.financialRevision).toBe("1");
  }
  const prior = value.priorDefault;
  if (priorRaw === null || command.form.defaultIntent !== true) {
    expect(prior).toBeNull();
  } else {
    const existing = await db
      .get<Account>("accounts")
      .find(ADD_DEFAULT_IDS.previous);
    const original = record(prior, "prior_default");
    exactKeys(original, [
      "accountId",
      "userId",
      "preimage",
      "postimage",
      "preimageHash",
      "expectedPostimageHash",
      "transportPreimage",
      "transportPostimage",
    ]);
    const financial = {
      currency: existing.currency,
      balanceMinorUnits: "10000",
      financialRevision: "5",
      deleted: false,
    };
    expect(original).toEqual({
      accountId: ADD_DEFAULT_IDS.previous,
      userId: OWNER,
      preimage: { ...financial, isDefault: true },
      postimage: { ...financial, isDefault: false },
      preimageHash: await hashAccountReviewLocalPostimage({
        table: "accounts",
        id: ADD_DEFAULT_IDS.previous,
        raw: priorRaw,
        hashProvider,
      }),
      expectedPostimageHash: await physicalHash("accounts", existing),
      transportPreimage: transport(priorRaw),
      transportPostimage: transport(existing._raw),
    });
  }
  // The public root must not duplicate private postimages, children/effect
  // proof, dependency-root hashes or the local snapshot in any public field.
  const publicEnvelope: unknown = JSON.parse(root.payloadJson);
  const envelope = record(publicEnvelope, "public_envelope");
  expect(envelope.payload).toEqual(command.envelope.payload);
  for (const privateKey of [
    "localRecoverySnapshotJson",
    "preparedDefaultSnapshot",
    "dependencyRoots",
    "createdAccount",
    "createdChildren",
    "openingEffect",
    "priorDefault",
    "expectedPostimageHash",
  ]) {
    expect(root.payloadJson).not.toContain('"' + privateKey + '"');
  }
  expect(raw).not.toContain("0088997766");
  expect(raw).not.toContain("CIBEGYPT");
}
beforeEach(async (): Promise<void> => {
  mockCurrentOwner = OWNER;
  jest.restoreAllMocks();
  await ledger.adapter.initializingPromise;
  await clearAndSeed(ledger.database, { onlyCategories: true });
});

export async function assertCaptureAuthorityRefusal(
  command: AccountDefaultPreparedCommand,
  prior: Account,
  expectedFailure:
    | "account_default_writer_invalid_plan"
    | "account_default_creator_root_hash_mismatch"
    | "account_default_creator_root_identity_mismatch" = "account_default_writer_invalid_plan"
): Promise<void> {
  const before = await physicalSaveLedgerSnapshot(await fresh());
  const cachedBefore = cloneWatermelonRaw(prior._raw);
  // An invalid creator hash or guard now fails earlier at the real ancestry
  // boundary. Require its EXACT code and preserve all no-write assertions.
  await expect(service().commitPrepared(command)).rejects.toThrow(
    expectedFailure
  );
  expect(await physicalSaveLedgerSnapshot(await fresh())).toEqual(before);
  expect(prior._raw).toEqual(cachedBefore);
  await expect(
    ledger.database.get<Account>("accounts").find(command.accountId)
  ).rejects.toThrow();
  expect(
    await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(
        Q.where("user_id", OWNER),
        Q.where("action_id", command.envelope.actionId)
      )
      .fetch()
  ).toHaveLength(0);
}

export {
  createHash,
  randomUUID,
  Q,
  serializeAccountCreateDefaultLocalRecoverySnapshotJson,
  hashFinancialActionEnvelope,
  accountReviewLocalSaveSnapshotSchema,
  validateAccountCreateDefaultPayload,
  accountFormSchema,
  assertNoDuplicateAddAccountIdentity,
  createAccountDefaultIntentService,
  createAccountReviewFinancialRegistry,
  createFinancialActionFoundationRepository,
  hashAccountReviewLocalPostimage,
  physicalRawField,
  cloneWatermelonRaw,
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  clearAndSeed,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  LEGACY_FINANCIAL_ACTION_TEST_REGISTRY,
  ADD_DEFAULT_IDS,
};
export type {
  Database,
  Model,
  SQLiteAdapter,
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
  FinancialActionEnvelopeV1,
  AccountFormData,
  AccountDefaultPreparedCommand,
  SqliteLedger,
};
