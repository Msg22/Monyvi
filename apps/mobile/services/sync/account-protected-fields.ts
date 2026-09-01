import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import type { FinancialActionPushCandidate } from "../financial-action-sync-service";

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

export interface AccountFinancialActionPushBundle {
  readonly candidate: FinancialActionPushCandidate;
  readonly rowIds: Readonly<Record<string, readonly string[]>>;
}

function readNonEmptyString(
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function collectEffectIdsByAction(
  changes: SyncPushArgs["changes"]
): ReadonlyMap<string, readonly string[]> {
  const effects = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).account_financial_effects;
  const grouped = new Map<string, string[]>();
  if (!effects) return grouped;
  [...effects.created, ...effects.updated].forEach((candidate) => {
    if (!isObject(candidate)) return;
    const actionId = readNonEmptyString(candidate, "action_id");
    const id = readNonEmptyString(candidate, "id");
    if (!actionId || !id) return;
    grouped.set(actionId, [...new Set([...(grouped.get(actionId) ?? []), id])]);
  });
  return grouped;
}

function groupRowIds(
  rootId: string,
  refs: ReadonlyArray<{ readonly id: string; readonly table: string }>,
  effectIds: readonly string[]
): Readonly<Record<string, readonly string[]>> {
  const grouped = new Map<string, string[]>();
  grouped.set("financial_action_groups", [rootId]);
  if (effectIds.length > 0) {
    grouped.set("account_financial_effects", [...effectIds].sort());
  }
  refs.forEach((ref) => {
    grouped.set(ref.table, [
      ...new Set([...(grouped.get(ref.table) ?? []), ref.id]),
    ].sort());
  });
  return Object.freeze(Object.fromEntries([...grouped.entries()].sort()));
}

export function collectAccountFinancialActionPushBundles(
  changes: SyncPushArgs["changes"]
): readonly AccountFinancialActionPushBundle[] {
  const roots = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).financial_action_groups;
  if (!roots) return [];
  const effectIdsByAction = collectEffectIdsByAction(changes);
  return [...roots.created, ...roots.updated].flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const refs = protectedRefsFromRoot(candidate);
    const actionId = readNonEmptyString(candidate, "action_id");
    const payloadHash = readNonEmptyString(candidate, "payload_hash");
    const payloadJson = readNonEmptyString(candidate, "payload_json");
    const rootId = readNonEmptyString(candidate, "id");
    const state = readNonEmptyString(candidate, "state");
    if (!actionId || !payloadHash || !payloadJson || !rootId || !state) {
      return [];
    }
    if (refs.length === 0) return [];
    return [
      Object.freeze({
        candidate: Object.freeze({
          actionId,
          payloadHash,
          payloadJson,
          state,
        }),
        rowIds: groupRowIds(
          rootId,
          refs,
          effectIdsByAction.get(actionId) ?? []
        ),
      }),
    ];
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
