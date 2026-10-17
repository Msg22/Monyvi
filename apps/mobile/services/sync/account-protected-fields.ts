import type {
  SyncPushArgs,
  SyncRejectedIds,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import type { FinancialActionPushCandidate } from "../financial-action-sync-service";
import { inspectNewFinancialActionPushRoot } from "../account-review-recovery-protected-push";
import type { AccountActionProtection } from "./account-action-protection";
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
  readonly references?: ReadonlyArray<{
    readonly table: string;
    readonly id: string;
  }>;
  /** Only a fully inspected, zero-opening Add tuple can omit financial guards. */
  readonly verifiedZeroOpeningAdd?: boolean;
}

function readAccountBalanceEnvelope(
  record: unknown,
  changes: SyncPushArgs["changes"]
): AccountBalanceEnvelope | null {
  if (!isObject(record) || typeof record.payload_json !== "string") return null;
  const strict = inspectNewFinancialActionPushRoot(record, changes);
  if (strict)
    return {
      accountGuards: strict.accountGuards,
      payload: strict.payload,
      references: strict.references,
      // inspectNewFinancialActionPushRoot has already validated the exact
      // feature registry tuple, canonical payload and all dirty owned members.
      // No legacy envelope can set this exemption. The pure Add validator
      // requires zero opening to have zero effects/guards and a created account.
      verifiedZeroOpeningAdd:
        record.domain === "accounts" &&
        record.kind === "create_with_default" &&
        strict.payload.schemaVersion === "account.create-default/v1" &&
        strict.payload.operationCode === "account.create-default" &&
        strict.accountGuards.length === 0 &&
        Array.isArray(strict.payload.accountEffects) &&
        strict.payload.accountEffects.length === 0 &&
        strict.references.some((ref) => ref.table === "accounts"),
    };
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

function protectedRefsFromRoot(
  record: unknown,
  changes: SyncPushArgs["changes"]
): ReadonlyArray<{
  readonly id: string;
  readonly table: string;
}> {
  const envelope = readAccountBalanceEnvelope(record, changes);
  if (!envelope) return [];
  if (envelope.references) return envelope.references;
  const refs: Array<{ readonly id: string; readonly table: string }> = [];
  const domainMutation = envelope.payload.domainMutation;
  if (isObject(domainMutation) && Array.isArray(domainMutation.records)) {
    domainMutation.records.forEach((candidate) => {
      if (!isObject(candidate)) return;
      const table =
        ENTITY_TABLES[candidate.entity as keyof typeof ENTITY_TABLES];
      const recordId =
        readChangeId(candidate.after) ?? readChangeId(candidate.before);
      if (typeof table === "string" && recordId)
        refs.push({ id: recordId, table });
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

/**
 * A durable catalog is loaded and hashed BEFORE any dirty-bundle admission.
 * Accepted/rejected/terminal roots do not require their action's original
 * created/updated children to remain in the current Watermelon dirty set.
 * An initial local_complete/sync_pending/sync_failed action still does.
 */
function isCataloguedNonDispatchRoot(
  root: Readonly<Record<string, unknown>>,
  catalog: AccountActionProtection | undefined
): boolean {
  if (!catalog) return false;
  const found = catalog.roots.find(
    (candidate) =>
      candidate.physicalRootId === root.id &&
      candidate.actionId === root.action_id &&
      candidate.ownerId === root.user_id &&
      candidate.payloadHash === root.payload_hash &&
      candidate.payloadJson === root.payload_json &&
      candidate.state === root.state
  );
  if (!found) throw new Error(MALFORMED_ROOT_ERROR);
  // Only Add is rerouted to durable clean/terminal membership. Review and
  // deployed legacy dirty-group admission remain exactly on their existing
  // coordinator/strict-member path (including accepted/recovery behavior).
  return (
    root.domain === "accounts" &&
    root.kind === "create_with_default" &&
    (found.terminalAccepted ||
      found.locallyCompensated ||
      ["rejected_compensating", "reconciliation_incomplete"].includes(
        found.state
      ))
  );
}

function collectFinanciallyDirtyAccountIds(
  changes: SyncPushArgs["changes"]
): readonly string[] {
  const accounts = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
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
    const hasNonInitialFinancialValue =
      candidate.balance !== 0 || candidate.financial_revision !== "0";
    return hasProtectedValue &&
      (hasProtectedChange ||
        (candidate._status === "created" && hasNonInitialFinancialValue))
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

function assertEveryEffectHasOwnedRoot(
  changes: SyncPushArgs["changes"],
  catalog?: AccountActionProtection
): void {
  const roots = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).financial_action_groups;
  const dirtyRootActionIds = new Set(
    [...(roots?.created ?? []), ...(roots?.updated ?? [])]
      .filter(isObject)
      .map((root) => root.action_id)
      .filter((id): id is string => typeof id === "string")
  );
  const effects = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).account_financial_effects;
  for (const record of [
    ...(effects?.created ?? []),
    ...(effects?.updated ?? []),
  ]) {
    if (!isObject(record)) throw new Error(MALFORMED_ROOT_ERROR);
    if (typeof record.action_id !== "string" || typeof record.id !== "string")
      throw new Error(MALFORMED_ROOT_ERROR);
    const durable = catalog?.roots.find(
      (candidate) => candidate.actionId === record.action_id
    );
    const terminal =
      durable?.terminalAccepted === true ||
      durable?.locallyCompensated === true ||
      (durable !== undefined &&
        ["rejected_compensating", "reconciliation_incomplete"].includes(
          durable.state
        ));
    if (dirtyRootActionIds.has(record.action_id) && !terminal) continue;
    const boundRoot = catalog?.roots.find(
      (candidate) =>
        candidate.actionId === record.action_id &&
        (candidate.terminalAccepted ||
          candidate.locallyCompensated ||
          ["rejected_compensating", "reconciliation_incomplete"].includes(
            candidate.state
          ))
    );
    if (
      !boundRoot ||
      record.user_id !== boundRoot.ownerId ||
      !catalog?.effectIdsByAction.get(record.action_id)?.has(record.id)
    )
      throw new Error(MALFORMED_ROOT_ERROR);
    // The immutable root has been fully decoded/hash-checked by the durable
    // catalog. Never allow an extra or swapped action effect as a terminal
    // outstanding member.
    let envelope: unknown;
    try {
      envelope = JSON.parse(boundRoot.payloadJson);
    } catch {
      throw new Error(MALFORMED_ROOT_ERROR);
    }
    if (
      !isObject(envelope) ||
      !isObject(envelope.payload) ||
      !Array.isArray(envelope.payload.accountEffects)
    )
      throw new Error(MALFORMED_ROOT_ERROR);
    const original = envelope.payload.accountEffects.filter(
      (value) => isObject(value) && value.effectId === record.id
    );
    if (
      original.length !== 1 ||
      !isObject(original[0]) ||
      original[0].accountId !== record.account_id ||
      original[0].amountMinorUnits !== record.amount_minor_units ||
      original[0].currency !== record.currency
    )
      throw new Error(MALFORMED_ROOT_ERROR);
  }
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
    grouped.set(
      ref.table,
      [...new Set([...(grouped.get(ref.table) ?? []), ref.id])].sort()
    );
  });
  return Object.freeze(Object.fromEntries([...grouped.entries()].sort()));
}

function readGuardRevisions(
  record: unknown,
  changes: SyncPushArgs["changes"]
): ReadonlyMap<string, string> {
  const envelope = readAccountBalanceEnvelope(record, changes);
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
  changes: SyncPushArgs["changes"],
  catalog?: AccountActionProtection
): readonly AccountFinancialActionPushBundle[] {
  assertEveryEffectHasOwnedRoot(changes, catalog);
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
    if (isCataloguedNonDispatchRoot(candidate, catalog)) return [];
    const refs = protectedRefsFromRoot(candidate, changes);
    const actionId = readNonEmptyString(candidate, "action_id");
    const payloadHash = readNonEmptyString(candidate, "payload_hash");
    const payloadJson = readNonEmptyString(candidate, "payload_json");
    const rootId = readNonEmptyString(candidate, "id");
    const state = readNonEmptyString(candidate, "state");
    const envelope = readAccountBalanceEnvelope(candidate, changes);
    if (!envelope) return [];
    if (!actionId || !payloadHash || !payloadJson || !rootId || !state) {
      throw new Error(MALFORMED_ROOT_ERROR);
    }
    if (
      refs.length === 0 ||
      (envelope.accountGuards.length === 0 &&
        envelope.verifiedZeroOpeningAdd !== true)
    ) {
      throw new Error(MALFORMED_ROOT_ERROR);
    }
    revisionsByAction.set(actionId, readGuardRevisions(candidate, changes));
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
  changes: SyncPushArgs["changes"],
  catalog?: AccountActionProtection
): SyncRejectedIds | undefined {
  assertGenericAccountPushIsGuarded();
  assertEveryEffectHasOwnedRoot(changes, catalog);
  const roots = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  ).financial_action_groups;
  const refs = roots
    ? [...roots.created, ...roots.updated].flatMap((root) =>
        isObject(root) && isCataloguedNonDispatchRoot(root, catalog)
          ? []
          : protectedRefsFromRoot(root, changes)
      )
    : [];
  const grouped = refs.reduce<Readonly<Record<string, readonly string[]>>>(
    (result, ref) => ({
      ...result,
      [ref.table]: [...new Set([...(result[ref.table] ?? []), ref.id])],
    }),
    {}
  );
  const dirtyAccountIds = collectFinanciallyDirtyAccountIds(changes);
  const protectedGrouped: Record<string, readonly string[]> = { ...grouped };
  if (dirtyAccountIds.length > 0) {
    protectedGrouped.accounts = [
      ...new Set([...(protectedGrouped.accounts ?? []), ...dirtyAccountIds]),
    ];
  }
  // Terminal losing members remain quarantined even when their root is
  // synced/clean. This map may carry IDs not presently in dirty changes,
  // which is intentional for the independent SDK final ACK/deletion gate.
  if (catalog) {
    for (const [table, ids] of Object.entries(catalog.losingIds)) {
      protectedGrouped[table] = [
        ...new Set([...(protectedGrouped[table] ?? []), ...ids]),
      ];
    }
  }
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
  return (
    id !== null && readRejectedIdsForTable(rejectedIds, table).includes(id)
  );
}

export function readRejectedIdsForTable(
  rejectedIds: unknown,
  table: string
): readonly string[] {
  if (!isObject(rejectedIds)) return [];
  const value = rejectedIds[table];
  return Array.isArray(value)
    ? value.filter(
        (candidate): candidate is string => typeof candidate === "string"
      )
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
