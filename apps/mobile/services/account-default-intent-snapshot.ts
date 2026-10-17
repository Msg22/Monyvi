/**
 * #395 T068 owner-scoped logical default snapshot and durable predecessors.
 * No UI-only DAG: dependencies derive from immutable owned action roots.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  parseFinancialActionEvidenceJson,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";
import {
  accountDefaultSnapshotSchema,
  type AccountDefaultSnapshot,
} from "../../../packages/logic/src/financial-actions/account-create-default";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import type { CurrentUserDataScope } from "./user-data-access";

export interface OwnedDefaultSnapshot {
  readonly accounts: readonly Account[];
  readonly snapshot: AccountDefaultSnapshot;
}
function fail(code: string): never {
  throw new Error("account_default_" + code);
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function ascii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Reject inconsistent owner rows; do not guess among multiple defaults. */
export async function readOwnedDefaultSnapshot(
  db: Database,
  scope: CurrentUserDataScope
): Promise<OwnedDefaultSnapshot> {
  const accounts = await scope
    .queryOwned(db.get<Account>("accounts"), Q.where("deleted", false))
    .fetch();
  const active = accounts.filter(
    (account) => account.userId === scope.userId && !account.deleted
  );
  if (active.length !== accounts.length) fail("invalid_owner_snapshot");
  const currentDefaults = active.filter((account) => account.isDefault);
  if (currentDefaults.length > 1) fail("multiple_owned_defaults");
  const activeAccountIds = active.map((account) => account.id).sort(ascii);
  const defaultAccount = currentDefaults[0]
    ? { accountId: currentDefaults[0].id, isDefault: true }
    : null;
  const snapshot = accountDefaultSnapshotSchema.parse({
    activeAccountIds,
    defaultAccount,
  });
  return { accounts: Object.freeze([...active]), snapshot };
}

/**
 * Exact owner-wide set+default logical CAS. Historical A->B->A equivalent
 * identity passes; changed active/default/deleted/foreign state rejects.
 */
export function assertOwnedDefaultSnapshot(
  captured: AccountDefaultSnapshot,
  current: AccountDefaultSnapshot
): void {
  if (
    captured.activeAccountIds.length !== current.activeAccountIds.length ||
    captured.activeAccountIds.some(
      (id, index) => current.activeAccountIds[index] !== id
    ) ||
    captured.defaultAccount?.accountId !== current.defaultAccount?.accountId ||
    (captured.defaultAccount === null) !== (current.defaultAccount === null)
  )
    fail("stale_default_snapshot");
}
function createdAccountIds(
  envelope: FinancialActionEnvelopeV1
): readonly string[] {
  const mutation = envelope.payload.domainMutation;
  if (!isRecord(mutation) || !Array.isArray(mutation.records)) return [];
  const ids: string[] = [];
  for (const record of mutation.records) {
    if (
      !isRecord(record) ||
      record.entity !== "account" ||
      record.mode !== "create" ||
      !isRecord(record.after) ||
      typeof record.after.id !== "string"
    )
      continue;
    ids.push(record.after.id);
  }
  return ids;
}

/**
 * The persisted guard journal is a closed ordered array, not a byte-for-byte
 * encoding of the original envelope's canonical accountGuards. Reuse the
 * financial evidence parser to reject duplicate JSON keys before comparing
 * every guard at its original index. Object key order/JSON whitespace alone
 * cannot invalidate an otherwise identical immutable root.
 */
export function matchesCapturedAccountGuards(
  json: string,
  expected: FinancialActionEnvelopeV1["accountGuards"]
): boolean {
  let parsed: unknown;
  try {
    parsed = parseFinancialActionEvidenceJson(json);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  const guards: readonly unknown[] = parsed;
  if (guards.length !== expected.length) return false;
  return guards.every((value, index) => {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value).sort();
    return (
      keys.length === 2 &&
      keys[0] === "accountId" &&
      keys[1] === "expectedRevision" &&
      value.accountId === expected[index]?.accountId &&
      value.expectedRevision === expected[index]?.expectedRevision
    );
  });
}

/**
 * Captures unresolved creator dependencies as immutable action UUIDs, not
 * private schema or cloud payload fields. Recovery must rederive on restart.
 */
export async function readDefaultCreatorDependencies(
  db: Database,
  scope: CurrentUserDataScope,
  snapshot: AccountDefaultSnapshot
): Promise<readonly string[]> {
  const referenced = new Set(snapshot.activeAccountIds);
  if (snapshot.defaultAccount)
    referenced.add(snapshot.defaultAccount.accountId);
  if (referenced.size === 0) return Object.freeze([]);
  const roots = await scope
    .queryOwned(
      db.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("deleted", false)
    )
    .fetch();
  const registry = createAccountReviewFinancialRegistry();
  const result = new Set<string>();
  for (const root of roots) {
    if (root.userId !== scope.userId || root.deleted)
      fail("foreign_creator_root");
    let envelope: FinancialActionEnvelopeV1;
    try {
      envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
    } catch {
      fail("unparseable_creator_root");
    }
    if (envelope.userId !== scope.userId || envelope.actionId !== root.actionId)
      fail("creator_root_identity_mismatch");
    const relevant = createdAccountIds(envelope).some((id) =>
      referenced.has(id)
    );
    if (!relevant) continue;
    if (
      root.serverOutcome !== "accepted" &&
      root.serverOutcome !== "idempotent"
    )
      result.add(root.actionId);
  }
  return Object.freeze([...result].sort(ascii));
}

/**
 * Full NEW-Add recovery provenance and separate unresolved transport blockers.
 * All original creator actionId/hash pairs are captured regardless of whether
 * each creator had already accepted before this Add was prepared.
 *
 * This is NOT acceptance-at-prepare evidence, and never infers chronology from
 * server/client timestamps. Final recovery still validates the current full
 * accepted/idempotent receipt and every immutable original creator binding.
 */
export interface CompleteDefaultCreatorMembership {
  readonly dependencyRoots: ReadonlyArray<{
    readonly actionId: string;
    readonly payloadHash: string;
  }>;
  readonly unresolvedActionIds: readonly string[];
}

export async function readCompleteDefaultCreatorMembership(
  db: Database,
  scope: CurrentUserDataScope,
  original: AccountDefaultSnapshot,
  hashProvider: Sha256Provider
): Promise<CompleteDefaultCreatorMembership> {
  const referenced = new Set(original.activeAccountIds);
  if (original.defaultAccount)
    referenced.add(original.defaultAccount.accountId);
  if (referenced.size === 0)
    return Object.freeze({
      dependencyRoots: Object.freeze([]),
      unresolvedActionIds: Object.freeze([]),
    });
  // Include tombstoned creator roots so one that was deleted after the
  // original graph capture cannot disappear from the membership proof.
  const roots = await scope
    .queryOwned(db.get<FinancialActionGroup>("financial_action_groups"))
    .fetch();
  const registry = createAccountReviewFinancialRegistry();
  const found = new Map<string, string>();
  const createdIds = new Set<string>();
  const unresolved = new Set<string>();
  for (const root of roots) {
    if (root.userId !== scope.userId) fail("foreign_creator_root");
    let envelope: FinancialActionEnvelopeV1;
    try {
      envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
    } catch {
      fail("unparseable_creator_root");
    }
    const matching = createdAccountIds(envelope).filter((accountId) =>
      referenced.has(accountId)
    );
    if (matching.length === 0) continue;
    if (
      root.deleted ||
      root._raw._status === "deleted" ||
      envelope.userId !== scope.userId ||
      envelope.actionId !== root.actionId ||
      envelope.domain !== root.domain ||
      envelope.kind !== root.kind ||
      envelope.domainReferenceId !== root.domainReferenceId ||
      !matchesCapturedAccountGuards(
        root.accountGuardsJson,
        envelope.accountGuards
      ) ||
      found.has(root.actionId)
    )
      fail("creator_root_identity_mismatch");
    const digest = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    if (
      digest.canonicalText !== root.payloadJson ||
      digest.payloadHash !== root.payloadHash
    )
      fail("creator_root_hash_mismatch");
    for (const id of matching) {
      if (createdIds.has(id)) fail("duplicate_creator_account");
      createdIds.add(id);
    }
    const isAccepted =
      root.serverOutcome === "accepted" || root.serverOutcome === "idempotent";
    if (
      (isAccepted && root.state !== "accepted") ||
      (!isAccepted && root.state === "accepted")
    )
      fail("creator_state_mismatch");
    found.set(root.actionId, root.payloadHash);
    if (!isAccepted) unresolved.add(root.actionId);
  }
  const dependencyRoots = [...found]
    .sort(([a], [b]) => ascii(a, b))
    .map(([actionId, payloadHash]) => Object.freeze({ actionId, payloadHash }));
  return Object.freeze({
    dependencyRoots: Object.freeze(dependencyRoots),
    unresolvedActionIds: Object.freeze([...unresolved].sort(ascii)),
  });
}
