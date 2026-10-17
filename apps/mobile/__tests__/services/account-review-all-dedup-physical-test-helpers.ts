/** #395 L4 synthetic SQLite evidence and fixture readers.
 * Every physical snapshot includes original deleted tombstones (no owner/queue
 * filter); do not substitute count-only or Watermelon .query().fetch() proof.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
} from "@monyvi/db";
import type { Sha256Provider } from "@monyvi/logic";
import { accountFormSchema } from "../../validation/account-validation";
import { assertNoDuplicateAddAccountIdentity } from "../../services/account-service";
import { createAccountDefaultIntentService } from "../../services/account-default-intent-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "../../services/user-data-access";
import { parseAccountCreateDefaultLocalRecoverySnapshotJson } from "../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import {
  OWNER,
  BANK,
  SESSION,
  FINGERPRINT_A,
  testUuid,
} from "./account-review-save-test-fixtures";

export const drafts = (db: Database): Promise<SmsReviewDraftItem[]> =>
  db
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", OWNER), Q.where("queue_id", SESSION))
    .fetch();

export const queues = (db: Database): Promise<SmsReviewQueue[]> =>
  db
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", OWNER))
    .fetch();

export async function root(
  db: Database,
  action: string
): Promise<FinancialActionGroup> {
  const rows = await db
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("user_id", OWNER), Q.where("action_id", action))
    .fetch();
  if (rows.length !== 1 || !rows[0])
    throw new Error("missing_actual_owned_action_root");
  return rows[0];
}

export const cache = (models: readonly Model[]): readonly string[] =>
  models.map((model) =>
    JSON.stringify({
      raw: model._raw,
      prepared: model._preparedState,
      editing: model._isEditing,
    })
  );

export type SmsPhysicalTable = "sms_review_queues" | "sms_review_draft_items";
export type PhysicalSmsRow = Readonly<Record<string, unknown>>;
export interface PhysicalSmsSnapshot {
  readonly queues: readonly PhysicalSmsRow[];
  readonly drafts: readonly PhysicalSmsRow[];
}

export async function physicalSmsTable(
  db: Database,
  table: SmsPhysicalTable
): Promise<readonly PhysicalSmsRow[]> {
  const query =
    table === "sms_review_queues"
      ? 'select * from "sms_review_queues"'
      : 'select * from "sms_review_draft_items"';
  const actual: readonly unknown[] = await db
    .get<Model>(table)
    .query(Q.unsafeSqlQuery(query))
    .unsafeFetchRaw();
  const rows = actual.map((item): PhysicalSmsRow => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new Error("invalid_physical_sms_row");
    const result: PhysicalSmsRow = Object.fromEntries(Object.entries(item));
    if (
      typeof result.id !== "string" ||
      !["created", "updated", "synced", "deleted"].includes(
        String(result._status)
      )
    )
      throw new Error("invalid_physical_sms_identity");
    return result;
  });
  return rows.sort((a, b) =>
    String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
  );
}

export async function physicalSmsSnapshot(
  db: Database
): Promise<PhysicalSmsSnapshot> {
  return {
    queues: await physicalSmsTable(db, "sms_review_queues"),
    drafts: await physicalSmsTable(db, "sms_review_draft_items"),
  };
}

export function originalDeletedDraftId(): string {
  return testUuid(951);
}

export async function cachedOriginalTombstone(
  db: Database
): Promise<SmsReviewDraftItem> {
  const id = originalDeletedDraftId();
  const physical = await physicalSmsTable(db, "sms_review_draft_items");
  if (
    !physical.some(
      (item) =>
        item.id === id &&
        item._status === "deleted" &&
        item.sms_fingerprint === FINGERPRINT_A
    )
  )
    throw new Error("unavailable_original_sqlite_tombstone");
  const model = await db
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .find(id);
  if (model.id !== id || model._raw._status !== "deleted")
    throw new Error("unavailable_original_hydrated_tombstone");
  return model;
}

export async function mutateOriginalPhysical(
  db: Database,
  column: "payload_json" | "user_id" | "queue_id" | "updated_at",
  value: string | number
): Promise<void> {
  const row = (await physicalSmsTable(db, "sms_review_draft_items")).find(
    (item) => item.id === originalDeletedDraftId()
  );
  if (
    !row ||
    row._status !== "deleted" ||
    row.sms_fingerprint !== FINGERPRINT_A
  )
    throw new Error("missing_sealed_original_for_mutation");
  await db.write(() =>
    db.adapter.unsafeExecute({
      sqls: [
        [
          'update "sms_review_draft_items" set "' +
            column +
            '" = ? where "id" = ?',
          [value, originalDeletedDraftId()],
        ],
      ],
    })
  );
}

export interface PendingAdd {
  readonly actionId: string;
  readonly accountId: string;
  readonly privateJson: string;
  readonly rootRaw: string;
  readonly accountRaw: string;
}
/** Create through actual public Add service, never seed private JSON directly. */
export async function createGenuinePendingAdd(input: {
  readonly database: Database;
  readonly hashProvider: Sha256Provider;
  readonly createId: () => string;
}): Promise<PendingAdd> {
  const service = createAccountDefaultIntentService({
    database: input.database,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: input.createId,
    now: (): Date => new Date("2026-10-16T13:00:00.000Z"),
    hashProvider: input.hashProvider,
  });
  const prepared = await service.prepare(
    OWNER,
    accountFormSchema.parse({
      name: "Synthetic parked Add Cash",
      balance: "0",
      accountType: "CASH",
      defaultIntent: false,
      currency: "EGP",
      institutionId: null,
      providerDisplayName: "",
      senderNames: [],
      cardLast4: "",
    })
  );
  await expect(service.commitPrepared(prepared)).resolves.toMatchObject({
    kind: "committed",
    accountId: prepared.accountId,
  });
  const action = await root(input.database, prepared.envelope.actionId);
  const privateJson = action.localRecoverySnapshotJson;
  if (!privateJson) throw new Error("missing_actual_Add_private_capture");
  expect(
    parseAccountCreateDefaultLocalRecoverySnapshotJson({
      json: privateJson,
      expectedRoot: {
        actionId: prepared.envelope.actionId,
        ownerId: OWNER,
        domainReferenceId: prepared.accountId,
        payloadHash: action.payloadHash,
        expectedDefaultSnapshot: prepared.snapshot,
      },
    }).version
  ).toBe("account-create-default-local-save/v1");
  expect(action).toMatchObject({
    kind: "create_with_default",
    state: "local_complete",
    userId: OWNER,
  });
  const account = await input.database
    .get<Account>("accounts")
    .find(prepared.accountId);
  expect(account.deleted).toBe(false);
  expect(account.balance).toBe(0);
  return {
    actionId: prepared.envelope.actionId,
    accountId: prepared.accountId,
    privateJson,
    rootRaw: JSON.stringify(action._raw),
    accountRaw: JSON.stringify(account._raw),
  };
}

/** Append a genuine in-transaction duplicate account primary-key INSERT. */
export function injectPruneConstraint(db: Database): {
  readonly count: () => number;
  readonly nativeSqlError: () => string | null;
  readonly restore: () => void;
} {
  const underlying = db.adapter.underlyingAdapter;
  if (
    !(underlying instanceof SQLiteAdapter) ||
    underlying._dispatcherType !== "asynchronous" ||
    underlying._dispatcher.constructor.name !== "SqliteNodeDispatcher"
  )
    throw new Error("real_node_sqlite_dispatcher_required");
  const dispatcher = underlying._dispatcher;
  const actual = dispatcher.call.bind(dispatcher);
  let count = 0;
  let nativeSqlError: string | null = null;
  const spy = jest
    .spyOn(dispatcher, "call")
    .mockImplementation((method, args, callback): void => {
      const source: unknown = args[0];
      if (method !== "batch" || !Array.isArray(source)) {
        actual(method, args, callback);
        return;
      }
      const ops: readonly unknown[] = source;
      // Only intervene in the genuine encoded native prune batch. Both
      // original draft and queue deletions are part of the same writer; a
      // different SQL batch must pass through untouched.
      const pruneRemoval = ops.some(
        (entry) =>
          Array.isArray(entry) &&
          entry[0] === -1 &&
          typeof entry[2] === "string" &&
          (entry[2].startsWith('delete from "sms_review_queues" ') ||
            entry[2].startsWith('delete from "sms_review_draft_items" '))
      );
      if (!pruneRemoval) {
        actual(method, args, callback);
        return;
      }
      count++;
      actual(
        method,
        [
          [
            ...ops,
            [0, null, 'insert into "accounts" ("id") values (?)', [[BANK]]],
          ],
        ],
        (reply): void => {
          // SqliteNodeDispatcher wraps the REAL SQLite failure as
          // { error }; a thrown test/scope error cannot spoof this oracle.
          const result: unknown = reply;
          if (
            typeof result === "object" &&
            result !== null &&
            "error" in result
          ) {
            const error: unknown = result.error;
            // The genuine native bridge may return a cross-realm Error;
            // require a real string or string-valued message, never generic
            // object coercion that could fabricate the SQLite error oracle.
            if (typeof error === "string") nativeSqlError = error;
            else if (
              typeof error === "object" &&
              error !== null &&
              "message" in error &&
              typeof error.message === "string"
            )
              nativeSqlError = error.message;
          }
          callback(reply);
        }
      );
    });
  return {
    count: (): number => count,
    nativeSqlError: (): string | null => nativeSqlError,
    restore: (): void => spy.mockRestore(),
  };
}
