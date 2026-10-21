/**
 * #395: private diagnostic tags for already-refused financial sync roots.
 * No domain decision, stored action, SDK acknowledgement or transport changes.
 * Only fixed enums reach the development log; never serialize Error/cause/stack.
 */
export const MALFORMED_ACCOUNT_ACTION_ROOT_CODE =
  "account_financial_action_malformed_root" as const;

const PHASES = [
  "inspector",
  "envelope",
  "catalog",
  "effects",
  "collector",
  "ordering",
] as const;
const REASONS = [
  "payload_json_invalid",
  "payload_root_not_object",
  "root_tuple_mismatch",
  "mutation_entity_unsupported",
  "dirty_member_missing_or_duplicate",
  "created_member_deleted",
  "created_member_owner_mismatch",
  "created_child_parent_mismatch",
  "default_clear_mismatch",
  "mutation_mode_invalid",
  "effect_count_mismatch",
  "effect_fields_mismatch",
  "guard_account_id_invalid",
  "guard_account_membership_mismatch",
  "add_created_account_cardinality",
  "add_created_account_snapshot_invalid",
  "legacy_envelope_invalid_json",
  "legacy_envelope_not_object",
  "legacy_envelope_fields_invalid",
  "catalog_binding_mismatch",
  "effect_record_invalid",
  "effect_identity_missing",
  "orphan_effect_unverified",
  "effect_payload_invalid_json",
  "effect_payload_invalid_shape",
  "effect_immutable_fields_mismatch",
  "creator_account_collision",
  "creator_dependency_cycle",
  "root_identity_missing",
  "root_references_empty",
  "root_guards_empty",
] as const;
const TABLES = [
  "accounts",
  "account_sms_senders",
  "bank_details",
  "transactions",
  "transfers",
  "account_financial_effects",
] as const;
const ROOT_STATES = [
  "pending_local",
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "rejected_compensating",
  "reconciliation_incomplete",
  "reconciled",
] as const;

const PAYLOAD_VERSIONS = [
  "review.batch-save/v1",
  "account.create-default/v1",
] as const;
const MUTATION_ENTITIES = [
  "account",
  "account_default",
  "account_sms_sender",
  "bank_details",
  "transaction",
  "transfer",
] as const;
const DIRTY_BUCKETS = ["created", "updated", "created_or_updated"] as const;
const MEMBER_PRESENCE = [
  "absent",
  "created",
  "updated",
  "created_and_updated",
  "deleted",
  "duplicate",
] as const;

export type AccountActionFailurePhase = (typeof PHASES)[number];
export type AccountActionFailureReason = (typeof REASONS)[number];

export interface AccountActionFailureSite {
  readonly phase: AccountActionFailurePhase;
  readonly reason: AccountActionFailureReason;
  /** Unknown inputs are discarded, not logged, unless exactly allowlisted. */
  readonly table?: unknown;
  readonly rootState?: unknown;
  readonly payloadVersion?: unknown;
  readonly mutationEntity?: unknown;
  readonly expectedBucket?: unknown;
  readonly memberPresence?: unknown;
}

interface AccountActionFailureContext {
  readonly code: typeof MALFORMED_ACCOUNT_ACTION_ROOT_CODE;
  readonly phase: AccountActionFailurePhase | "unclassified";
  readonly reason: AccountActionFailureReason | "unclassified";
  readonly table?: (typeof TABLES)[number];
  readonly rootState?: (typeof ROOT_STATES)[number];
  readonly payloadVersion?: (typeof PAYLOAD_VERSIONS)[number];
  readonly mutationEntity?: (typeof MUTATION_ENTITIES)[number];
  readonly expectedBucket?: (typeof DIRTY_BUCKETS)[number];
  readonly memberPresence?: (typeof MEMBER_PRESENCE)[number];
}

/** Not an Error field, property, cause or persisted payload. */
const privateTags = new WeakMap<Error, AccountActionFailureContext>();

function isAllowed<T extends string>(
  value: unknown,
  allowlist: readonly T[]
): value is T {
  return typeof value === "string" && allowlist.some((item) => item === value);
}

/** Identical public error code, with no readable private data attached. */
export function malformedAccountActionRoot(
  site: AccountActionFailureSite
): Error {
  const error = new Error(MALFORMED_ACCOUNT_ACTION_ROOT_CODE);
  const phase = isAllowed(site.phase, PHASES) ? site.phase : "unclassified";
  const reason = isAllowed(site.reason, REASONS) ? site.reason : "unclassified";
  const table = isAllowed(site.table, TABLES) ? site.table : null;
  const rootState = isAllowed(site.rootState, ROOT_STATES)
    ? site.rootState
    : null;
  const payloadVersion = isAllowed(site.payloadVersion, PAYLOAD_VERSIONS)
    ? site.payloadVersion
    : null;
  const mutationEntity = isAllowed(site.mutationEntity, MUTATION_ENTITIES)
    ? site.mutationEntity
    : null;
  const expectedBucket = isAllowed(site.expectedBucket, DIRTY_BUCKETS)
    ? site.expectedBucket
    : null;
  const memberPresence = isAllowed(site.memberPresence, MEMBER_PRESENCE)
    ? site.memberPresence
    : null;
  privateTags.set(
    error,
    Object.freeze({
      code: MALFORMED_ACCOUNT_ACTION_ROOT_CODE,
      phase,
      reason,
      ...(table === null ? {} : { table }),
      ...(rootState === null ? {} : { rootState }),
      ...(payloadVersion === null ? {} : { payloadVersion }),
      ...(mutationEntity === null ? {} : { mutationEntity }),
      ...(expectedBucket === null ? {} : { expectedBucket }),
      ...(memberPresence === null ? {} : { memberPresence }),
    })
  );
  return error;
}

/** One safe JSON string for Metro; untagged errors are intentionally silent. */
export function serializeAccountActionFailureContext(
  error: unknown
): string | null {
  // Some sync layers preserve an Error as a cause. Inspect only a bounded
  // Error-to-Error chain; never log message, cause, stack or arbitrary fields.
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!(current instanceof Error)) return null;
    if (current.message === MALFORMED_ACCOUNT_ACTION_ROOT_CODE) {
      const context = privateTags.get(current);
      if (context)
        return JSON.stringify({
          event: "sync.financialActionRejected",
          ...context,
        });
    }
    current = "cause" in current ? current.cause : null;
  }
  return null;
}
