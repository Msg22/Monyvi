/**
 * #395 T069: one opaque database/actor-scoped financial sync exclusion lease.
 *
 * The lease protects an entire synchronize(), including Watermelon's final
 * writer ACK; it never owns a database.write() or holds a SQLite transaction
 * while remote requests are in flight.
 */
import type { Database } from "@nozbe/watermelondb";

const PRIVATE_SCOPE_BRAND: unique symbol = Symbol(
  "account-sync-ack-capability"
);
const ACTIVE_SCOPE_ERROR = "account_sync_ack_scope_invalid";

export interface AccountSyncAckCapability {
  readonly [PRIVATE_SCOPE_BRAND]: true;
}

export interface BoundAccountRootIdentity {
  readonly physicalRootId: string;
  readonly actionId: string;
  readonly ownerId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
}

export interface DeferredAccountRejection {
  readonly physicalRootId: string;
  readonly actionId: string;
  readonly ownerId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
}

export interface VerifiedAccountMetadataAck {
  readonly originalCapturedRaw: string;
  readonly coveredColumns: ReadonlySet<string>;
}

interface ScopeLease {
  readonly capability: AccountSyncAckCapability;
  readonly database: Database;
  readonly ownerId: string;
  readonly isActive: boolean;
  readonly verifiedMetadata: Map<string, VerifiedAccountMetadataAck>;
  readonly rejectedAddRoots: Map<string, DeferredAccountRejection>;
  readonly boundTransitions: Map<string, BoundAccountRootIdentity>;
}

function requireActive(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string
): ScopeLease {
  assertAccountSyncAckScopeCurrent(capability, database, ownerId);
  const active = identityByCapability.get(capability);
  if (!active) throw new Error(ACTIVE_SCOPE_ERROR);
  return active;
}

/** Positive remote UPDATE proof is bound to original table, ID and row bytes. */
export function recordVerifiedOwnedSyncRowAck(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  table: "accounts" | "bank_details" | "account_sms_senders",
  originalCaptured: Readonly<Record<string, unknown>>,
  coveredColumns: readonly string[],
  parentId?: string
): void {
  const lease = requireActive(capability, database, ownerId);
  const id = originalCaptured.id;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    coveredColumns.length === 0 ||
    new Set(coveredColumns).size !== coveredColumns.length ||
    (table === "accounts"
      ? originalCaptured.user_id !== ownerId
      : typeof parentId !== "string" ||
        originalCaptured.account_id !== parentId)
  )
    throw new Error(ACTIVE_SCOPE_ERROR);
  const key = table + ":" + id;
  const fingerprint = JSON.stringify(originalCaptured);
  const prior = lease.verifiedMetadata.get(key);
  if (prior && prior.originalCapturedRaw !== fingerprint)
    throw new Error(ACTIVE_SCOPE_ERROR);
  lease.verifiedMetadata.set(key, {
    originalCapturedRaw: fingerprint,
    coveredColumns: new Set([
      ...(prior?.coveredColumns ?? []),
      ...coveredColumns,
    ]),
  });
}

export function verifiedOwnedSyncRowCoverage(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  table: "accounts" | "bank_details" | "account_sms_senders",
  captured: Readonly<Record<string, unknown>>
): ReadonlySet<string> {
  const lease = requireActive(capability, database, ownerId);
  const id = captured.id;
  if (typeof id !== "string") return new Set<string>();
  const proof = lease.verifiedMetadata.get(table + ":" + id);
  return proof?.originalCapturedRaw === JSON.stringify(captured)
    ? proof.coveredColumns
    : new Set<string>();
}

/** Legacy account call sites stay strict and table-scoped. */
export function recordVerifiedAccountMetadataAck(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  accountId: string,
  originalCaptured: Readonly<Record<string, unknown>>,
  coveredColumns: readonly string[]
): void {
  if (originalCaptured.id !== accountId) throw new Error(ACTIVE_SCOPE_ERROR);
  recordVerifiedOwnedSyncRowAck(
    capability,
    database,
    ownerId,
    "accounts",
    originalCaptured,
    coveredColumns
  );
}
export function verifiedAccountMetadataCoverage(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  captured: Readonly<Record<string, unknown>>
): ReadonlySet<string> {
  return verifiedOwnedSyncRowCoverage(
    capability,
    database,
    ownerId,
    "accounts",
    captured
  );
}
export function hasVerifiedAccountMetadataAck(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  accountId: string
): boolean {
  return requireActive(capability, database, ownerId).verifiedMetadata.has(
    "accounts:" + accountId
  );
}

/** Bind the ORIGINAL physical owner/root identity to every local state writer. */
export function registerBoundFinancialActionTransition(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  root: BoundAccountRootIdentity
): void {
  if (root.ownerId !== ownerId) throw new Error(ACTIVE_SCOPE_ERROR);
  const state = requireActive(capability, database, ownerId);
  const previous = state.boundTransitions.get(root.actionId);
  if (
    previous &&
    (previous.physicalRootId !== root.physicalRootId ||
      previous.payloadHash !== root.payloadHash ||
      previous.payloadJson !== root.payloadJson)
  )
    throw new Error(ACTIVE_SCOPE_ERROR);
  state.boundTransitions.set(root.actionId, Object.freeze({ ...root }));
}

/**
 * Local foundation may inspect only a genuine active scoped action binding.
 * It MUST compare against the current authenticated physical root *inside*
 * the original writer, not trust this binding as an unscoped authorization.
 */
export function getBoundFinancialActionTransition(
  database: Database,
  actionId: string
): BoundAccountRootIdentity | null {
  const lease = activeByDatabase.get(database);
  if (!lease) return null;
  return lease.boundTransitions.get(actionId) ?? null;
}

/** Hints only; callers must reread and rebind the durable owned root. */
export function recordDeferredAccountRejection(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string,
  root: DeferredAccountRejection
): void {
  if (root.ownerId !== ownerId) throw new Error(ACTIVE_SCOPE_ERROR);
  requireActive(capability, database, ownerId).rejectedAddRoots.set(
    root.actionId,
    Object.freeze({ ...root })
  );
}

export function snapshotDeferredAccountRejections(
  capability: AccountSyncAckCapability,
  database: Database,
  ownerId: string
): readonly DeferredAccountRejection[] {
  return Object.freeze([
    ...requireActive(capability, database, ownerId).rejectedAddRoots.values(),
  ]);
}

/** Only this module can mint or recognize genuine current scope identities. */
const activeByDatabase = new WeakMap<Database, ScopeLease>();
const identityByCapability = new WeakMap<
  AccountSyncAckCapability,
  ScopeLease
>();
const completionByDatabase = new WeakMap<Database, Promise<void>>();

export function assertAccountSyncAckScopeCurrent(
  capability: AccountSyncAckCapability,
  database: Database,
  expectedOwnerId: string
): void {
  const lease = identityByCapability.get(capability);
  if (
    !lease ||
    !lease.isActive ||
    lease.database !== database ||
    lease.ownerId !== expectedOwnerId ||
    activeByDatabase.get(database) !== lease
  ) {
    throw new Error(ACTIVE_SCOPE_ERROR);
  }
}

/**
 * Serializes participating JS callers for a single Watermelon Database.
 *
 * Entrants inside this runner must pass their existing genuine capability to
 * trusted nested services. Never recursively acquire a new lease and never
 * acquire a database writer around the network callback.
 */
export async function runWithAccountSyncAckExclusion<T>(
  database: Database,
  expectedOwnerId: string,
  operation: (capability: AccountSyncAckCapability) => Promise<T>
): Promise<T> {
  if (!expectedOwnerId.trim()) throw new Error(ACTIVE_SCOPE_ERROR);
  const predecessor = completionByDatabase.get(database);
  let release!: () => void;
  const completed = new Promise<void>((resolve) => {
    release = resolve;
  });
  completionByDatabase.set(database, completed);
  if (predecessor) {
    try {
      await predecessor;
    } catch {
      /* A prior lease failure cannot block the queue. */
    }
  }

  const capability: AccountSyncAckCapability = Object.freeze({
    [PRIVATE_SCOPE_BRAND]: true as const,
  });
  const lease: ScopeLease = {
    capability,
    database,
    ownerId: expectedOwnerId,
    isActive: true,
    verifiedMetadata: new Map<string, VerifiedAccountMetadataAck>(),
    rejectedAddRoots: new Map<string, DeferredAccountRejection>(),
    boundTransitions: new Map<string, BoundAccountRootIdentity>(),
  };
  activeByDatabase.set(database, lease);
  identityByCapability.set(capability, lease);
  try {
    return await operation(capability);
  } finally {
    // Invalidation is authoritative before making the next caller runnable.
    identityByCapability.delete(capability);
    if (activeByDatabase.get(database) === lease) {
      activeByDatabase.delete(database);
    }
    release();
    if (completionByDatabase.get(database) === completed) {
      completionByDatabase.delete(database);
    }
  }
}
