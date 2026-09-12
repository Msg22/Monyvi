import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import type { FinancialActionPushCandidate } from "../financial-action-sync-service";
import {
  ACCOUNT_BALANCE_WRITER_REGISTRY,
  requireGuardedAccountBalanceWriter,
} from "../account-balance-writer-registry";

const ENTITY_TABLES = {
  account: "accounts",
  recurring_payment: "recurring_payments",
  transaction: "transactions",
  transfer: "transfers",
} as const;

const MALFORMED_ROOT_ERROR = "account_financial_action_malformed_root";
const GENERIC_ACCOUNT_PUSH_WRITER_ID = "sync.accounts.push-full-row";

function assertGenericAccountPushIsGuarded(): void {
  const isRegistered = ACCOUNT_BALANCE_WRITER_REGISTRY.some(
    ({ writerId }) => writerId === GENERIC_ACCOUNT_PUSH_WRITER_ID
  );
  if (!isRegistered) {
    throw new Error(
      `financial_action_blocked_writer:account_balance_writer_blocked:${GENERIC_ACCOUNT_PUSH_WRITER_ID}`
    );
  }
  requireGuardedAccountBalanceWriter(GENERIC_ACCOUNT_PUSH_WRITER_ID);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChangeId(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (!isObject(value)) return null;
  return typeof value.id === "string" && value.id.length > 0 ? value.id : null;
}

interface AccountBalanceEnvelope {
  readonly accountGuards: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly payload: Readonly<Record<string, unknown>>;
}

function readAccountBalanceEnvelope(record: unknown): AccountBalanceEnvelope | null {
  if (!isObject(record) || typeof record.payload_json !== "string") return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(record.payload_json);
  } catch {
    throw new Error(MALFORMED_ROOT_ERROR);
  }
  if (!isObject(envelope)) throw new Error(MALFORMED_ROOT_ERROR);
  if (envelope.payloadVersion !== "account.balance-effects/v1") return null;
  if (!isObject(envelope.payload) || !Array.isArray(envelope.accountGuards)) {
    throw new Error(MALFORMED_ROOT_ERROR);
  }
  return {
    accountGuards: envelope.accountGuards.filter(isObject),
    payload: envelope.payload,
  };
}

function protectedRefsFromRoot(record: unknown): ReadonlyArray<{
  readonly id: string;
  readonly table: string;
}> {
  const envelope = readAccountBalanceEnvelope(record);
  if (!envelope) return [];
  const refs: Array<{ readonly id: string; readonly table: string }> = [];
  const domainMutation = envelope.payload.domainMutation;
  if (isObject(domainMutation) && Array.isArray(domainMutation.records)) {
    domainMutation.records.forEach((candidate) => {
      if (!isObject(candidate)) return;
      const table = ENTITY_TABLES[candidate.entity as keyof typeof ENTITY_TABLES];
      const recordId = readChangeId(candidate.after) ?? readChangeId(candidate.before);
      if (typeof table === "string" && recordId) refs.push({ id: recordId, table });
    });
  }
  const accountEffects = envelope.payload.accountEffects;
  if (Array.isArray(accountEffects)) {
    accountEffects.forEach((candidate) => {
      if (!isObject(candidate)) return;
      const accountId = candidate.accountId;
      if (typeof accountId === "string" && accountId.length > 0) {
        refs.push({ id: accountId, table: "accounts" });
      }
    });
  }
  envelope.accountGuards.forEach((guard) => {
    const accountId = guard.accountId;
    if (typeof accountId === "string" && accountId.length > 0) {
      refs.push({ id: accountId, table: "accounts" });
    }
  });
  return refs;
}

function collectFinanciallyDirtyAccountIds(
  changes: SyncPushArgs["changes"]
): readonly string[] {
  const accounts = (
    changes as unknown as Readonly<Record<string, SyncTableChangeSet | undefined>>
  ).accounts;
  if (!accounts) return [];
  return [...accounts.created, ...accounts.updated].flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const id = readChangeId(candidate);
    if (!id) return [];
    const changed =
      typeof candidate._changed === "string"
        ? candidate._changed.split(",")
        : [];
    const hasProtectedValue =
      Object.prototype.hasOwnProperty.call(candidate, "balance") ||
      Object.prototype.hasOwnProperty.call(candidate, "financial_revision");
    const hasProtectedChange =
      changed.includes("balance") || changed.includes("financial_revision");
    return hasProtectedValue &&
      (candidate._status === "created" || hasProtectedChange)
      ? [id]
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

function readGuardRevisions(record: unknown): ReadonlyMap<string, string> {
  const envelope = readAccountBalanceEnvelope(record);
  const revisions = new Map<string, string>();
  if (!envelope) return revisions;
  envelope.accountGuards.forEach((guard) => {
    const accountId = guard.accountId;
    const expectedRevision = guard.expectedRevision;
    if (
      typeof accountId === "string" &&
      accountId.length > 0 &&
      typeof expectedRevision === "string" &&
      /^\d+$/.test(expectedRevision)
    ) {
      revisions.set(accountId, expectedRevision);
    }
  });
  return revisions;
}

function compareRevision(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, "");
  const normalizedRight = right.replace(/^0+(?=\d)/, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

function orderBundlesByAccountRevision(
  bundles: readonly AccountFinancialActionPushBundle[],
  revisionsByAction: ReadonlyMap<string, ReadonlyMap<string, string>>
): readonly AccountFinancialActionPushBundle[] {
  if (bundles.length < 2) return bundles;
  const edges = bundles.map(() => new Set<number>());
  const indegrees = bundles.map(() => 0);

  for (let leftIndex = 0; leftIndex < bundles.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < bundles.length;
      rightIndex += 1
    ) {
      const leftRevisions =
        revisionsByAction.get(bundles[leftIndex].candidate.actionId) ??
        new Map<string, string>();
      const rightRevisions =
        revisionsByAction.get(bundles[rightIndex].candidate.actionId) ??
        new Map<string, string>();
      leftRevisions.forEach((leftRevision, accountId) => {
        const rightRevision = rightRevisions.get(accountId);
        if (rightRevision === undefined) return;
        const comparison = compareRevision(leftRevision, rightRevision);
        if (comparison === 0) return;
        const from = comparison < 0 ? leftIndex : rightIndex;
        const to = comparison < 0 ? rightIndex : leftIndex;
        if (!edges[from].has(to)) {
          edges[from].add(to);
          indegrees[to] += 1;
        }
      });
    }
  }

  const byActionId = (left: number, right: number): number =>
    bundles[left].candidate.actionId.localeCompare(
      bundles[right].candidate.actionId
    );
  const ready = indegrees
    .map((indegree, index) => (indegree === 0 ? index : -1))
    .filter((index) => index >= 0)
    .sort(byActionId);
  const orderedIndexes: number[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (current === undefined) break;
    orderedIndexes.push(current);
    edges[current].forEach((next) => {
      indegrees[next] -= 1;
      if (indegrees[next] === 0) {
        ready.push(next);
        ready.sort(byActionId);
      }
    });
  }
  if (orderedIndexes.length < bundles.length) {
    const emitted = new Set(orderedIndexes);
    orderedIndexes.push(
      ...bundles
        .map((_bundle, index) => index)
        .filter((index) => !emitted.has(index))
        .sort(byActionId)
    );
  }
  return Object.freeze(orderedIndexes.map((index) => bundles[index]));
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
  const revisionsByAction = new Map<string, ReadonlyMap<string, string>>();
  const bundles = [...roots.created, ...roots.updated].flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const refs = protectedRefsFromRoot(candidate);
    const actionId = readNonEmptyString(candidate, "action_id");
    const payloadHash = readNonEmptyString(candidate, "payload_hash");
    const payloadJson = readNonEmptyString(candidate, "payload_json");
    const rootId = readNonEmptyString(candidate, "id");
    const state = readNonEmptyString(candidate, "state");
    const envelope = readAccountBalanceEnvelope(candidate);
    if (!envelope) return [];
    if (!actionId || !payloadHash || !payloadJson || !rootId || !state) {
      throw new Error(MALFORMED_ROOT_ERROR);
    }
    if (refs.length === 0 || envelope.accountGuards.length === 0) {
      throw new Error(MALFORMED_ROOT_ERROR);
    }
    revisionsByAction.set(actionId, readGuardRevisions(candidate));
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
  return orderBundlesByAccountRevision(bundles, revisionsByAction);
}

export function collectProtectedFinancialActionRowIds(
  changes: SyncPushArgs["changes"]
): SyncRejectedIds | undefined {
  assertGenericAccountPushIsGuarded();
  const roots = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).financial_action_groups;
  const refs = roots
    ? [...roots.created, ...roots.updated].flatMap(protectedRefsFromRoot)
    : [];
  const grouped = refs.reduce<Readonly<Record<string, readonly string[]>>>(
    (result, ref) => ({
      ...result,
      [ref.table]: [...new Set([...(result[ref.table] ?? []), ref.id])],
    }),
    {}
  );
  const dirtyAccountIds = collectFinanciallyDirtyAccountIds(changes);
  const protectedGrouped =
    dirtyAccountIds.length === 0
      ? grouped
      : {
          ...grouped,
          accounts: [
            ...new Set([...(grouped.accounts ?? []), ...dirtyAccountIds]),
          ],
        };
  return Object.keys(protectedGrouped).length === 0
    ? undefined
    : Object.fromEntries(
        Object.entries(protectedGrouped).map(([table, ids]) => [
          table,
          [...ids],
        ])
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
