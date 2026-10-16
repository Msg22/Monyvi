/** #395 T048: immutable request-to-committed-review binding; never re-post. */
import type { Database } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  toMinorUnits,
  type Sha256Provider,
} from "@monyvi/logic";
import { uuidV8FromSha256 } from "../../../packages/logic/src/account-review/identity";
import type {
  ReviewBatchSavePayload,
  ReviewMutation,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { formatFinancialActionLocalDate } from "./transaction-financial-action-service";
import { normalizeAccountSmsSender } from "./account-sms-sender-service";
import {
  requiredPlannedEntity,
  type FrozenReviewSave,
} from "./account-review-save-preparation";
import type { CurrentUserDataScope } from "./user-data-access";

type Row = FrozenReviewSave["selectedRows"][number];
type Group = FrozenReviewSave["neededGroups"][number];
type Created = ReviewMutation;
type Financial = Extract<Created, { entity: "transaction" | "transfer" }>;
type AccountCreate = Extract<Created, { entity: "account" }>;

function refuse(detail: string): never {
  throw new Error("account_review_save_replay_" + detail);
}
function check(condition: boolean, detail: string): void {
  if (!condition) refuse(detail);
}
function selectedRecordKind(row: Row): "transaction" | "transfer" {
  return row.source === "SMS" && row.transaction.isAtmWithdrawal === true
    ? "transfer"
    : "transaction";
}
function accountId(
  frozen: FrozenReviewSave,
  assignment: Row["assignment"]
): string {
  if (assignment.state === "existing") return assignment.accountId;
  if (assignment.state === "suggested")
    return requiredPlannedEntity(frozen, "account", assignment.groupId).id;
  return refuse("unresolved_assignment");
}
function minorAmount(row: Row): string {
  if (
    row.currency.state !== "known" ||
    row.currency.code !== row.transaction.currency
  )
    refuse("currency_changed");
  const places = CURRENCY_PRECISION[row.currency.code] ?? DEFAULT_PRECISION;
  const amount = toMinorUnits(row.amountDecimal, places);
  if (
    BigInt(amount) <= 0n ||
    Number(fromMinorUnits(amount, places)) !== row.transaction.amount
  ) {
    refuse("financial_amount_inconsistent");
  }
  return amount;
}
function verifyTransaction(
  frozen: FrozenReviewSave,
  row: Row,
  record: Financial
): void {
  if (record.entity !== "transaction") refuse("financial_record_type");
  const after = record.after;
  check(
    after.accountId === accountId(frozen, row.assignment) &&
      after.amountMinorUnits === minorAmount(row) &&
      after.currency === row.transaction.currency &&
      after.type === row.transaction.type &&
      after.categoryId === row.transaction.categoryId &&
      after.counterparty === (row.transaction.counterparty ?? null) &&
      after.note === (row.source === "VOICE" ? row.transaction.note : null) &&
      after.source === row.source &&
      after.smsFingerprint === row.sourceFingerprint &&
      after.date === formatFinancialActionLocalDate(row.transaction.date) &&
      after.createdAt === frozen.intent.occurredAt &&
      !after.isDraft &&
      !after.deleted,
    "financial_transaction_changed"
  );
}
function verifyTransfer(
  frozen: FrozenReviewSave,
  row: Row,
  record: Financial
): void {
  if (
    record.entity !== "transfer" ||
    row.source !== "SMS" ||
    row.toAssignment === null
  )
    refuse("financial_transfer_type");
  const after = record.after;
  check(
    after.fromAccountId === accountId(frozen, row.assignment) &&
      after.toAccountId === accountId(frozen, row.toAssignment) &&
      after.fromAccountId !== after.toAccountId &&
      after.amountMinorUnits === minorAmount(row) &&
      after.currency === row.transaction.currency &&
      after.date === formatFinancialActionLocalDate(row.transaction.date) &&
      after.smsFingerprint === row.sourceFingerprint &&
      after.convertedAmountMinorUnits === null &&
      after.exchangeRate === null &&
      after.notes === null &&
      after.createdAt === frozen.intent.occurredAt &&
      !after.deleted,
    "financial_transfer_changed"
  );
}
function verifyFinancial(
  frozen: FrozenReviewSave,
  row: Row,
  record: Financial
): void {
  const entity = selectedRecordKind(row);
  check(
    record.entity === entity &&
      record.after.id === requiredPlannedEntity(frozen, entity, row.rowId).id,
    "financial_planned_id_changed"
  );
  if (entity === "transfer") verifyTransfer(frozen, row, record);
  else verifyTransaction(frozen, row, record);
}
function normalizedSenders(
  group: Group
): ReadonlyArray<{ readonly label: string; readonly normalized: string }> {
  const found = new Set<string>();
  return group.senderNames.flatMap((name) => {
    const label = name.trim().replace(/\s+/g, " ");
    const normalized = normalizeAccountSmsSender(label);
    if (!normalized || found.has(normalized)) return [];
    found.add(normalized);
    return [{ label, normalized }];
  });
}
async function childLocalRef(
  frozen: FrozenReviewSave,
  group: Group,
  entity: "bank_details" | "account_sms_sender",
  provider: Sha256Provider,
  normalized?: string
): Promise<string> {
  const parts = [
    "account-review-localref/v1",
    frozen.intent.ownerId,
    frozen.intent.sessionId,
    group.groupId,
    entity,
  ];
  if (normalized !== undefined) parts.push(normalized);
  return uuidV8FromSha256(await provider.digestUtf8(JSON.stringify(parts)));
}
function verifyAccount(
  frozen: FrozenReviewSave,
  group: Group,
  record: AccountCreate
): void {
  const after = record.after;
  check(
    record.after.id ===
      requiredPlannedEntity(frozen, "account", group.groupId).id &&
      after.name === group.name &&
      after.type === group.type &&
      after.currency === group.currency &&
      after.institutionId === group.institutionId &&
      after.providerDisplayName === group.providerDisplayName &&
      after.createdAt === frozen.intent.occurredAt &&
      after.openingBalanceMinorUnits === "0" &&
      after.targetBalanceMinorUnits === null &&
      !after.deleted,
    "confirmed_group_definition_changed"
  );
}
async function verifyBankChild(
  frozen: FrozenReviewSave,
  group: Group,
  records: readonly Created[],
  provider: Sha256Provider,
  accountIdValue: string
): Promise<void> {
  const linked = records.filter(
    (record) =>
      record.entity === "bank_details" &&
      record.after.accountId === accountIdValue
  );
  check(
    linked.length === (group.type === "BANK" ? 1 : 0),
    "bank_child_membership_changed"
  );
  if (group.type !== "BANK") return;
  const record = linked[0];
  if (record?.entity !== "bank_details") refuse("bank_child_missing");
  const ref = await childLocalRef(frozen, group, "bank_details", provider);
  check(
    record.after.id === requiredPlannedEntity(frozen, "bank_details", ref).id &&
      record.after.cardLast4 === group.cardLast4 &&
      record.after.accountNumber === null &&
      record.after.createdAt === frozen.intent.occurredAt,
    "bank_child_identity_changed"
  );
}
async function verifySenderChildren(
  frozen: FrozenReviewSave,
  group: Group,
  records: readonly Created[],
  provider: Sha256Provider,
  accountIdValue: string
): Promise<void> {
  const expected = group.type === "CASH" ? [] : normalizedSenders(group);
  const actual = records.filter(
    (record) =>
      record.entity === "account_sms_sender" &&
      record.after.accountId === accountIdValue
  );
  check(expected.length === actual.length, "sender_count_changed");
  for (const entry of expected) {
    const ref = await childLocalRef(
      frozen,
      group,
      "account_sms_sender",
      provider,
      entry.normalized
    );
    const planned = requiredPlannedEntity(frozen, "account_sms_sender", ref);
    const record = actual.find((item) => item.after.id === planned.id);
    if (record?.entity !== "account_sms_sender")
      refuse("sender_identity_changed");
    check(
      record.after.senderName === entry.label &&
        record.after.normalizedSenderName === entry.normalized &&
        record.after.createdAt === frozen.intent.occurredAt &&
        !record.after.deleted,
      "sender_definition_changed"
    );
  }
}
async function verifyConfirmedGroup(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload,
  provider: Sha256Provider,
  accounts: readonly Created[],
  ref: ReviewBatchSavePayload["confirmedGroupRefs"][number]
): Promise<void> {
  const group = frozen.neededGroups.find(
    (item) => item.groupId === ref.groupId
  );
  const confirmed = frozen.intent.confirmedGroups.find(
    (item) => item.groupId === ref.groupId
  );
  const account = accounts.find((item) => item.after.id === ref.accountId);
  if (!group || !confirmed || account?.entity !== "account")
    refuse("unrecognized_confirmed_group");
  check(
    ref.revision === group.revision &&
      ref.revision === confirmed.revision &&
      confirmed.evidenceKey === group.evidenceKey,
    "confirmed_group_revision_changed"
  );
  verifyAccount(frozen, group, account);
  await verifyBankChild(
    frozen,
    group,
    payload.domainMutation.records,
    provider,
    account.after.id
  );
  await verifySenderChildren(
    frozen,
    group,
    payload.domainMutation.records,
    provider,
    account.after.id
  );
}

async function verifyConfirmedGroups(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload,
  provider: Sha256Provider
): Promise<void> {
  const accounts = payload.domainMutation.records.filter(
    (record) => record.entity === "account"
  );
  check(
    accounts.length === payload.confirmedGroupRefs.length,
    "created_group_count_changed"
  );
  for (const ref of payload.confirmedGroupRefs) {
    await verifyConfirmedGroup(frozen, payload, provider, accounts, ref);
  }
  check(
    accounts.every((record) =>
      payload.confirmedGroupRefs.some(
        (ref) => ref.accountId === record.after.id
      )
    ),
    "unbound_created_account"
  );
}
function findFinancial(
  payload: ReviewBatchSavePayload,
  recordId: string
): Financial | undefined {
  return payload.domainMutation.records.find(
    (record): record is Financial =>
      (record.entity === "transaction" || record.entity === "transfer") &&
      record.after.id === recordId
  );
}
function verifySelectedRows(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload
): ReadonlySet<string> {
  const storedRefs = new Map(
    payload.selectedSourceRefs.map((ref) => [ref.rowId, ref])
  );
  const matched = new Set<string>();
  const omitted = new Set<string>();
  for (const row of frozen.selectedRows) {
    const ref = storedRefs.get(row.rowId);
    const kind = selectedRecordKind(row);
    const planned = requiredPlannedEntity(frozen, kind, row.rowId);
    if (!ref) {
      // First write already proved an independent owned, active SMS source.
      // A matching frozen-intent digest now authenticates its historical omission.
      if (frozen.intent.source !== "SMS") refuse("unexpected_selected_row");
      omitted.add(row.rowId);
      continue;
    }
    const record = findFinancial(payload, ref.recordId);
    if (
      !record ||
      ref.recordId !== planned.id ||
      ref.sourceFingerprint !== row.sourceFingerprint
    ) {
      refuse("selected_source_or_id_changed");
    }
    verifyFinancial(frozen, row, record);
    matched.add(record.after.id);
  }
  check(
    storedRefs.size > 0 && matched.size === storedRefs.size,
    "financial_selection_membership_changed"
  );
  check(
    payload.domainMutation.records
      .filter(
        (record) =>
          record.entity === "transaction" || record.entity === "transfer"
      )
      .every((record) => matched.has(record.after.id)),
    "unbound_financial_create"
  );
  return omitted;
}
function referencesGroup(row: Row, groupId: string): boolean {
  return (
    (row.assignment.state === "suggested" &&
      row.assignment.groupId === groupId) ||
    (row.toAssignment?.state === "suggested" &&
      row.toAssignment.groupId === groupId)
  );
}
async function omittedGroupMemberIds(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload,
  omittedRows: ReadonlySet<string>,
  provider: Sha256Provider
): Promise<ReadonlySet<string>> {
  const permitted = new Set<string>();
  for (const group of frozen.neededGroups) {
    if (payload.confirmedGroupRefs.some((ref) => ref.groupId === group.groupId))
      continue;
    const linked = frozen.selectedRows.filter((row) =>
      referencesGroup(row, group.groupId)
    );
    check(
      linked.length > 0 && linked.every((row) => omittedRows.has(row.rowId)),
      "unposted_group_has_active_rows"
    );
    permitted.add(requiredPlannedEntity(frozen, "account", group.groupId).id);
    if (group.type === "BANK") {
      const ref = await childLocalRef(frozen, group, "bank_details", provider);
      permitted.add(requiredPlannedEntity(frozen, "bank_details", ref).id);
    }
    if (group.type !== "CASH") {
      for (const entry of normalizedSenders(group)) {
        const ref = await childLocalRef(
          frozen,
          group,
          "account_sms_sender",
          provider,
          entry.normalized
        );
        permitted.add(
          requiredPlannedEntity(frozen, "account_sms_sender", ref).id
        );
      }
    }
  }
  return permitted;
}
async function verifyPlannedCoverage(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload,
  omittedRows: ReadonlySet<string>,
  provider: Sha256Provider
): Promise<void> {
  const stored = new Set(
    payload.domainMutation.records.map((record) => record.after.id)
  );
  const permissible = new Set(
    await omittedGroupMemberIds(frozen, payload, omittedRows, provider)
  );
  for (const row of frozen.selectedRows) {
    if (omittedRows.has(row.rowId)) {
      permissible.add(
        requiredPlannedEntity(frozen, selectedRecordKind(row), row.rowId).id
      );
    }
  }
  for (const planned of frozen.intent.plannedEntityIds) {
    if (!stored.has(planned.id) && !permissible.has(planned.id)) {
      refuse("unused_planned_entity");
    }
  }
  check(
    payload.domainMutation.records.every((record) =>
      frozen.intent.plannedEntityIds.some(
        (item) => item.entity === record.entity && item.id === record.after.id
      )
    ),
    "missing_planned_create"
  );
}
/**
 * An existing immutable root's matching original-intent digest authenticates
 * historical SMS omissions. Only FIRST WRITE queries active independently owned
 * SMS fingerprints; replay never consults their mutable amounts/deleted flags.
 * Posted records and complete physical account/child coverage remain verified.
 */
export async function assertReplayImmutableContent(input: {
  readonly frozen: FrozenReviewSave;
  readonly payload: ReviewBatchSavePayload;
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly hashProvider: Sha256Provider;
}): Promise<void> {
  const { frozen, payload } = input;
  const omitted = verifySelectedRows(frozen, payload);
  await verifyConfirmedGroups(frozen, payload, input.hashProvider);
  await verifyPlannedCoverage(frozen, payload, omitted, input.hashProvider);
}
