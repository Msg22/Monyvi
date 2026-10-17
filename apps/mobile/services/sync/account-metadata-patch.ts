/**
 * #395 T069: only genuinely dirty, nonfinancial account metadata is eligible
 * for a remote UPDATE. Never send a partial accounts UPSERT.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import { serializeDecimal } from "@monyvi/logic";
import type { SupabaseTablesNames, SupabaseWriteTable } from "./types";
import type {
  Account,
  BankDetails,
  AccountSmsSender,
  SupabaseDatabase,
} from "@monyvi/db";
import { getCurrentUserDataScope } from "../user-data-access";
import {
  acceptedAddAccountResidualColumns,
  matchesAcceptedAddAccountCorePostimage,
  matchesAcceptedAddAccountImmutableIdentity,
  type AccountActionProtection,
} from "./account-action-protection";
import {
  type AccountSyncAckCapability,
  assertAccountSyncAckScopeCurrent,
  recordVerifiedAccountMetadataAck,
  recordVerifiedOwnedSyncRowAck,
} from "./account-sync-ack-scope";
import { getCurrentUserId } from "../supabase";

type AccountColumn =
  keyof SupabaseDatabase["public"]["Tables"]["accounts"]["Row"];
const METADATA_FIELDS = [
  "name",
  "institution_id",
  "provider_display_name",
  "is_default",
  "deleted",
] as const satisfies readonly AccountColumn[];

function hasOneReturnedId(value: unknown, expectedId: string): boolean {
  if (!Array.isArray(value) || value.length !== 1) return false;
  const row: unknown = value[0];
  return (
    typeof row === "object" &&
    row !== null &&
    !Array.isArray(row) &&
    "id" in row &&
    row.id === expectedId
  );
}

export const ACCOUNT_METADATA_PATCH_ERROR =
  "account_sync_metadata_patch_unverified";
export interface AccountMetadataPatch {
  readonly accountId: string;
  // Keys are generated-type-checked by METADATA_FIELDS; runtime narrows
  // nullable values and disallows null/blank name before making an UPDATE.
  readonly values: Readonly<Record<string, string | boolean | null>>;
  /** The exact dirty fields positively covered by this server UPDATE. */
  readonly coveredColumns: readonly string[];
  readonly setsDefaultTrue: boolean;
  readonly clearsDefault: boolean;
}

function failed(): never {
  throw new Error(ACCOUNT_METADATA_PATCH_ERROR);
}
function changedColumns(
  record: Readonly<Record<string, unknown>>
): ReadonlySet<string> {
  if (typeof record._changed !== "string") return new Set<string>();
  return new Set(record._changed.split(",").filter(Boolean));
}

/**
 * Current _changed contains only edits for updated rows. A created row has
 * no per-field dirty marks; compare its immutable accepted Add baseline to
 * admit ONLY an independently edited subset while retaining financial proof.
 */
export function planAccountMetadataPatch(
  record: Readonly<Record<string, unknown>>,
  protection: AccountActionProtection
): AccountMetadataPatch | null {
  const id = record.id;
  if (typeof id !== "string" || id.length === 0) failed();
  const isHistorical =
    protection.createdAccountIds.has(id) || protection.priorDefaultIds.has(id);
  const acceptedCreated = protection.acceptedAddPostimages.has(id);
  const isCreated = record._status === "created";
  if (
    isCreated &&
    acceptedCreated &&
    !matchesAcceptedAddAccountImmutableIdentity(protection, record)
  )
    failed();
  const columns = isCreated
    ? acceptedCreated
      ? new Set(acceptedAddAccountResidualColumns(protection, record))
      : new Set<string>()
    : changedColumns(record);
  // Ordinary Edit prior-default P must clear its actual dirty flag before
  // historical accepted Add A can be set. Do not widen unrelated LWW traffic.
  if (
    !isHistorical &&
    !(record._status === "updated" && columns.has("is_default"))
  )
    return null;
  const values: Record<string, string | boolean | null> = {};
  const permittedDelete =
    columns.has("deleted") &&
    record.deleted === true &&
    acceptedCreated &&
    !protection.losingIds.accounts?.has(id);
  for (const column of METADATA_FIELDS) {
    if (!columns.has(column)) continue;
    const value = record[column];
    if (column === "deleted") {
      if (typeof value !== "boolean") failed();
      if (permittedDelete) values.deleted = true;
      continue;
    }
    if (column === "is_default") {
      if (typeof value !== "boolean") failed();
      if (
        protection.unsafeDefaultIds.has(id) ||
        protection.provedActionOwnedDefaultIds.has(id)
      )
        continue;
      // A dirty later Edit must be sent even when it happens to equal an
      // older accepted Add flag. Wall clock/history equality has NO authority.
      if (isHistorical || record._status === "updated") {
        values.is_default = value;
      }
      continue;
    }
    // Ordinary pre-existing default Edit may carry name/provider changes
    // in the same captured row. Only this scoped, verified current metadata
    // projection is sent (never a whole-account generic UPSERT).
    if (typeof value !== "string" && value !== null) failed();
    if (column === "name" && (!value || !value.trim())) failed();
    values[column] = value;
  }
  const coveredColumns = Object.keys(values);
  return coveredColumns.length === 0
    ? null
    : {
        accountId: id,
        values,
        coveredColumns,
        setsDefaultTrue: values.is_default === true,
        clearsDefault: values.is_default === false,
      };
}

export async function pushAccountMetadataPatch(input: {
  readonly database: Database;
  readonly capability: AccountSyncAckCapability;
  readonly expectedOwnerId: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly protection: AccountActionProtection;
  readonly accountsTable: SupabaseWriteTable;
}): Promise<boolean> {
  const {
    database,
    capability,
    expectedOwnerId,
    record,
    protection,
    accountsTable,
  } = input;
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  const patch = planAccountMetadataPatch(record, protection);
  if (!patch) return false;
  if (record.user_id !== expectedOwnerId) failed();
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);

  // Short real writer re-read. Never keep the database writer over remote I/O.
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== expectedOwnerId) failed();
  await database.write(async (): Promise<void> => {
    const current = await scope.findOwned(
      database.get<Account>("accounts"),
      patch.accountId
    );
    if (
      current.userId !== expectedOwnerId ||
      JSON.stringify(current._raw) !== JSON.stringify(record)
    )
      failed();
  });
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);

  const response = await accountsTable
    .update({ ...patch.values }, { count: "exact" })
    .eq("id", patch.accountId)
    .eq("user_id", expectedOwnerId)
    .select("id");
  if (
    response.error ||
    response.count !== 1 ||
    !hasOneReturnedId(response.data, patch.accountId)
  ) {
    failed();
  }
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  recordVerifiedAccountMetadataAck(
    capability,
    database,
    expectedOwnerId,
    patch.accountId,
    record,
    [
      ...patch.coveredColumns,
      // Watermelon may attribute an automatic updated_at alongside a real
      // covered metadata edit. A positively applied remote UPDATE is the
      // authority for that coupled timestamp, never for an isolated clock.
      ...(changedColumns(record).has("updated_at") ? ["updated_at"] : []),
    ]
  );
  return true;
}

/** The actual Supabase account Row projection, not a cast of the write API.
 * Transport provides an owner-filtered generated-client SELECT; validation
 * below still checks every field at runtime before granting ACK coverage. */
export type CurrentAccountFinancialReadback = Pick<
  SupabaseDatabase["public"]["Tables"]["accounts"]["Row"],
  | "id"
  | "user_id"
  | "type"
  | "currency"
  | "created_at"
  | "balance"
  | "financial_revision"
>;
export type ReadCurrentAccountFinancialFields = (
  ownerId: string,
  accountId: string
) => Promise<{
  readonly data: CurrentAccountFinancialReadback | null;
  readonly error: unknown;
}>;
function financialRevision(value: unknown): string | null {
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return value;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : null;
}
/**
 * Positive current-state financial ACK, separate from the Add CREATE receipt.
 * No financial UPSERT/UPDATE and no inferred successor chain: only the
 * independently read owner-filtered server account fields may cover a newer
 * captured created row's balance + revision. Unknown/partial readback leaves
 * those fields dirty, while the historical root can ACK independently.
 */
export async function verifyAcceptedCreatedAccountFinancialReadback(input: {
  readonly database: Database;
  readonly capability: AccountSyncAckCapability;
  readonly expectedOwnerId: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly protection: AccountActionProtection;
  readonly readCurrentAccountFinancialFields: ReadCurrentAccountFinancialFields;
}): Promise<boolean> {
  const {
    database,
    capability,
    expectedOwnerId,
    record,
    protection,
    readCurrentAccountFinancialFields,
  } = input;
  const original =
    typeof record.id === "string"
      ? protection.acceptedAddPostimages.get(record.id)
      : undefined;
  if (
    !original ||
    record._status !== "created" ||
    !matchesAcceptedAddAccountImmutableIdentity(protection, record) ||
    record.user_id !== expectedOwnerId ||
    typeof record.balance !== "number" ||
    !Number.isFinite(record.balance) ||
    typeof record.financial_revision !== "string" ||
    financialRevision(record.financial_revision) === null ||
    matchesAcceptedAddAccountCorePostimage(protection, record)
  )
    return false;
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  const scope = await getCurrentUserDataScope();
  if (
    scope.userId !== expectedOwnerId ||
    (await getCurrentUserId()) !== expectedOwnerId
  )
    failed();
  // No network read runs under a writer. Recheck original captured cache both
  // before remote I/O and after, as well as the original opaque actor lease.
  const sameLocal = async (): Promise<boolean> =>
    database.write(async (): Promise<boolean> => {
      assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
      const current = await scope.findOwned(
        database.get<Account>("accounts"),
        original.accountId
      );
      return JSON.stringify(current._raw) === JSON.stringify(record);
    });
  if (!(await sameLocal())) return false;
  const { data, error } = await readCurrentAccountFinancialFields(
    expectedOwnerId,
    original.accountId
  );
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  if (!data || error || typeof data !== "object" || Array.isArray(data))
    return false;
  const server = data;
  const remoteBalance: unknown = server.balance;
  if (
    server.id !== original.accountId ||
    server.user_id !== expectedOwnerId ||
    server.type !== original.type ||
    server.currency !== original.currency ||
    typeof server.created_at !== "string" ||
    Date.parse(server.created_at) !== original.createdAt ||
    financialRevision(server.financial_revision) !==
      record.financial_revision ||
    (typeof remoteBalance !== "string" && typeof remoteBalance !== "number")
  )
    return false;
  try {
    if (
      !Number.isFinite(Number(remoteBalance)) ||
      serializeDecimal(String(remoteBalance)) !==
        serializeDecimal(String(record.balance))
    )
      return false;
  } catch {
    return false;
  }
  if (!(await sameLocal())) return false;
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  recordVerifiedAccountMetadataAck(
    capability,
    database,
    expectedOwnerId,
    original.accountId,
    record,
    ["balance", "financial_revision"]
  );
  return true;
}

export type AcceptedAccountChildTable = "bank_details" | "account_sms_senders";

export interface AccountChildMetadataPatch {
  readonly id: string;
  readonly accountId: string;
  readonly values: Readonly<Record<string, string | number | boolean | null>>;
  readonly coveredColumns: readonly string[];
}
const CHILD_EDIT_FIELDS: Readonly<
  Record<AcceptedAccountChildTable, readonly string[]>
> = {
  bank_details: ["account_number", "card_last_4", "deleted"],
  account_sms_senders: ["sender_name", "normalized_sender_name", "deleted"],
};
/** The verified accepted creator supplies immutable child membership. */
export function planAcceptedAccountChildMetadataPatch(
  table: AcceptedAccountChildTable,
  record: Readonly<Record<string, unknown>>,
  protection: AccountActionProtection
): AccountChildMetadataPatch | null {
  const id = record.id;
  if (typeof id !== "string" || id.length === 0) failed();
  const original = protection.acceptedChildPostimages[table]?.get(id);
  if (!original) return null;
  const accountId = original.account_id;
  if (
    typeof accountId !== "string" ||
    record.account_id !== accountId ||
    record.created_at !== original.created_at ||
    protection.losingIds[table]?.has(id) ||
    !protection.acceptedAccountIds.has(accountId)
  )
    failed();
  const changed =
    record._status === "created"
      ? new Set(
          CHILD_EDIT_FIELDS[table].filter(
            (key) => (record[key] ?? null) !== (original[key] ?? null)
          )
        )
      : changedColumns(record);
  const values: Record<string, string | number | boolean | null> = {};
  for (const column of CHILD_EDIT_FIELDS[table]) {
    if (!changed.has(column)) continue;
    const value = record[column];
    if (column === "deleted") {
      if (value !== true) failed();
      values.deleted = true;
    } else if (column === "card_last_4") {
      if (
        value !== null &&
        (typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > 9999)
      )
        failed();
      values[column] = value;
    } else {
      if (value !== null && typeof value !== "string") failed();
      if (
        column === "normalized_sender_name" &&
        (typeof value !== "string" || !value.trim())
      )
        failed();
      values[column] = value;
    }
  }
  const coveredColumns = Object.keys(values);
  return coveredColumns.length === 0
    ? null
    : {
        id,
        accountId,
        values,
        coveredColumns,
      };
}

/** A short owner/parent writer check, then network UPDATE, never a writer
 * across the RPC. A returned affected ID and exact count bind ACK fields. */
export async function pushAcceptedAccountChildMetadataPatch(input: {
  readonly database: Database;
  readonly capability: AccountSyncAckCapability;
  readonly expectedOwnerId: string;
  readonly table: AcceptedAccountChildTable;
  readonly record: Readonly<Record<string, unknown>>;
  readonly protection: AccountActionProtection;
  readonly remoteTable: SupabaseWriteTable;
}): Promise<boolean> {
  const {
    database,
    capability,
    expectedOwnerId,
    table,
    record,
    protection,
    remoteTable,
  } = input;
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  const patch = planAcceptedAccountChildMetadataPatch(
    table,
    record,
    protection
  );
  if (!patch) return false;
  const childScope = await getCurrentUserDataScope();
  if (childScope.userId !== expectedOwnerId) failed();
  await database.write(async (): Promise<void> => {
    assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
    const parent = await childScope.findOwned(
      database.get<Account>("accounts"),
      patch.accountId
    );
    const childRecords = await childScope
      .queryChildrenOfOwnedParent(
        database.get<BankDetails | AccountSmsSender>(table),
        parent,
        "account_id",
        Q.where("id", patch.id)
      )
      .fetch();
    const child = childRecords[0];
    if (!child) failed();
    if (
      child.accountId !== patch.accountId ||
      JSON.stringify(child._raw) !== JSON.stringify(record)
    )
      failed();
  });
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  assertAccountSyncAckScopeCurrent(capability, database, expectedOwnerId);
  const response = await remoteTable
    .update({ ...patch.values }, { count: "exact" })
    .eq("id", patch.id)
    .eq("account_id", patch.accountId)
    .select("id");
  if (
    response.error ||
    response.count !== 1 ||
    !hasOneReturnedId(response.data, patch.id)
  )
    failed();
  if ((await getCurrentUserId()) !== expectedOwnerId) failed();
  recordVerifiedOwnedSyncRowAck(
    capability,
    database,
    expectedOwnerId,
    table,
    record,
    [
      ...patch.coveredColumns,
      ...(changedColumns(record).has("updated_at") ? ["updated_at"] : []),
    ],
    patch.accountId
  );
  return true;
}

export function isAccountMetadataPatchCandidate(
  table: SupabaseTablesNames,
  record: Readonly<Record<string, unknown>>,
  protection: AccountActionProtection
): boolean {
  return (
    table === "accounts" &&
    typeof record.id === "string" &&
    (protection.createdAccountIds.has(record.id) ||
      protection.priorDefaultIds.has(record.id) ||
      (record._status === "updated" &&
        changedColumns(record).has("is_default")))
  );
}
