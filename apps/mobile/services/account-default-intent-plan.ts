/**
 * #395 T068: one prepared linked Add plan, owned logical CAS on both
 * cached and prepared boundaries. The foundation owns atomic batch/rollback.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
} from "@monyvi/db";
import type { AccountFormData } from "../validation/account-validation";
import type { CurrentUserDataScope } from "./user-data-access";
import type {
  FinancialActionLinkedOperationPlan,
  FinancialActionLinkedOperationPostimage,
} from "./financial-action-foundation-contracts";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";
import type { AccountDefaultPreparedCommand } from
  "./account-default-intent-command";
import {
  readOwnedDefaultSnapshot,
  assertOwnedDefaultSnapshot,
} from "./account-default-intent-snapshot";

export const ACCOUNT_DEFAULT_WRITER_ERRORS = {
  AUTH: "account_default_writer_auth_scope_changed",
  STALE: "account_default_stale_default_snapshot",
  ABSENT: "account_default_writer_create_id_collision",
  INVALID_PLAN: "account_default_writer_invalid_plan",
} as const;
export interface AccountDefaultPlanDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<CurrentUserDataScope>;
  readonly assertExpectedCurrentUser: (ownerId: string) => Promise<void>;
  readonly assertNoDuplicateAccountIdentity: (
    existing: readonly Account[],
    form: Readonly<AccountFormData>
  ) => void;
}
function fail(code: string): never {
  throw new Error(code);
}
function isRecord(raw: unknown): raw is Readonly<Record<string, unknown>> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}
function property(raw: unknown, key: string): unknown {
  if (!isRecord(raw)) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  return raw[key];
}
async function currentOwned(
  input: AccountDefaultPreparedCommand,
  dep: AccountDefaultPlanDependencies
): Promise<{ readonly scope: CurrentUserDataScope; readonly accounts: readonly Account[] }> {
  await dep.assertExpectedCurrentUser(input.ownerId);
  const scope = await dep.getCurrentUserDataScope();
  if (scope.userId !== input.ownerId)
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.AUTH);
  const { accounts, snapshot } = await readOwnedDefaultSnapshot(
    dep.database, scope
  );
  assertOwnedDefaultSnapshot(input.snapshot, snapshot);
  await dep.assertExpectedCurrentUser(input.ownerId);
  return { scope, accounts };
}
async function assertAbsentIdentity(
  db: Database,
  table: string,
  id: string
): Promise<void> {
  // Global collision protection is necessary even for foreign/soft-deleted
  // physical IDs, but does not expose the found record or foreign data.
  if (await db.get<Model>(table).query(Q.where("id", id)).fetchCount())
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.ABSENT);
}
async function ensureUniquePhysicalIds(
  input: AccountDefaultPreparedCommand,
  db: Database
): Promise<void> {
  await assertAbsentIdentity(db, "accounts", input.accountId);
  if (input.bankDetailId)
    await assertAbsentIdentity(db, "bank_details", input.bankDetailId);
  for (const sender of input.senders)
    await assertAbsentIdentity(db, "account_sms_senders", sender.id);
  if (input.effectId)
    await assertAbsentIdentity(db, "account_financial_effects", input.effectId);
}
function fixedDate(model: Model, occurredAt: string): void {
  Object.assign(model._raw, { created_at: Date.parse(occurredAt) });
}
function prepareAccount(
  db: Database,
  input: AccountDefaultPreparedCommand
): Account {
  const f = input.form;
  const isDefault =
    f.defaultIntent === true || input.snapshot.activeAccountIds.length === 0;
  const model = db.get<Account>("accounts").prepareCreate((account) => {
    account._raw.id = input.accountId;
    account.userId = input.ownerId;
    account.name = f.name.trim();
    account.type = f.accountType;
    account.currency = f.currency;
    account.institutionId = f.institutionId ?? undefined;
    account.providerDisplayName =
      f.providerDisplayName?.trim() || f.bankName?.trim() || undefined;
    account.balance = input.openingBalance;
    account.financialRevision = input.effectId ? "1" : "0";
    account.isDefault = isDefault;
    account.deleted = false;
    fixedDate(account, input.envelope.occurredAt);
  });
  return model;
}
function prepareBankChild(
  db: Database,
  input: AccountDefaultPreparedCommand,
  id: string
): BankDetails {
  return db.get<BankDetails>("bank_details").prepareCreate((details) => {
    details._raw.id = id;
    details.accountId = input.accountId;
    details.accountNumber = input.form.accountNumber?.trim() || undefined;
    details.cardLast4 = normalizeCardLast4ForStorage(input.form.cardLast4);
    details.deleted = false;
    fixedDate(details, input.envelope.occurredAt);
  });
}
function prepareSenderChildren(
  db: Database,
  input: AccountDefaultPreparedCommand
): readonly AccountSmsSender[] {
  return input.senders.map((entry) =>
    db.get<AccountSmsSender>("account_sms_senders")
      .prepareCreate((row) => {
        row._raw.id = entry.id;
        row.accountId = input.accountId;
        row.senderName = entry.senderName;
        row.normalizedSenderName = entry.normalizedSenderName;
        row.deleted = false;
        fixedDate(row, input.envelope.occurredAt);
      })
  );
}
function prepareOpeningEffect(
  db: Database,
  input: AccountDefaultPreparedCommand,
  effectId: string
): AccountFinancialEffect {
  return db.get<AccountFinancialEffect>("account_financial_effects")
    .prepareCreate((effect) => {
      effect._raw.id = effectId;
      effect.userId = input.ownerId;
      effect.accountId = input.accountId;
      effect.actionId = input.envelope.actionId;
      effect.amountMinorUnits = input.openingMinorUnits;
      effect.currency = input.form.currency;
      effect.acceptedAccountRevision = "1";
      effect.domain = "accounts";
      effect.kind = "account.create-default";
      effect.isEffective = true;
      effect.deleted = false;
      effect.compensatedAt = null;
      effect.reversesEffectId = null;
    });
}
function expectedModelKeys(input: AccountDefaultPreparedCommand): readonly string[] {
  return [
    "accounts:" + input.accountId,
    ...(input.bankDetailId ? ["bank_details:" + input.bankDetailId] : []),
    ...input.senders.map((sender) => "account_sms_senders:" + sender.id),
    ...(input.effectId ? ["account_financial_effects:" + input.effectId] : []),
    ...(input.snapshot.defaultAccount &&
      (input.form.defaultIntent === true ||
        input.snapshot.activeAccountIds.length === 0)
      ? ["accounts:" + input.snapshot.defaultAccount.accountId]
      : []),
  ].sort();
}
function verifyPreparedModels(
  input: AccountDefaultPreparedCommand,
  items: readonly FinancialActionLinkedOperationPostimage[]
): void {
  const expected = expectedModelKeys(input);
  const actual = items.map((row) => row.table + ":" + row.id).sort();
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => actual[index] !== id)
  ) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
  for (const row of items) {
    if (row.table === "accounts" && row.id === input.accountId) {
      if (
        row.kind !== "create" ||
        property(row.raw, "user_id") !== input.ownerId ||
        property(row.raw, "balance") !== input.openingBalance ||
        property(row.raw, "financial_revision") !==
          (input.effectId ? "1" : "0") ||
        property(row.raw, "is_default") !==
          (input.form.defaultIntent === true ||
           input.snapshot.activeAccountIds.length === 0) ||
        property(row.raw, "currency") !== input.form.currency ||
        property(row.raw, "deleted") !== false
      ) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    } else if (
      row.table === "accounts" &&
      row.id === input.snapshot.defaultAccount?.accountId
    ) {
      if (
        row.kind !== "update" ||
        property(row.raw, "user_id") !== input.ownerId ||
        property(row.raw, "is_default") !== false
      ) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    } else if (row.table === "account_financial_effects") {
      if (
        row.kind !== "create" ||
        row.id !== input.effectId ||
        property(row.raw, "action_id") !== input.envelope.actionId ||
        property(row.raw, "user_id") !== input.ownerId ||
        property(row.raw, "amount_minor_units") !== input.openingMinorUnits ||
        property(row.raw, "account_id") !== input.accountId ||
        property(row.raw, "accepted_account_revision") !== "1" ||
        property(row.raw, "is_effective") !== true
      ) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    } else if (
      (row.table === "bank_details" ||
        row.table === "account_sms_senders") &&
      (row.kind !== "create" ||
        property(row.raw, "account_id") !== input.accountId)
    ) {
      fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
    }
  }
}

/** Called by the feature foundation while inside its one database.write(). */
export async function prepareAccountDefaultLinkedPlan(
  input: AccountDefaultPreparedCommand,
  dep: AccountDefaultPlanDependencies
): Promise<FinancialActionLinkedOperationPlan> {
  const { accounts } = await currentOwned(input, dep);
  dep.assertNoDuplicateAccountIdentity(accounts, input.form);
  await ensureUniquePhysicalIds(input, dep.database);
  await dep.assertExpectedCurrentUser(input.ownerId);

  const previousId =
    input.form.defaultIntent === true ? input.snapshot.defaultAccount?.accountId : null;
  const previous = previousId
    ? accounts.find((item) => item.id === previousId)
    : undefined;
  if (previousId && (!previous || !previous.isDefault ||
                     previous.deleted || previous.userId !== input.ownerId))
    fail(ACCOUNT_DEFAULT_WRITER_ERRORS.STALE);

  const preparedCreates: Model[] = [prepareAccount(dep.database, input)];
  if (input.bankDetailId)
    preparedCreates.push(prepareBankChild(dep.database, input, input.bankDetailId));
  preparedCreates.push(...prepareSenderChildren(dep.database, input));
  if (input.effectId)
    preparedCreates.push(prepareOpeningEffect(dep.database, input, input.effectId));
  const existingOperations: FinancialActionLinkedOperationPlan["existingOperations"] =
    previous
      ? [{
          kind: "update",
          model: previous,
          update: () => {
            if (previous.userId !== input.ownerId ||
                previous.deleted || !previous.isDefault)
              fail(ACCOUNT_DEFAULT_WRITER_ERRORS.STALE);
            // Never touch balance/revision/name/provider or publication timestamp
            // explicitly; only this prepared flag is part of the mutation.
            previous.isDefault = false;
          },
        }]
      : [];

  return {
    preparedCreates: Object.freeze(preparedCreates),
    existingOperations: Object.freeze(existingOperations),
    assertCachedOwnership: async ({ userId, cachedPreimages }) => {
      if (userId !== input.ownerId)
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.AUTH);
      if (
        cachedPreimages.length !== (previous ? 1 : 0) ||
        (previous && (
          cachedPreimages[0]?.id !== previous.id ||
          cachedPreimages[0].table !== "accounts" ||
          property(cachedPreimages[0].raw, "user_id") !== input.ownerId ||
          property(cachedPreimages[0].raw, "is_default") !== true
        ))
      ) fail(ACCOUNT_DEFAULT_WRITER_ERRORS.INVALID_PLAN);
      await currentOwned(input, dep);
    },
    assertPreparedOwnership: async ({ userId, preparedPostimages }) => {
      if (userId !== input.ownerId)
        fail(ACCOUNT_DEFAULT_WRITER_ERRORS.AUTH);
      verifyPreparedModels(input, preparedPostimages);
      // At this stage Watermelon's cached prior-default model has already
      // been prepareUpdate()'d to false. Re-reading cached isDefault here
      // would falsely reject every legitimate replacement. The exact
      // pre-update logical CAS was checked above within this writer; the
      // foundation now owns immutable pre/post images and the atomic batch.
      await dep.assertExpectedCurrentUser(input.ownerId);
    },
  };
}
