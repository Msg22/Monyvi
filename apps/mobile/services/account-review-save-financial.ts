/** #395 T048 selected-only financial creates/effects, exact integer minor units. */
import type {
  Account,
  AccountFinancialEffect,
  Transaction,
  Transfer,
} from "@monyvi/db";
import type { Database, Model } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  toMinorUnits,
  parseCanonicalUnsignedIntegerString,
  type Sha256Provider,
  type FinancialActionAccountGuard,
} from "@monyvi/logic";
import {
  formatFinancialActionLocalDate,
  getNextAccountBalance,
  getNextAccountFinancialRevision,
} from "./transaction-financial-action-service";
import type { FinancialActionLinkedExistingOperation } from "./financial-action-foundation-contracts";
import type {
  ReviewFinancialRecord,
  ReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { uuidV8FromSha256 } from "../../../packages/logic/src/account-review/identity";
import {
  requiredPlannedEntity,
  type FrozenReviewSave,
} from "./account-review-save-preparation";

type Row = FrozenReviewSave["selectedRows"][number];
type AccountEffect = ReviewBatchSavePayload["accountEffects"][number];
export interface FinancialCreatedRows {
  readonly records: readonly ReviewFinancialRecord[];
  readonly prepared: readonly Model[];
  readonly deltas: ReadonlyMap<string, bigint>;
}
export interface FinancialPosting {
  readonly effects: readonly AccountEffect[];
  readonly guards: readonly FinancialActionAccountGuard[];
  readonly preparedEffects: readonly Model[];
  readonly existingAccountOperations: readonly FinancialActionLinkedExistingOperation[];
  readonly balances: ReadonlyMap<string, number>;
  readonly revisions: ReadonlyMap<string, string>;
}
function reject(reason: string): never {
  throw new Error("account_review_financial_" + reason);
}
function currencyPlaces(currency: Row["transaction"]["currency"]): number {
  return CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION;
}
function exactAmount(row: Row): string {
  if (
    row.currency.state !== "known" ||
    row.currency.code !== row.transaction.currency
  )
    reject("currency_unconfirmed");
  const minor = toMinorUnits(
    row.amountDecimal,
    currencyPlaces(row.transaction.currency)
  );
  if (
    BigInt(minor) <= 0n ||
    Number(fromMinorUnits(minor, currencyPlaces(row.transaction.currency))) !==
      row.transaction.amount
  )
    reject("amount_roundtrip");
  return minor;
}
function accountFor(
  frozen: FrozenReviewSave,
  assignment: Row["assignment"]
): string {
  if (assignment.state === "existing") return assignment.accountId;
  if (assignment.state === "suggested")
    return requiredPlannedEntity(frozen, "account", assignment.groupId).id;
  return reject("account_unresolved");
}
function addDelta(
  deltas: Map<string, bigint>,
  id: string,
  delta: bigint
): void {
  deltas.set(id, (deltas.get(id) ?? 0n) + delta);
}
function fixedCreatedAt(model: Model, occurredAt: string): void {
  Object.assign(model._raw, { created_at: Date.parse(occurredAt) });
}
function createTransaction(
  db: Database,
  frozen: FrozenReviewSave,
  row: Row,
  accountId: string,
  amountMinorUnits: string
): { readonly record: ReviewFinancialRecord; readonly model: Transaction } {
  const id = requiredPlannedEntity(frozen, "transaction", row.rowId).id;
  const after = {
    id,
    accountId,
    amountMinorUnits,
    currency: row.transaction.currency,
    type: row.transaction.type,
    categoryId: row.transaction.categoryId,
    counterparty: row.transaction.counterparty ?? null,
    note: row.source === "VOICE" ? row.transaction.note : null,
    date: formatFinancialActionLocalDate(row.transaction.date),
    source: row.source,
    smsFingerprint: row.source === "SMS" ? row.sourceFingerprint : null,
    isDraft: false as const,
    linkedAssetId: null,
    linkedDebtId: null,
    linkedRecurringId: null,
    createdAt: frozen.intent.occurredAt,
    deleted: false as const,
  };
  const model = db
    .get<Transaction>("transactions")
    .prepareCreate((candidate) => {
      candidate._raw.id = id;
      candidate.userId = frozen.intent.ownerId;
      candidate.accountId = accountId;
      candidate.amount = row.transaction.amount;
      candidate.currency = row.transaction.currency;
      candidate.type = row.transaction.type;
      candidate.categoryId = row.transaction.categoryId;
      candidate.counterparty = after.counterparty ?? undefined;
      candidate.note = after.note ?? undefined;
      candidate.date = new Date(row.transaction.date);
      candidate.source = row.source;
      candidate.smsFingerprint = after.smsFingerprint ?? undefined;
      candidate.isDraft = false;
      candidate.deleted = false;
      fixedCreatedAt(candidate, frozen.intent.occurredAt);
    });
  return {
    model,
    record: {
      entity: "transaction",
      mode: "create",
      expectedUpdatedAt: null,
      after,
    },
  };
}
function createTransfer(
  db: Database,
  frozen: FrozenReviewSave,
  row: Row,
  fromId: string,
  toId: string,
  amountMinorUnits: string
): { readonly record: ReviewFinancialRecord; readonly model: Transfer } {
  if (row.source !== "SMS" || fromId === toId) reject("transfer_endpoints");
  const id = requiredPlannedEntity(frozen, "transfer", row.rowId).id;
  const after = {
    id,
    fromAccountId: fromId,
    toAccountId: toId,
    amountMinorUnits,
    convertedAmountMinorUnits: null,
    exchangeRate: null,
    currency: row.transaction.currency,
    date: formatFinancialActionLocalDate(row.transaction.date),
    notes: null,
    smsFingerprint: row.sourceFingerprint,
    createdAt: frozen.intent.occurredAt,
    deleted: false as const,
  };
  const model = db.get<Transfer>("transfers").prepareCreate((candidate) => {
    candidate._raw.id = id;
    candidate.userId = frozen.intent.ownerId;
    candidate.fromAccountId = fromId;
    candidate.toAccountId = toId;
    candidate.amount = row.transaction.amount;
    candidate.currency = row.transaction.currency;
    candidate.date = new Date(row.transaction.date);
    candidate.smsFingerprint = row.sourceFingerprint;
    candidate.deleted = false;
    fixedCreatedAt(candidate, frozen.intent.occurredAt);
  });
  return {
    model,
    record: {
      entity: "transfer",
      mode: "create",
      expectedUpdatedAt: null,
      after,
    },
  };
}
export function buildSelectedFinancialRows(
  db: Database,
  frozen: FrozenReviewSave,
  selected: readonly Row[]
): FinancialCreatedRows {
  const records: ReviewFinancialRecord[] = [];
  const prepared: Model[] = [];
  const deltas = new Map<string, bigint>();
  for (const row of selected) {
    const minor = exactAmount(row);
    const sourceId = accountFor(frozen, row.assignment);
    const isAtm =
      row.source === "SMS" && row.transaction.isAtmWithdrawal === true;
    if (isAtm) {
      if (!row.toAssignment) reject("transfer_destination");
      const toId = accountFor(frozen, row.toAssignment);
      const created = createTransfer(db, frozen, row, sourceId, toId, minor);
      records.push(created.record);
      prepared.push(created.model);
      addDelta(deltas, sourceId, -BigInt(minor));
      addDelta(deltas, toId, BigInt(minor));
    } else {
      const created = createTransaction(db, frozen, row, sourceId, minor);
      records.push(created.record);
      prepared.push(created.model);
      addDelta(
        deltas,
        sourceId,
        row.transaction.type === "INCOME" ? BigInt(minor) : -BigInt(minor)
      );
    }
  }
  return { records, prepared, deltas };
}
async function uniqueEffectId(
  actionId: string,
  accountId: string,
  hashProvider: Sha256Provider
): Promise<string> {
  return uuidV8FromSha256(
    await hashProvider.digestUtf8(
      JSON.stringify(["account-review-effect/v1", actionId, accountId])
    )
  );
}
function updateOwnedAccount(
  account: Account,
  expectedRevision: string,
  nextRevision: string,
  nextBalance: number,
  ownerId: string
): FinancialActionLinkedExistingOperation {
  return {
    kind: "update",
    model: account,
    update: () => {
      if (
        account.userId !== ownerId ||
        account.deleted ||
        account.financialRevision !== expectedRevision
      )
        reject("revision_stale");
      account.balance = nextBalance;
      account.financialRevision = nextRevision;
    },
  };
}
function createPostedEffect(
  db: Database,
  input: {
    readonly ownerId: string;
    readonly actionId: string;
    readonly item: AccountEffect;
    readonly acceptedRevision: string;
  }
): AccountFinancialEffect {
  return db
    .get<AccountFinancialEffect>("account_financial_effects")
    .prepareCreate((effect) => {
      effect._raw.id = input.item.effectId;
      effect.userId = input.ownerId;
      effect.accountId = input.item.accountId;
      effect.actionId = input.actionId;
      effect.amountMinorUnits = input.item.amountMinorUnits;
      effect.currency = input.item.currency;
      effect.acceptedAccountRevision = input.acceptedRevision;
      effect.domain = "transactions";
      effect.kind = "review.batch-save";
      effect.isEffective = true;
      effect.deleted = false;
      effect.compensatedAt = null;
      effect.reversesEffectId = null;
    });
}
export async function buildFinancialPosting(
  db: Database,
  frozen: FrozenReviewSave,
  created: FinancialCreatedRows,
  existing: ReadonlyMap<string, Account>,
  newCurrencies: ReadonlyMap<string, Row["transaction"]["currency"]>,
  hashProvider: Sha256Provider
): Promise<FinancialPosting> {
  const effects: AccountEffect[] = [];
  const guards: FinancialActionAccountGuard[] = [];
  const preparedEffects: Model[] = [];
  const existingAccountOperations: FinancialActionLinkedExistingOperation[] =
    [];
  const balances = new Map<string, number>();
  const revisions = new Map<string, string>();
  for (const accountId of [...created.deltas.keys()].sort()) {
    const account = existing.get(accountId);
    const currency = account?.currency ?? newCurrencies.get(accountId);
    if (!currency) reject("affected_account_missing");
    const currentRevision = account?.financialRevision ?? "0";
    const delta = created.deltas.get(accountId);
    if (delta === undefined) reject("effect_missing");
    const nextRevision = getNextAccountFinancialRevision(currentRevision);
    const nextBalance = getNextAccountBalance(
      account?.balance ?? 0,
      delta.toString(),
      currency
    );
    const item = {
      accountId,
      amountMinorUnits: delta.toString(),
      currency,
      effectId: await uniqueEffectId(
        frozen.intent.actionId,
        accountId,
        hashProvider
      ),
    };
    effects.push(item);
    guards.push({
      accountId,
      expectedRevision: parseCanonicalUnsignedIntegerString(currentRevision),
    });
    balances.set(accountId, nextBalance);
    revisions.set(accountId, nextRevision);
    preparedEffects.push(
      createPostedEffect(db, {
        ownerId: frozen.intent.ownerId,
        actionId: frozen.intent.actionId,
        item,
        acceptedRevision: nextRevision,
      })
    );
    if (account)
      existingAccountOperations.push(
        updateOwnedAccount(
          account,
          currentRevision,
          nextRevision,
          nextBalance,
          frozen.intent.ownerId
        )
      );
  }
  return {
    effects,
    guards,
    preparedEffects,
    existingAccountOperations,
    balances,
    revisions,
  };
}
