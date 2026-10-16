/**
 * #395 T068 owner-scoped logical default snapshot and durable predecessors.
 * No UI-only DAG: dependencies derive from immutable owned action roots.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  parseFinancialActionEnvelopeJson,
  type FinancialActionEnvelopeV1,
} from "@monyvi/logic";
import {
  accountDefaultSnapshotSchema,
  type AccountDefaultSnapshot,
} from "../../../packages/logic/src/financial-actions/account-create-default";
import { createAccountReviewFinancialRegistry } from
  "./account-review-financial-command-service";
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
  const accounts = await scope.queryOwned(
    db.get<Account>("accounts"),
    Q.where("deleted", false)
  ).fetch();
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
    captured.defaultAccount?.accountId !==
      current.defaultAccount?.accountId ||
    (captured.defaultAccount === null) !== (current.defaultAccount === null)
  ) fail("stale_default_snapshot");
}
function createdAccountIds(envelope: FinancialActionEnvelopeV1): readonly string[] {
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
    ) continue;
    ids.push(record.after.id);
  }
  return ids;
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
  const roots = await scope.queryOwned(
    db.get<FinancialActionGroup>("financial_action_groups"),
    Q.where("deleted", false)
  ).fetch();
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
    if (envelope.userId !== scope.userId ||
        envelope.actionId !== root.actionId)
      fail("creator_root_identity_mismatch");
    const relevant = createdAccountIds(envelope).some(
      (id) => referenced.has(id)
    );
    if (!relevant) continue;
    if (
      root.serverOutcome !== "accepted" &&
      root.serverOutcome !== "idempotent"
    ) result.add(root.actionId);
  }
  return Object.freeze([...result].sort(ascii));
}
