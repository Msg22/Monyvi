/**
 * #395 Review feedback diagnostics. Never emit raw errors, messages, stacks,
 * account/source IDs or financial/voice/SMS payloads to Metro or telemetry.
 */
import { FINANCIAL_ACTION_FOUNDATION_ERROR_CODES } from "./financial-action-foundation-contracts";
import { FINANCIAL_ACTION_INVALID_REVISION_CODE } from "../../../packages/logic/src/financial-actions/canonical-unsigned-revision";

export type ReviewFailureSource = "VOICE" | "SMS";
export type ReviewFailureStage =
  | "route_admission"
  | "capture"
  | "save_invocation"
  | "save_result"
  | "navigation_after_save"
  | "legacy_save"
  | "command"
  | "undo"
  | "discard"
  | "retry_consent"
  | "scan_bookkeeping"
  | "footer_unhandled";

export interface ReviewFailureInput {
  readonly source: ReviewFailureSource;
  readonly stage: ReviewFailureStage;
  readonly error?: unknown;
  readonly reasonCodes?: readonly string[];
}

export interface SafeReviewFailureDiagnostic {
  readonly source: ReviewFailureSource;
  readonly stage: ReviewFailureStage;
  readonly code: string;
  readonly errorClass: string;
  readonly frames: readonly string[];
}

/** Explicit allowlist, not a prefix: suffixes could contain private data. */
const SAFE_CODES = new Set([
  // Lightweight authority: financial-action-foundation-contracts.ts.
  // Individual keys are pinned; future contract additions require review.
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED,
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH,
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.NOT_FOUND,
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT,
  // Dependency-free authority: financial-actions/canonical-unsigned-revision.ts.
  FINANCIAL_ACTION_INVALID_REVISION_CODE,
  // Exact constants from core-account-financial-action-service.ts.
  // Do not eagerly import its writer/registry graph just for diagnostic codes.
  "core_account_financial_action_account_unavailable",
  "core_account_financial_action_invalid_effect",
  "core_account_financial_action_invalid_mutation",
  "core_account_financial_action_not_owned",
  "core_account_financial_action_revision_exhausted",
  "core_account_financial_action_unsafe_balance",
  // Exact values in financial-actions/action-contracts.ts and action-registry.ts.
  // Importing those modules would eagerly load the financial registry.
  "financial_action_invalid_json",
  "financial_action_duplicate_key",
  "financial_action_invalid_envelope",
  "financial_action_invalid_payload",
  "financial_action_invalid_string",
  "financial_action_unsupported_value",
  "financial_action_invalid_hash",
  "financial_action_invalid_transition",
  "financial_action_invalid_state_evidence",
  "financial_action_immutable_outcome_evidence",
  "financial_action_payload_too_large",
  "financial_action_duplicate_definition",
  "financial_action_unknown_definition",
  // Exact review-writer guard/sentinel codes (not arbitrary account_review_*).
  "account_review_financial_wrong_tuple",
  "account_review_save_replay_unexpected_prepare",
  "account_review_voice_scope_changed",
  "account_review_voice_view_invalidated",
  "account_review_voice_save_not_committed",
  "account_review_sms_session_scope_changed",
  "account_review_sms_display_queue_changed",
  "account_review_sms_save_uncommitted",
  "account_review_v2_legacy_save_forbidden",
  "account_review_runtime_group_not_confirmed",
  "account_review_runtime_empty_selection",
  "account_review_runtime_plan_overflow",
  "account_review_runtime_session_cas_changed",
  "account_review_runtime_actor_changed",
  "account_review_runtime_session_scope_changed",
  "account_review_save_actor_changed",
  "account_review_save_intent_stale",
  "account_review_save_category_stale",
  "account_review_save_current_session_changed",
  "account_review_save_replay_selection_changed",
  "account_review_save_replay_frozen_intent_changed",
  "account_review_save_replay_payload_changed",
  "account_review_save_unexpected_duplicate_commit",
  "account_review_financial_currency_unconfirmed",
  "account_review_financial_account_unresolved",
  "account_review_financial_transfer_destination",
  "account_review_financial_transfer_endpoints",
  "account_review_financial_revision_stale",
  "account_review_legacy_save_empty_result",
  "account_review_legacy_save_partial_result",
  "review_revision_stale",
  "review_group_count_stale",
  "account_group_snapshot_conflict",
  "account_group_removed",
  "account_needed",
  "category_needed",
  "currency_confirmation_needed",
  "cash_transfer_review",
  "account_unavailable",
  "review_owner_changed",
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_CONSTRAINT_PRIMARYKEY",
  "SQLITE_CONSTRAINT_FOREIGNKEY",
  "SQLITE_CONSTRAINT_NOTNULL",
  "SQLITE_CONSTRAINT_CHECK",
  "USER_REQUIRED",
  "AUTH_SCOPE_CHANGED",
  "OWNERSHIP_FAILED",
  "INVALID_PARENT_REFERENCE",
  "account_match_ambiguous",
  "account_identity_uncertain",
  "account_group_unconfirmed",
  "account_evidence_invalid",
  "review_source_changed",
  "review_undo_invalid",
  "review_shared_disclosure_required",
  "sms_review_draft_item_not_found",
  "account_review_account_creation_snapshot_presence",
  "account_review_account_financial_outcome_missing",
  "account_review_account_multiple_owned_defaults",
  "account_review_account_type_missing",
  "account_review_account_unplanned_created_id",
  "account_review_financial_affected_account_missing",
  "account_review_financial_amount_roundtrip",
  "account_review_financial_effect_missing",
  "account_review_prepared_account_mismatch",
  "account_review_prepared_child_parent_mismatch",
  "account_review_prepared_created_account_mismatch",
  "account_review_prepared_domain_create_mismatch",
  "account_review_prepared_effect_mismatch",
  "account_review_prepared_effect_revision_mismatch",
  "account_review_prepared_finance_owner_mismatch",
  "account_review_prepared_invalid_owned_original_queue_tombstone",
  "account_review_prepared_member_mismatch",
  "account_review_prepared_missing_canonical_raw_field",
  "account_review_save_cached_owner_changed",
  "account_review_save_cleanup_snapshot_changed",
  "account_review_save_confirmed_groups_changed",
  "account_review_save_created_group_ineligible",
  "account_review_save_currency_unconfirmed",
  "account_review_save_destination_not_cash",
  "account_review_save_duplicate_action_identity",
  "account_review_save_empty_action",
  "account_review_save_empty_financial_selection",
  "account_review_save_existing_account_ineligible",
  "account_review_save_group_not_confirmed",
  "account_review_save_planned_account_identity",
  "account_review_save_planned_account_type_missing",
  "account_review_save_planned_alias_missing",
  "account_review_save_planned_financial_identity",
  "account_review_save_planned_members_changed",
  "account_review_save_planned_members_incomplete",
  "account_review_save_prepared_owner_changed",
  "account_review_save_previous_action_pending",
  "account_review_save_private_owner_changed",
  "account_review_save_replay_bank_child_missing",
  "account_review_save_replay_currency_changed",
  "account_review_save_replay_financial_amount_inconsistent",
  "account_review_save_replay_financial_record_type",
  "account_review_save_replay_financial_transfer_type",
  "account_review_save_replay_planned_members_changed",
  "account_review_save_replay_selected_source_or_id_changed",
  "account_review_save_replay_sender_identity_changed",
  "account_review_save_replay_unexpected_selected_row",
  "account_review_save_replay_unrecognized_confirmed_group",
  "account_review_save_replay_unresolved_assignment",
  "account_review_save_replay_unused_planned_entity",
  "account_review_save_selected_row_unresolved",
  "account_review_save_selection_changed",
  "account_review_save_sibling_group_absent",
  "account_review_save_sibling_group_stale",
  "account_review_save_writer_snapshot_stale",
  "account_review_sms_cleanup_queue_membership_changed",
  "account_review_sms_cleanup_queue_missing",
  "account_review_sms_cleanup_queue_not_original",
  "account_review_sms_cleanup_selected_membership",
  "account_review_sms_foreign_queue",
  "account_review_sms_mixed_queue",
  "account_review_sms_mixed_source",
  "account_review_sms_physical_draft_missing",
  "account_review_sms_sibling_currency_changed",
  "account_review_sms_sibling_draft_changed",
  "account_review_sms_sibling_identity_changed",
  "account_review_sms_sibling_v2_required",
  "account_review_sms_stored_source_changed",
]);

const SAFE_CLASSES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ZodError",
  "AbortError",
  "SmsReviewDraftSaveValidationError",
  "SQLiteException",
]);

const SAFE_FRAMES = new Set([
  "handleV2Save",
  "handleCanonicalSave",
  "handleSave",
  "captureAccountReviewRuntimeSave",
  "freezeSelectedAccountReview",
  "saveCapturedAccountReview",
  "saveSelectedAccountReview",
  "constructReviewSave",
  "commitNewReviewAction",
  "commitPreparedBatch",
  "replayExistingAction",
  "assertCurrentReviewSession",
  "assertCategories",
  "assertRuntimeOwner",
  "runCommand",
  "dispatch",
  "submitManualDraft",
]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_CODES.has(value) ? value : null;
}

function safeClass(error: unknown): string {
  if (!plainObject(error)) return "UnknownError";
  const name = error.name;
  return typeof name === "string" && SAFE_CLASSES.has(name)
    ? name
    : "UnknownError";
}

function safeFrames(error: unknown): readonly string[] {
  if (!plainObject(error) || typeof error.stack !== "string") return [];
  const result: string[] = [];
  // Never retain the raw frame, path, error message or function arguments.
  for (const rawFrame of error.stack.split("\n").slice(1, 12)) {
    const match = /^\s*at (?:async )?([\w$.]+)(?:\s|\()/u.exec(rawFrame);
    const symbol = match?.[1]?.split(".").pop();
    if (!symbol || !SAFE_FRAMES.has(symbol) || result.includes(symbol))
      continue;
    result.push(symbol);
    if (result.length === 3) break;
  }
  return result;
}

export function sanitizeReviewFailure(
  input: ReviewFailureInput
): SafeReviewFailureDiagnostic {
  const reasons = input.reasonCodes ?? [];
  const knownReason = reasons.map(safeCode).find((code) => code !== null);
  const error = input.error;
  const errorCode = plainObject(error) ? safeCode(error.code) : null;
  const errorMessage = error instanceof Error ? safeCode(error.message) : null;
  return {
    source: input.source,
    stage: input.stage,
    code: knownReason ?? errorCode ?? errorMessage ?? "unexpected_error",
    errorClass: safeClass(error),
    frames: safeFrames(error),
  };
}

/** Visible in Metro only, without forwarding exception objects to Sentry. */
export function logReviewFailure(
  input: ReviewFailureInput
): SafeReviewFailureDiagnostic {
  const diagnostic = sanitizeReviewFailure(input);
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[account-review-feedback]", diagnostic);
  }
  return diagnostic;
}
