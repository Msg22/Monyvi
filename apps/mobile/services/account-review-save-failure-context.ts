/** Bounded local Save phases. Keep the original exception and retry identity. */
export type ReviewSaveFailurePhase =
  | "prior_parse_envelope"
  | "prior_hash_envelope"
  | "prior_canonical_identity"
  | "prior_root_identity"
  | "prior_metals_sell_v1"
  | "prior_metals_sell_v2"
  | "prior_account_create_default"
  | "prior_review_batch_save"
  | "prior_other_action"
  | "capture_preparation"
  | "owner_before_load"
  | "load_database"
  | "load_save_service"
  | "owner_after_load"
  | "invoke_save_service"
  | "freeze_input"
  | "read_owner_scope"
  | "lookup_action"
  | "replay_action"
  | "writer_revalidation"
  | "capture_recovery_snapshot"
  | "construct_plan"
  | "commit_action";

const failures = new WeakMap<object, readonly ReviewSaveFailurePhase[]>();

export function rememberReviewSaveFailure(
  error: unknown,
  phase: ReviewSaveFailurePhase
): void {
  if (
    (typeof error !== "object" || error === null) &&
    typeof error !== "function"
  )
    return;
  const previous = failures.get(error) ?? [];
  if (!previous.includes(phase) && previous.length < 5)
    failures.set(error, [...previous, phase]);
}

export function reviewSaveFailurePhases(
  error: unknown
): readonly ReviewSaveFailurePhase[] {
  if (
    (typeof error !== "object" || error === null) &&
    typeof error !== "function"
  )
    return [];
  return failures.get(error) ?? [];
}

/** Observe an already-started operation once; never retry, replace or swallow it. */
export function observeReviewSaveFailure<T>(
  phase: ReviewSaveFailurePhase,
  operation: Promise<T>
): Promise<T> {
  return operation.catch((error: unknown) => {
    rememberReviewSaveFailure(error, phase);
    throw error;
  });
}
