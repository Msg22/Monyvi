/** #395 T048 confirmed account creations with frozen physical IDs and children. */
import type {
  Account,
  AccountSmsSender,
  BankDetails,
  CurrencyType,
} from "@monyvi/db";
import type { Database, Model } from "@nozbe/watermelondb";
import type { Sha256Provider } from "@monyvi/logic";
import { uuidV8FromSha256 } from "../../../packages/logic/src/account-review/identity";
import type {
  ReviewMutation,
  ReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { normalizeAccountSmsSender } from "./account-sms-sender-service";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";
import {
  requiredPlannedEntity,
  type FrozenReviewSave,
} from "./account-review-save-preparation";

type Group = FrozenReviewSave["neededGroups"][number];
export interface CreatedReviewAccounts {
  readonly records: readonly ReviewMutation[];
  readonly prepared: readonly Model[];
  readonly newCurrencies: ReadonlyMap<string, CurrencyType>;
  readonly usedPhysicalIds: ReadonlySet<string>;
  readonly snapshot: ReviewBatchSavePayload["creationDefaultSnapshot"];
}
function reject(reason: string): never {
  throw new Error("account_review_account_" + reason);
}
function fixedCreatedAt(model: Model, occurredAt: string): void {
  Object.assign(model._raw, { created_at: Date.parse(occurredAt) });
}
function normalizedSenderPairs(names: readonly string[]): ReadonlyArray<{
  readonly label: string;
  readonly normalized: string;
}> {
  const seen = new Set<string>();
  return names.flatMap((original) => {
    const label = original.trim().replace(/\s+/g, " ");
    const normalized = normalizeAccountSmsSender(label);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ label, normalized }];
  });
}
async function childAlias(
  frozen: FrozenReviewSave,
  groupId: string,
  entity: "bank_details" | "account_sms_sender",
  provider: Sha256Provider,
  normalized?: string
): Promise<string> {
  const parts = [
    "account-review-localref/v1",
    frozen.intent.ownerId,
    frozen.intent.sessionId,
    groupId,
    entity,
  ];
  if (normalized !== undefined) parts.push(normalized);
  return uuidV8FromSha256(await provider.digestUtf8(JSON.stringify(parts)));
}
function accountModel(
  db: Database,
  frozen: FrozenReviewSave,
  group: Group,
  id: string,
  balance: number,
  revision: string,
  isDefault: boolean
): Account {
  const accountType = group.type;
  if (accountType === null) reject("type_missing");
  return db.get<Account>("accounts").prepareCreate((account) => {
    account._raw.id = id;
    account.userId = frozen.intent.ownerId;
    account.name = group.name;
    account.type = accountType;
    account.currency = group.currency;
    account.institutionId = group.institutionId ?? undefined;
    account.providerDisplayName = group.providerDisplayName ?? undefined;
    account.balance = balance;
    account.financialRevision = revision;
    account.isDefault = isDefault;
    account.deleted = false;
    fixedCreatedAt(account, frozen.intent.occurredAt);
  });
}
function createAccountRecord(
  frozen: FrozenReviewSave,
  group: Group,
  id: string,
  isDefault: boolean
): ReviewMutation {
  if (group.type === null) reject("type_missing");
  return {
    entity: "account",
    mode: "create",
    expectedUpdatedAt: null,
    after: {
      id,
      name: group.name,
      type: group.type,
      currency: group.currency,
      institutionId: group.institutionId,
      providerDisplayName: group.providerDisplayName,
      isDefault,
      createdAt: frozen.intent.occurredAt,
      deleted: false,
      openingBalanceMinorUnits: "0",
      targetBalanceMinorUnits: null,
    },
  };
}
function bankChild(
  db: Database,
  frozen: FrozenReviewSave,
  group: Group,
  accountId: string,
  id: string
): { readonly record: ReviewMutation; readonly model: BankDetails } {
  const model = db.get<BankDetails>("bank_details").prepareCreate((bank) => {
    bank._raw.id = id;
    bank.accountId = accountId;
    bank.accountNumber = undefined;
    bank.cardLast4 = normalizeCardLast4ForStorage(group.cardLast4);
    bank.deleted = false;
    fixedCreatedAt(bank, frozen.intent.occurredAt);
  });
  return {
    model,
    record: {
      entity: "bank_details",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id,
        accountId,
        accountNumber: null,
        cardLast4: group.cardLast4,
        createdAt: frozen.intent.occurredAt,
        deleted: false,
      },
    },
  };
}
function senderChild(
  db: Database,
  frozen: FrozenReviewSave,
  accountId: string,
  id: string,
  label: string,
  normalized: string
): { readonly record: ReviewMutation; readonly model: AccountSmsSender } {
  const model = db
    .get<AccountSmsSender>("account_sms_senders")
    .prepareCreate((sender) => {
      sender._raw.id = id;
      sender.accountId = accountId;
      sender.senderName = label;
      sender.normalizedSenderName = normalized;
      sender.deleted = false;
      fixedCreatedAt(sender, frozen.intent.occurredAt);
    });
  return {
    model,
    record: {
      entity: "account_sms_sender",
      mode: "create",
      expectedUpdatedAt: null,
      after: {
        id,
        accountId,
        senderName: label,
        normalizedSenderName: normalized,
        createdAt: frozen.intent.occurredAt,
        deleted: false,
      },
    },
  };
}
async function prepareGroupChildren(
  db: Database,
  frozen: FrozenReviewSave,
  group: Group,
  accountId: string,
  hashProvider: Sha256Provider
): Promise<{
  readonly records: readonly ReviewMutation[];
  readonly models: readonly Model[];
  readonly ids: readonly string[];
}> {
  const records: ReviewMutation[] = [];
  const models: Model[] = [];
  const ids: string[] = [];
  if (group.type === "CASH") return { records, models, ids };
  if (group.type === "BANK") {
    const alias = await childAlias(
      frozen,
      group.groupId,
      "bank_details",
      hashProvider
    );
    const id = requiredPlannedEntity(frozen, "bank_details", alias).id;
    const bank = bankChild(db, frozen, group, accountId, id);
    records.push(bank.record);
    models.push(bank.model);
    ids.push(id);
  }
  for (const { label, normalized } of normalizedSenderPairs(
    group.senderNames
  )) {
    const alias = await childAlias(
      frozen,
      group.groupId,
      "account_sms_sender",
      hashProvider,
      normalized
    );
    const id = requiredPlannedEntity(frozen, "account_sms_sender", alias).id;
    const sender = senderChild(db, frozen, accountId, id, label, normalized);
    records.push(sender.record);
    models.push(sender.model);
    ids.push(id);
  }
  return { records, models, ids };
}
export function ownedActiveDefaultSnapshot(
  accounts: readonly Account[]
): NonNullable<ReviewBatchSavePayload["creationDefaultSnapshot"]> {
  const active = accounts.filter((item) => !item.deleted);
  const activeAccountIds = active.map((item) => item.id).sort();
  const defaults = active.filter((item) => item.isDefault);
  if (defaults.length > 1) reject("multiple_owned_defaults");
  return {
    activeAccountIds,
    defaultAccount: defaults[0]
      ? { accountId: defaults[0].id, isDefault: true }
      : null,
  };
}
function assertExactPhysicalCoverage(
  frozen: FrozenReviewSave,
  used: ReadonlySet<string>
): void {
  const allowed = new Set(
    frozen.intent.plannedEntityIds.map((item) => item.id)
  );
  if ([...used].some((id) => !allowed.has(id))) reject("unplanned_created_id");
}
async function prepareCreatedReviewGroup(
  db: Database,
  frozen: FrozenReviewSave,
  group: Group,
  balances: ReadonlyMap<string, number>,
  revisions: ReadonlyMap<string, string>,
  provider: Sha256Provider,
  firstDefaultId: string | undefined
): Promise<{
  readonly accountId: string;
  readonly records: readonly ReviewMutation[];
  readonly models: readonly Model[];
  readonly ids: readonly string[];
}> {
  const id = requiredPlannedEntity(frozen, "account", group.groupId).id;
  const balance = balances.get(id);
  const revision = revisions.get(id);
  if (balance === undefined || revision === undefined)
    reject("financial_outcome_missing");
  const account = accountModel(
    db,
    frozen,
    group,
    id,
    balance,
    revision,
    id === firstDefaultId
  );
  const record = createAccountRecord(frozen, group, id, id === firstDefaultId);
  const children = await prepareGroupChildren(db, frozen, group, id, provider);
  return {
    accountId: id,
    records: [record, ...children.records],
    models: [account, ...children.models],
    ids: [id, ...children.ids],
  };
}

export async function buildCreatedReviewAccounts(
  db: Database,
  frozen: FrozenReviewSave,
  groups: readonly Group[],
  balances: ReadonlyMap<string, number>,
  revisions: ReadonlyMap<string, string>,
  provider: Sha256Provider,
  financialIds: ReadonlySet<string>,
  snapshot: ReviewBatchSavePayload["creationDefaultSnapshot"]
): Promise<CreatedReviewAccounts> {
  if (groups.length > 0 !== (snapshot !== undefined))
    reject("creation_snapshot_presence");
  const ids = groups.map(
    (group) => requiredPlannedEntity(frozen, "account", group.groupId).id
  );
  const firstDefaultId =
    snapshot?.activeAccountIds.length === 0 ? [...ids].sort()[0] : undefined;
  const records: ReviewMutation[] = [];
  const prepared: Model[] = [];
  const newCurrencies = new Map<string, CurrencyType>();
  const used = new Set(financialIds);
  for (const group of groups) {
    const created = await prepareCreatedReviewGroup(
      db,
      frozen,
      group,
      balances,
      revisions,
      provider,
      firstDefaultId
    );
    records.push(...created.records);
    prepared.push(...created.models);
    created.ids.forEach((id) => used.add(id));
    newCurrencies.set(created.accountId, group.currency);
  }
  assertExactPhysicalCoverage(frozen, used);
  return { records, prepared, newCurrencies, usedPhysicalIds: used, snapshot };
}
