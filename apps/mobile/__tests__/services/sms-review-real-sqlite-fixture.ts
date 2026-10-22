/** Real records matching pinned T010 context; no invented sender/card evidence. */
import type { CategoryTreeSource } from "@monyvi/logic";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  Category,
  Profile,
  SmsReviewDraftItem,
  Transfer,
} from "@monyvi/db";
import {
  accountReviewCommandSchema,
  accountReviewSessionSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import type { AccountReviewCommandResult } from "../../../../packages/logic/src/account-review/reducer";
import { deriveManualRowAccountReviewGroupIdentity } from "../../../../packages/logic/src/account-review/identity";
import { decodeSmsReviewDraftPayload } from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  makeT025SmsOriginal,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  makeOwnedContext,
  NORMALIZATION_IDS,
  syntheticHashProvider,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";

type CapturedContext = ReturnType<typeof makeOwnedContext>;

export const SMS_REVIEW_OTHER_CATEGORY_ID =
  "00000000-0000-4000-8000-000000000206";

/** Real fallback category: shared by parser context and owned SQLite fixtures. */
export function smsReviewFixtureCategories(): readonly CategoryTreeSource[] {
  return [
    {
      id: NORMALIZATION_IDS.shoppingCategory,
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
    {
      id: SMS_REVIEW_OTHER_CATEGORY_ID,
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
  ];
}

function prepareProfile(
  database: Database,
  captured: CapturedContext,
  now: Date
): Profile {
  return database.get<Profile>("profiles").prepareCreate((record): void => {
    record.userId = captured.ownerId;
    record.preferredCurrency = captured.preferredCurrency;
    record.preferredLanguage = "en";
    record.theme = "SYSTEM";
    record.deleted = false;
    record.onboardingCompleted = true;
    record.setupGuideCompleted = true;
    record.smsDetectionEnabled = true;
    record.updatedAt = now;
  });
}

function prepareAccounts(
  database: Database,
  captured: CapturedContext,
  now: Date
): Account[] {
  return captured.accounts.map((account) =>
    database.get<Account>("accounts").prepareCreate((record): void => {
      record._raw.id = account.id;
      record.userId = captured.ownerId;
      record.name = account.name;
      record.type = account.type;
      record.currency = account.currency;
      record.institutionId = account.institutionId ?? undefined;
      record.providerDisplayName = account.providerDisplayName ?? undefined;
      record.balance = 0;
      record.financialRevision = "0";
      record.deleted = false;
      record.isDefault = account.isDefault;
      record.updatedAt = now;
    })
  );
}

function prepareCategory(
  database: Database,
  category: CategoryTreeSource,
  now: Date
): Category {
  return database.get<Category>("categories").prepareCreate((record): void => {
    record._raw.id = category.id;
    record.displayName = category.displayName;
    record.systemName = category.systemName;
    record.icon = "cart-outline";
    record.iconLibrary = "Ionicons";
    record.type = "EXPENSE";
    record.level = 1;
    record.isSystem = true;
    record.isInternal = false;
    record.isHidden = false;
    record.usageCount = 0;
    record.deleted = false;
    record.updatedAt = now;
  });
}

export async function seedCapturedSmsReviewContext(
  database: Database,
  ownerId: string
): Promise<void> {
  const captured = makeOwnedContext();
  if (captured.ownerId !== ownerId)
    throw new Error("Synthetic captured SMS context has another owner");
  const now = new Date("2026-10-14T12:00:00.000Z");
  await database.write(async (): Promise<void> => {
    await database.batch(
      prepareProfile(database, captured, now),
      ...prepareAccounts(database, captured, now),
      ...smsReviewFixtureCategories().map((category) =>
        prepareCategory(database, category, now)
      )
    );
  });
}

/** Preserve the captured SMS identity while marking its verified ATM context. */
export function makeT025AtmSmsOriginal(): ReturnType<
  typeof makeT025SmsOriginal
> {
  return {
    ...makeT025SmsOriginal(0),
    isAtmWithdrawal: true,
    rawSmsBody: "QNB ATM withdrawal EGP 50",
  };
}

export function withT025CashDestination(
  session: AccountReviewSession
): AccountReviewSession {
  return accountReviewSessionSchema.parse({
    ...session,
    rows: session.rows.map((row) =>
      row.sourceFingerprint === T025_IDS.fingerprintOne
        ? {
            ...row,
            toAssignment: {
              state: "unresolved",
              accountId: null,
              reasonCode: "cash_transfer_review",
              candidateAccountIds: [],
            },
          }
        : row
    ),
  });
}

/** Set up a real owned SQLite ATM review, without mocking the serialized writer. */
export async function prepareT025CashDraftInWriter(input: {
  readonly database: Database;
  readonly session: AccountReviewSession;
  readonly execute: (
    command: AccountReviewCommand
  ) => Promise<AccountReviewCommandResult>;
}): Promise<{
  readonly confirmed: AccountReviewCommandResult;
  readonly prepared: AccountReviewCommandResult;
  readonly row: AccountReviewSession["rows"][number];
  readonly draftGroupId: string;
}> {
  const cash = (
    await input.database
      .get<Account>("accounts")
      .query(Q.where("user_id", input.session.ownerId), Q.where("type", "CASH"))
      .fetch()
  )[0];
  if (!cash) throw new Error("Missing original Cash account");
  await input.database.write(async () => {
    await cash.update((account) => {
      account.deleted = true;
    });
  });
  const sourceGroup = input.session.groups[0];
  if (!sourceGroup) throw new Error("Missing ATM source group");
  const confirmed = await input.execute(
    accountReviewCommandSchema.parse({
      kind: "confirm_group",
      ownerId: input.session.ownerId,
      sessionId: input.session.sessionId,
      expectedReviewRevision: input.session.revision,
      expectedOperationGeneration: input.session.operationGeneration,
      groupId: sourceGroup.groupId,
      expectedGroupRevision: sourceGroup.revision,
    })
  );
  const row = confirmed.state.rows.find(
    (item) => item.sourceFingerprint === T025_IDS.fingerprintOne
  );
  if (!row || row.source !== "SMS") throw new Error("Missing ATM source row");
  const nonce = T025_IDS.alternateQueue;
  const identity = await deriveManualRowAccountReviewGroupIdentity({
    ownerId: confirmed.state.ownerId,
    sessionId: confirmed.state.sessionId,
    source: "SMS",
    rowId: row.rowId,
    role: "destination",
    nonce,
    identity: { name: "ATM Cash purse", type: "CASH", currency: "EGP" },
    hashProvider: syntheticHashProvider,
  });
  const prepared = await input.execute(
    accountReviewCommandSchema.parse({
      kind: "create_row_account_draft",
      ownerId: confirmed.state.ownerId,
      sessionId: confirmed.state.sessionId,
      expectedReviewRevision: confirmed.state.revision,
      expectedOperationGeneration: confirmed.state.operationGeneration,
      rowId: row.rowId,
      expectedRowRevision: row.revision,
      role: "destination",
      identity: { name: "ATM Cash purse", type: "CASH" },
      manualDraft: { nonce, ...identity },
    })
  );
  return { confirmed, prepared, row, draftGroupId: identity.groupId };
}

/** Real independent-adapter proof after the SMS serialized draft writer. */
export async function assertT025CashDraftColdReload(input: {
  readonly prepared: AccountReviewCommandResult;
  readonly row: AccountReviewSession["rows"][number];
  readonly draftGroupId: string;
  readonly queueId: string;
  readonly ownerId: string;
  readonly fresh: () => Promise<Database>;
  readonly execute: (
    command: AccountReviewCommand
  ) => Promise<AccountReviewCommandResult>;
}): Promise<void> {
  const { prepared, row, draftGroupId } = input;
  const changed = prepared.state.rows.find((item) => item.rowId === row.rowId);
  expect(changed?.assignment).toEqual(row.assignment);
  expect(changed?.toAssignment).toMatchObject({
    state: "suggested",
    groupId: draftGroupId,
    confirmation: "confirmed",
  });
  expect(changed?.selected).toBe(false);
  const fresh = await input.fresh();
  const stored = await fresh
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", input.ownerId))
    .fetch();
  const restored = stored.map((item) =>
    decodeSmsReviewDraftPayload({
      version: item.payloadVersion,
      json: item.payloadJson,
      expectedFingerprint: item.smsFingerprint,
      expectedOwnerId: item.userId,
      expectedSessionId: input.queueId,
      selectionOverride: item.selectionOverride,
    })
  );
  expect(restored).toHaveLength(2);
  const original = restored.find(
    (item) => item.review?.row.rowId === row.rowId
  );
  expect(original?.review?.row.toAssignment).toMatchObject({
    state: "suggested",
    groupId: draftGroupId,
    confirmation: "confirmed",
  });
  expect(original?.review?.groups.map((group) => group.groupId)).toEqual(
    expect.arrayContaining([T025_IDS.group, draftGroupId])
  );
  expect(
    (
      await fresh
        .get<Account>("accounts")
        .query(Q.where("user_id", input.ownerId))
        .fetch()
    ).filter((account) => !account.deleted)
  ).toHaveLength(1);
  expect(await fresh.get<Transfer>("transfers").query().fetchCount()).toBe(0);
  const changedRow = prepared.state.rows.find(
    (item) => item.rowId === row.rowId
  );
  if (!changedRow) throw new Error("Missing persisted ATM review row");
  const selected = await input.execute(
    accountReviewCommandSchema.parse({
      kind: "select_row",
      ownerId: prepared.state.ownerId,
      sessionId: prepared.state.sessionId,
      expectedReviewRevision: prepared.state.revision,
      expectedOperationGeneration: prepared.state.operationGeneration,
      rowId: row.rowId,
      expectedRowRevision: changedRow.revision,
      groupId: null,
      expectedGroupRevision: null,
      hasSharedConfirmationDisclosure: false,
    })
  );
  expect(selected.reasonCodes).toEqual([]);
  expect(
    selected.state.rows.find((item) => item.rowId === row.rowId)?.selected
  ).toBe(true);
  expect(selected.state.rows.filter((item) => item.selected)).toHaveLength(1);
}

export function decodeT025OwnedV2(
  item: SmsReviewDraftItem,
  queueId: string
): ReturnType<typeof decodeSmsReviewDraftPayload> {
  return decodeSmsReviewDraftPayload({
    version: item.payloadVersion,
    json: item.payloadJson,
    expectedFingerprint: item.smsFingerprint,
    expectedOwnerId: item.userId,
    expectedSessionId: queueId,
    selectionOverride: item.selectionOverride,
  });
}

export interface T025PhysicalSmsDraft {
  readonly id: string;
  readonly fingerprint: string;
  readonly json: string;
  readonly version: number;
  readonly selected: boolean | null;
}
export async function readT025PhysicalSmsDrafts(
  source: Database,
  ownerId: string
): Promise<readonly T025PhysicalSmsDraft[]> {
  const drafts = await source
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", ownerId))
    .fetch();
  return drafts
    .map((draft) => ({
      id: draft.id,
      fingerprint: draft.smsFingerprint,
      json: draft.payloadJson,
      version: draft.payloadVersion,
      selected: draft.selectionOverride,
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

/** Fresh Watermelon cache over the original real SQLite adapter. */
export async function openFreshT025SqliteDatabase(
  adapter: SQLiteAdapter,
  modelClasses: Array<typeof Model>
): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses,
  });
}
