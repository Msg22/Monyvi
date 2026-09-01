import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

const ENTITY_TABLES = {
  account: "accounts",
  transaction: "transactions",
  transfer: "transfers",
} as const;

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChangeId(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (!isObject(value)) return null;
  return typeof value.id === "string" && value.id.length > 0 ? value.id : null;
}

function protectedRefsFromRoot(record: unknown): ReadonlyArray<{
  readonly id: string;
  readonly table: string;
}> {
  if (!isObject(record) || typeof record.payload_json !== "string") return [];
  let envelope: unknown;
  try {
    envelope = JSON.parse(record.payload_json);
  } catch {
    return [];
  }
  if (
    !isObject(envelope) ||
    envelope.payloadVersion !== "account.balance-effects/v1" ||
    !isObject(envelope.payload) ||
    !isObject(envelope.payload.domainMutation) ||
    !Array.isArray(envelope.payload.domainMutation.records)
  )
    return [];
  return envelope.payload.domainMutation.records.flatMap((candidate) => {
    if (!isObject(candidate) || !isObject(candidate.after)) return [];
    const table = ENTITY_TABLES[candidate.entity as keyof typeof ENTITY_TABLES];
    const id = candidate.after.id;
    return typeof table === "string" && typeof id === "string"
      ? [{ id, table }]
      : [];
  });
}

export function collectProtectedFinancialActionRowIds(
  changes: SyncPushArgs["changes"]
): SyncRejectedIds | undefined {
  const roots = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).financial_action_groups;
  if (!roots) return undefined;
  const refs = [...roots.created, ...roots.updated].flatMap(
    protectedRefsFromRoot
  );
  const grouped = refs.reduce<Readonly<Record<string, readonly string[]>>>(
    (result, ref) => ({
      ...result,
      [ref.table]: [...new Set([...(result[ref.table] ?? []), ref.id])],
    }),
    {}
  );
  return Object.keys(grouped).length === 0
    ? undefined
    : Object.fromEntries(
        Object.entries(grouped).map(([table, ids]) => [table, [...ids]])
      );
}

export function isProtectedFinancialActionRow(
  rejectedIds: SyncRejectedIds | undefined,
  table: string,
  recordOrId: unknown
): boolean {
  const id = readChangeId(recordOrId);
  return id !== null && readRejectedIdsForTable(rejectedIds, table).includes(id);
}

export function readRejectedIdsForTable(
  rejectedIds: unknown,
  table: string
): readonly string[] {
  if (!isObject(rejectedIds)) return [];
  const value = rejectedIds[table];
  return Array.isArray(value)
    ? value.filter((candidate): candidate is string => typeof candidate === "string")
    : [];
}

export function stripProtectedAccountFields(
  table: string,
  record: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  if (table !== "accounts") return record;
  const {
    balance: _balance,
    financial_revision: _financialRevision,
    ...metadata
  } = record;
  return metadata;
}
