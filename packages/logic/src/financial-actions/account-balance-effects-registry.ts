import type {
  CanonicalJsonValue,
  FinancialActionDefinition,
  RegisteredActionPayload,
} from "./action-registry";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SIGNED_MINOR_UNITS_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const MAX_SIGNED_BIGINT = 9223372036854775807n;

const PAYLOAD_KEYS = [
  "accountEffects",
  "domainMutation",
  "domainRecordRefs",
  "operationCode",
  "schemaVersion",
] as const;
const MUTATION_RECORD_KEYS = [
  "after",
  "entity",
  "expectedUpdatedAt",
  "mode",
] as const;
const ACCOUNT_AFTER_KEYS = [
  "createdAt",
  "currency",
  "deleted",
  "id",
  "institutionId",
  "isDefault",
  "name",
  "openingBalanceMinorUnits",
  "providerDisplayName",
  "targetBalanceMinorUnits",
  "type",
] as const;
const TRANSACTION_AFTER_KEYS = [
  "accountId",
  "amountMinorUnits",
  "categoryId",
  "counterparty",
  "createdAt",
  "currency",
  "date",
  "deleted",
  "id",
  "isDraft",
  "linkedAssetId",
  "linkedDebtId",
  "linkedRecurringId",
  "note",
  "smsFingerprint",
  "source",
  "type",
] as const;
const TRANSFER_AFTER_KEYS = [
  "amountMinorUnits",
  "convertedAmountMinorUnits",
  "createdAt",
  "currency",
  "date",
  "deleted",
  "exchangeRate",
  "fromAccountId",
  "id",
  "notes",
  "smsFingerprint",
  "toAccountId",
] as const;
const RECURRING_SCHEDULE_AFTER_KEYS = [
  "id",
  "nextDueDate",
  "status",
] as const;
const SMS_REVIEW_DRAFT_CLEANUP_AFTER_KEYS = [
  "createdAt",
  "id",
  "parsedAt",
  "payloadJson",
  "payloadVersion",
  "position",
  "queueId",
  "selectionOverride",
  "smsFingerprint",
  "snapshotHash",
  "updatedAt",
] as const;

type RawObject = Readonly<Record<string, unknown>>;
type MutationEntity =
  | "account"
  | "recurring_payment"
  | "sms_review_draft_item"
  | "transaction"
  | "transfer";
type MutationMode = "create" | "update" | "delete";

interface OperationDefinition {
  readonly domain: string;
  readonly kind: string;
  readonly operationCode: string;
}

const OPERATIONS: readonly OperationDefinition[] = [
  {
    domain: "accounts",
    kind: "cash_create",
    operationCode: "account.cash.create-within-writer",
  },
  {
    domain: "accounts",
    kind: "cash_prepare",
    operationCode: "account.cash.prepare",
  },
  {
    domain: "accounts",
    kind: "cash_prepare_named",
    operationCode: "account.cash.prepare-named",
  },
  { domain: "accounts", kind: "create", operationCode: "account.create" },
  {
    domain: "accounts",
    kind: "pending_prepare",
    operationCode: "account.pending.prepare",
  },
  {
    domain: "accounts",
    kind: "edit_balance",
    operationCode: "account.edit-balance",
  },
  {
    domain: "transactions",
    kind: "create",
    operationCode: "transaction.create",
  },
  {
    domain: "transactions",
    kind: "update",
    operationCode: "transaction.update",
  },
  {
    domain: "transactions",
    kind: "delete",
    operationCode: "transaction.delete",
  },
  {
    domain: "transactions",
    kind: "convert_to_transfer",
    operationCode: "transaction.convert-to-transfer",
  },
  {
    domain: "transactions",
    kind: "batch_delete",
    operationCode: "transaction.batch-delete",
  },
  {
    domain: "transactions",
    kind: "batch_import",
    operationCode: "transaction.batch-import",
  },
  { domain: "transfers", kind: "create", operationCode: "transfer.create" },
  { domain: "transfers", kind: "update", operationCode: "transfer.update" },
  { domain: "transfers", kind: "delete", operationCode: "transfer.delete" },
  {
    domain: "transfers",
    kind: "convert_to_transaction",
    operationCode: "transfer.convert-to-transaction",
  },
  {
    domain: "recurring_payments",
    kind: "pay_now",
    operationCode: "recurring.pay-now",
  },
  {
    domain: "sms",
    kind: "review_confirm",
    operationCode: "sms.review-durable",
  },
] as const;

function fail(invalidPayloadCode: string): never {
  throw new Error(invalidPayloadCode);
}

function isObject(value: unknown): value is RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: RawObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value))
    return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSignedMinorUnits(
  value: unknown,
  allowZero = false
): value is string {
  if (typeof value !== "string" || !SIGNED_MINOR_UNITS_PATTERN.test(value))
    return false;
  const parsed = BigInt(value);
  return (
    (allowZero || parsed !== 0n) &&
    parsed >= -MAX_SIGNED_BIGINT &&
    parsed <= MAX_SIGNED_BIGINT
  );
}

function isUnsignedIntegerString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:0|[1-9][0-9]*)$/.test(value) &&
    BigInt(value) <= MAX_SIGNED_BIGINT
  );
}

function assertSortedUnique(
  values: readonly string[],
  invalidPayloadCode: string
): void {
  values.forEach((value, index) => {
    if (!isUuid(value) || (index > 0 && values[index - 1] >= value))
      fail(invalidPayloadCode);
  });
}

function validateAccountAfter(
  value: RawObject,
  invalidPayloadCode: string
): void {
  if (
    !hasExactKeys(value, ACCOUNT_AFTER_KEYS) ||
    !isUuid(value.id) ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    !["CASH", "BANK", "DIGITAL_WALLET"].includes(value.type as string) ||
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !isNullableString(value.institutionId) ||
    !isNullableString(value.providerDisplayName) ||
    typeof value.isDefault !== "boolean" ||
    typeof value.deleted !== "boolean" ||
    !isTimestamp(value.createdAt) ||
    !(
      value.openingBalanceMinorUnits === null ||
      isSignedMinorUnits(value.openingBalanceMinorUnits, true)
    ) ||
    !(
      value.targetBalanceMinorUnits === null ||
      isSignedMinorUnits(value.targetBalanceMinorUnits, true)
    )
  )
    fail(invalidPayloadCode);
}

function validateTransactionAfter(
  value: RawObject,
  invalidPayloadCode: string
): void {
  if (
    !hasExactKeys(value, TRANSACTION_AFTER_KEYS) ||
    !isUuid(value.id) ||
    !isUuid(value.accountId) ||
    !isUuid(value.categoryId) ||
    !isSignedMinorUnits(value.amountMinorUnits) ||
    (value.amountMinorUnits).startsWith("-") ||
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !["EXPENSE", "INCOME"].includes(value.type as string) ||
    !["MANUAL", "VOICE", "SMS", "RECURRING"].includes(value.source as string) ||
    !isNullableString(value.counterparty) ||
    !isNullableString(value.note) ||
    !(value.linkedAssetId === null || isUuid(value.linkedAssetId)) ||
    !(value.linkedDebtId === null || isUuid(value.linkedDebtId)) ||
    !(value.linkedRecurringId === null || isUuid(value.linkedRecurringId)) ||
    !isNullableString(value.smsFingerprint) ||
    typeof value.isDraft !== "boolean" ||
    typeof value.deleted !== "boolean" ||
    !isDate(value.date) ||
    !isTimestamp(value.createdAt)
  )
    fail(invalidPayloadCode);
}

function validateTransferAfter(
  value: RawObject,
  invalidPayloadCode: string
): void {
  if (
    !hasExactKeys(value, TRANSFER_AFTER_KEYS) ||
    !isUuid(value.id) ||
    !isUuid(value.fromAccountId) ||
    !isUuid(value.toAccountId) ||
    value.fromAccountId === value.toAccountId ||
    !isSignedMinorUnits(value.amountMinorUnits) ||
    (value.amountMinorUnits).startsWith("-") ||
    !(
      value.convertedAmountMinorUnits === null ||
      (isSignedMinorUnits(value.convertedAmountMinorUnits) &&
        !(value.convertedAmountMinorUnits).startsWith("-"))
    ) ||
    !(
      value.exchangeRate === null ||
      (typeof value.exchangeRate === "string" &&
        /^\d+(?:\.\d+)?$/.test(value.exchangeRate))
    ) ||
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !isNullableString(value.notes) ||
    !isNullableString(value.smsFingerprint) ||
    typeof value.deleted !== "boolean" ||
    !isDate(value.date) ||
    !isTimestamp(value.createdAt)
  )
    fail(invalidPayloadCode);
}

function validateRecurringScheduleAfter(
  value: RawObject,
  invalidPayloadCode: string
): void {
  if (
    !hasExactKeys(value, RECURRING_SCHEDULE_AFTER_KEYS) ||
    !isUuid(value.id) ||
    !isDate(value.nextDueDate) ||
    !["ACTIVE", "COMPLETED"].includes(value.status as string)
  )
    fail(invalidPayloadCode);
}

function validateSmsReviewDraftCleanupAfter(
  value: RawObject,
  invalidPayloadCode: string
): void {
  if (
    !hasExactKeys(value, SMS_REVIEW_DRAFT_CLEANUP_AFTER_KEYS) ||
    !isUuid(value.id) ||
    !isUuid(value.queueId) ||
    typeof value.smsFingerprint !== "string" ||
    value.smsFingerprint.length === 0 ||
    typeof value.payloadJson !== "string" ||
    !isUnsignedIntegerString(value.payloadVersion) ||
    !isUnsignedIntegerString(value.position) ||
    !(
      value.selectionOverride === null ||
      typeof value.selectionOverride === "boolean"
    ) ||
    !isTimestamp(value.parsedAt) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    typeof value.snapshotHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.snapshotHash)
  )
    fail(invalidPayloadCode);
}

function assertOperationShape(
  operationCode: string,
  records: ReadonlyArray<{
    readonly entity: MutationEntity;
    readonly mode: MutationMode;
  }>,
  invalidPayloadCode: string
): void {
  const shapes = records.map((record) => `${record.entity}:${record.mode}`);
  const all = (shape: string): boolean =>
    shapes.every((value) => value === shape);
  const valid =
    ([
      "account.cash.create-within-writer",
      "account.cash.prepare",
      "account.cash.prepare-named",
      "account.create",
      "account.pending.prepare",
    ].includes(operationCode) &&
      records.length === 1 &&
      all("account:create")) ||
    (operationCode === "account.edit-balance" &&
      records.length === 1 &&
      all("account:update")) ||
    (["transaction.create", "transaction.batch-import"].includes(
      operationCode
    ) &&
      all("transaction:create")) ||
    (operationCode === "transaction.update" &&
      records.length === 1 &&
      all("transaction:update")) ||
    (operationCode === "transaction.delete" &&
      records.length === 1 &&
      all("transaction:delete")) ||
    (operationCode === "transaction.batch-delete" &&
      records.every(
        (record) => record.mode === "delete" && record.entity !== "account"
      )) ||
    (operationCode === "transaction.convert-to-transfer" &&
      shapes.join(",") === "transaction:delete,transfer:create") ||
    (operationCode === "transfer.create" &&
      records.length === 1 &&
      all("transfer:create")) ||
    (operationCode === "transfer.update" &&
      records.length === 1 &&
      all("transfer:update")) ||
    (operationCode === "transfer.delete" &&
      records.length === 1 &&
      all("transfer:delete")) ||
    (operationCode === "transfer.convert-to-transaction" &&
      shapes.join(",") === "transaction:create,transfer:delete") ||
    (operationCode === "recurring.pay-now" &&
      shapes.join(",") === "recurring_payment:update,transaction:create") ||
    (operationCode === "sms.review-durable" &&
      shapes.join(",") ===
        "sms_review_draft_item:delete,transaction:create");
  if (!valid) fail(invalidPayloadCode);
}

function assertCompositeLinks(
  operationCode: string,
  records: ReadonlyArray<{
    readonly after: Readonly<Record<string, CanonicalJsonValue>>;
    readonly entity: MutationEntity;
  }>,
  invalidPayloadCode: string
): void {
  if (operationCode === "recurring.pay-now") {
    const schedule = records[0]?.after;
    const transaction = records[1]?.after;
    if (
      transaction?.linkedRecurringId !== schedule?.id ||
      transaction?.source !== "RECURRING"
    )
      fail(invalidPayloadCode);
  }
  if (operationCode === "sms.review-durable") {
    const draft = records[0]?.after;
    const transaction = records[1]?.after;
    if (
      transaction?.smsFingerprint !== draft?.smsFingerprint ||
      transaction?.source !== "SMS"
    )
      fail(invalidPayloadCode);
  }
}

function validatePayload(
  raw: unknown,
  operationCode: string,
  invalidPayloadCode: string
): RegisteredActionPayload {
  if (
    !isObject(raw) ||
    !hasExactKeys(raw, PAYLOAD_KEYS) ||
    raw.schemaVersion !== "account.balance-effects/v1" ||
    raw.operationCode !== operationCode ||
    !Array.isArray(raw.domainRecordRefs) ||
    raw.domainRecordRefs.length === 0 ||
    !Array.isArray(raw.accountEffects) ||
    raw.accountEffects.length === 0 ||
    !isObject(raw.domainMutation) ||
    !hasExactKeys(raw.domainMutation, ["records"]) ||
    !Array.isArray(raw.domainMutation.records) ||
    raw.domainMutation.records.length === 0
  )
    fail(invalidPayloadCode);

  const refs = raw.domainRecordRefs as string[];
  assertSortedUnique(refs, invalidPayloadCode);
  const effectAccountIds: string[] = [];
  const effects = raw.accountEffects.map((rawEffect) => {
    if (
      !isObject(rawEffect) ||
      !hasExactKeys(rawEffect, ["accountId", "amountMinorUnits", "currency"]) ||
      !isUuid(rawEffect.accountId) ||
      !isSignedMinorUnits(rawEffect.amountMinorUnits) ||
      typeof rawEffect.currency !== "string" ||
      !/^[A-Z]{3}$/.test(rawEffect.currency)
    )
      fail(invalidPayloadCode);
    effectAccountIds.push(rawEffect.accountId);
    return {
      accountId: rawEffect.accountId,
      amountMinorUnits: rawEffect.amountMinorUnits,
      currency: rawEffect.currency,
    };
  });
  assertSortedUnique(effectAccountIds, invalidPayloadCode);

  const recordRefs: string[] = [];
  const sortKeys: string[] = [];
  const records = raw.domainMutation.records.map((rawRecord) => {
    if (
      !isObject(rawRecord) ||
      !hasExactKeys(rawRecord, MUTATION_RECORD_KEYS) ||
      ![
        "account",
        "recurring_payment",
        "sms_review_draft_item",
        "transaction",
        "transfer",
      ].includes(
        rawRecord.entity as string
      ) ||
      !["create", "update", "delete"].includes(rawRecord.mode as string) ||
      !isObject(rawRecord.after)
    )
      fail(invalidPayloadCode);
    const entity = rawRecord.entity as MutationEntity;
    const mode = rawRecord.mode as MutationMode;
    if (
      (mode === "create" && rawRecord.expectedUpdatedAt !== null) ||
      (mode !== "create" && !isTimestamp(rawRecord.expectedUpdatedAt))
    )
      fail(invalidPayloadCode);
    if (entity === "account")
      validateAccountAfter(rawRecord.after, invalidPayloadCode);
    else if (entity === "recurring_payment")
      validateRecurringScheduleAfter(rawRecord.after, invalidPayloadCode);
    else if (entity === "sms_review_draft_item")
      validateSmsReviewDraftCleanupAfter(rawRecord.after, invalidPayloadCode);
    else if (entity === "transaction")
      validateTransactionAfter(rawRecord.after, invalidPayloadCode);
    else validateTransferAfter(rawRecord.after, invalidPayloadCode);
    recordRefs.push(rawRecord.after.id as string);
    sortKeys.push(`${entity}:${String(rawRecord.after.id)}`);
    return {
      after: rawRecord.after as Record<string, CanonicalJsonValue>,
      entity,
      expectedUpdatedAt: rawRecord.expectedUpdatedAt as string | null,
      mode,
    };
  });
  sortKeys.forEach((key, index) => {
    if (index > 0 && sortKeys[index - 1] >= key) fail(invalidPayloadCode);
  });
  const sortedRecordRefs = [...recordRefs].sort();
  if (sortedRecordRefs.some((ref, index) => refs[index] !== ref))
    fail(invalidPayloadCode);
  assertOperationShape(operationCode, records, invalidPayloadCode);
  assertCompositeLinks(operationCode, records, invalidPayloadCode);

  return {
    accountEffects: Object.freeze(effects),
    domainMutation: { records: Object.freeze(records) },
    domainRecordRefs: Object.freeze([...refs]),
    operationCode,
    schemaVersion: "account.balance-effects/v1",
  };
}

export function createAccountBalanceEffectsDefinitions(
  invalidPayloadCode: string
): readonly FinancialActionDefinition[] {
  return Object.freeze(
    OPERATIONS.map((operation) =>
      Object.freeze({
        domain: operation.domain,
        kind: operation.kind,
        payloadVersion: "account.balance-effects/v1",
        validatePayload: (value: unknown): RegisteredActionPayload =>
          validatePayload(value, operation.operationCode, invalidPayloadCode),
      })
    )
  );
}
