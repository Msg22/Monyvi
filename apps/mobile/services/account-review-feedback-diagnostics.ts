/**
 * #395 Review feedback diagnostics. Never emit raw errors, messages, stacks,
 * account/source IDs or financial/voice/SMS payloads to Metro or telemetry.
 */
import { reviewSaveFailurePhases } from "./account-review-save-failure-context";
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
  "account_review_prior_canonical_text_mismatch",
  "account_review_prior_payload_hash_mismatch",
  "account_review_prior_account_guards_mismatch",
  "account_review_prior_root_identity_mismatch",
  // Exact device-local recovery/provenance guards used by the Save writer.
  // Their static codes identify a rejected invariant without exposing rows.
  "account_review_local_default_duplicate_account_preimage",
  "account_review_local_default_duplicate_account_postimage",
  "account_review_local_default_changed_owned_default_snapshot",
  "account_review_local_default_active_account_membership_changed",
  "account_review_local_default_frozen_default_changed",
  "account_review_local_default_predecessor_root_changed",
  "account_review_local_default_foreign_predecessor_root",
  "account_review_local_default_invalid_prior_action_identity",
  "account_review_local_default_unprovable_account_predecessor",
  "account_review_local_default_default_dependency_owner_changed",
  "account_review_local_default_duplicate_predecessor_action",
  "account_review_local_snapshot_unsupported_physical_field",
  "account_review_local_snapshot_missing_physical_field",
  "account_review_local_snapshot_invalid_physical_text",
  "account_review_local_snapshot_invalid_physical_boolean",
  "account_review_local_snapshot_invalid_physical_timestamp",
  "account_review_local_snapshot_unsafe_physical_unsigned",
  "account_review_local_snapshot_missing_or_duplicate_prepared_postimage",
  "account_review_local_snapshot_domain_not_created",
  "account_review_local_snapshot_effect_membership_mismatch",
  "account_review_local_snapshot_effect_postimage_mismatch",
  "account_review_local_sms_invalid_original_selection",
  "account_review_local_sms_queue_session_or_ownership_changed",
  "account_review_local_sms_unexpected_prepared_sms_draft",
  "account_review_local_sms_missing_original_sms_draft",
  "account_review_local_sms_incorrect_sms_postimage_operation",
  "account_review_local_sms_reparented_original_sms_draft",
  "account_review_local_sms_original_bookkeeping_membership",
  "account_review_local_sms_original_selected_cleanup_missing",
  "account_review_local_sms_original_bookkeeping_ownership",
  "account_review_local_sms_original_bookkeeping_source_invalid",
  "account_review_local_sms_original_bookkeeping_revision",
  "account_review_local_sms_original_bookkeeping_snapshot_hash",
  "account_review_local_sms_queue_root_or_source_mismatch",
  "account_review_local_sms_queue_current_owned_draft_membership",
  "account_review_local_sms_queue_prepared_membership",
  "account_review_local_sms_queue_destructive_proof_missing",
  "account_review_local_sms_queue_not_pruned_but_prepared",
  "account_review_local_sms_queue_original_header_rebound",
  "account_review_local_sms_queue_unconsumed_draft_or_rebind",
  "account_review_local_sms_voice_contains_sms_evidence",
  "account_review_local_sms_sms_draft_coverage_mismatch",
  "account_review_local_snapshot_scope_mismatch",
  "account_review_private_lifecycle_root_owner_or_deleted_changed",
  "account_review_private_lifecycle_immutable_registered_root_changed",
  "account_review_private_lifecycle_invalid_owned_add_private_root",
  "account_review_private_lifecycle_invalid_add_private_evidence",
  "account_review_private_lifecycle_missing_or_wrong_review_private_root",
  "account_review_private_lifecycle_unexpected_legacy_private_evidence",
  "account_review_private_lifecycle_missing_review_private_evidence",
  "account_review_private_lifecycle_terminal_missing_original_authority",
  "account_review_private_lifecycle_multiple_current_owned_queues",
  "account_review_private_lifecycle_prune_current_writer_preimage_changed",
  "account_review_private_lifecycle_prune_missing_owned_root_or_queue",
  "account_review_private_lifecycle_missing_pretransition_private_evidence",
  "account_review_private_lifecycle_redaction_leaves_physical_original",
  "account_review_private_lifecycle_queue_removal_leaves_unproven_original",
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
  "ReferenceError",
  "InvariantViolation",
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

/**
 * Source filenames are repo-owned static names; arbitrary basenames/paths,
 * Metro query strings and JS function names never appear in the log.
 * Metro bundles are useful with source maps even when a symbol is minified.
 */
const SAFE_SOURCE_FILES = new Set([
  "voice-review.tsx",
  "sms-review.tsx",
  "account-review-runtime-save.ts",
  "account-review-save-service.ts",
  "account-review-save-preparation.ts",
  "account-review-save-plan.ts",
  "account-review-save-financial.ts",
  "account-review-save-accounts.ts",
  "account-review-save-digest.ts",
  "account-review-save-replay.ts",
  "account-review-save-sms.ts",
  "account-review-retention-lifecycle.ts",
  "user-data-access.ts",
  "account-review-save-ownership.ts",
  "account-review-financial-command-service.ts",
  "financial-action-foundation-repository.ts",
  "core-account-financial-action-service.ts",
  "watermelon-atomic-batch.ts",
  // Expo dev clients request this virtual entry before Metro rewrites it.
  ".virtual-metro-entry.bundle",
  "index.bundle",
  "entry.bundle",
  "index.android.bundle",
  "index.ios.bundle",
  "main.jsbundle",
  "index.jsbundle",
]);

interface SafeStackEvidence {
  readonly frames: readonly string[];
  readonly locations: readonly string[];
  readonly status: "absent" | "unmapped" | "located";
}

function readErrorField(error: unknown, key: string): unknown {
  if (!plainObject(error)) return undefined;
  try {
    return error[key];
  } catch {
    return undefined;
  }
}

function safeSourceLocation(
  rawPath: string | undefined,
  rawLine: string | undefined,
  rawColumn: string | undefined
): string | null {
  if (!rawPath || !rawLine || !rawColumn) return null;
  // Never retain path, hostname, query parameters or Metro source text.
  const path = rawPath.split(/[?#]/u)[0]?.replace(/\\/gu, "/");
  const basename = path?.split("/").pop();
  const line = Number(rawLine);
  const column = Number(rawColumn);
  return basename &&
    SAFE_SOURCE_FILES.has(basename) &&
    Number.isSafeInteger(line) &&
    Number.isSafeInteger(column) &&
    line > 0 &&
    column > 0 &&
    line <= 9999999 &&
    column <= 9999999
    ? basename + ":" + line + ":" + column
    : null;
}

/** Hermes/V8 "at fn (address at file:line:column)", JSC "fn@file:line:column". */
function safeStack(error: unknown): SafeStackEvidence {
  const stack = readErrorField(error, "stack");
  if (typeof stack !== "string" || stack.length === 0)
    return { frames: [], locations: [], status: "absent" };
  const frames: string[] = [];
  const locations: string[] = [];
  for (const raw of stack.slice(0, 12000).split("\n").slice(0, 15)) {
    const v8 =
      /^\s*at (.*?) \((?:address at )?(.+):(\d{1,7}):(\d{1,7})\)\s*$/u.exec(
        raw
      );
    const direct = /^\s*at (?:address at )?(.+):(\d{1,7}):(\d{1,7})\s*$/u.exec(
      raw
    );
    const jsc = /^([^@]*)@(.+):(\d{1,7}):(\d{1,7})\s*$/u.exec(raw);
    const name =
      v8?.[1] ??
      jsc?.[1] ??
      /^\s*at (?:async )?([\w$.]+) \((?:native)\)\s*$/u.exec(raw)?.[1];
    const symbol = name
      ?.replace(/^async /u, "")
      .split(".")
      .pop();
    if (
      symbol &&
      SAFE_FRAMES.has(symbol) &&
      !frames.includes(symbol) &&
      frames.length < 3
    )
      frames.push(symbol);
    const location = v8
      ? safeSourceLocation(v8[2], v8[3], v8[4])
      : direct
        ? safeSourceLocation(direct[1], direct[2], direct[3])
        : jsc
          ? safeSourceLocation(jsc[2], jsc[3], jsc[4])
          : null;
    if (location && !locations.includes(location) && locations.length < 3)
      locations.push(location);
  }
  return {
    frames,
    locations,
    status: locations.length ? "located" : "unmapped",
  };
}

/** Fixed diagnostic categories, never extracted text or SQL/JS expressions. */
function safeTechnicalReason(error: unknown): {
  readonly kind: string;
  readonly evidence: "static_code" | "message_shape" | "none";
} {
  const code = readErrorField(error, "code");
  if (code === "SQLITE_FULL")
    return { kind: "storage_full", evidence: "static_code" };
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED")
    return { kind: "storage_busy", evidence: "static_code" };
  if (code === "SQLITE_CANTOPEN")
    return { kind: "sqlite_cannot_open", evidence: "static_code" };
  const rawMessage = readErrorField(error, "message");
  if (typeof rawMessage !== "string" || rawMessage.length > 2000)
    return { kind: "unclassified", evidence: "none" };
  // Native bridge prefixes wrap SQLite errors on devices but not in Node.
  const message = rawMessage
    .replace(/^Exception in HostFunction: /u, "")
    .replace(/^\[WatermelonDB\] /u, "");
  if (/^(?:SQLITE_ERROR: )?no such table:/iu.test(message))
    return { kind: "sqlite_missing_table", evidence: "message_shape" };
  if (/^(?:SQLITE_ERROR: )?no such column:/iu.test(message))
    return { kind: "sqlite_missing_column", evidence: "message_shape" };
  if (
    /^(?:SQLITE_FULL: |sqlite )?(?:database or disk is full|disk is full)$/iu.test(
      message
    )
  )
    return { kind: "storage_full", evidence: "message_shape" };
  if (/^(?:SQLITE_BUSY: )?database is (?:locked|busy)$/iu.test(message))
    return { kind: "storage_busy", evidence: "message_shape" };
  if (
    /^Cannot read propert(?:y|ies) (?:['"][^'"]{0,160}['"] )?of (?:null|undefined)\b/iu.test(
      message
    ) ||
    /^(?:null|undefined) is not an object \(evaluating /iu.test(message)
  )
    return { kind: "nullish_property_access", evidence: "message_shape" };
  if (
    /^(?:undefined is not a function|.+ is not a function \(evaluating )/iu.test(
      message
    )
  )
    return { kind: "not_callable", evidence: "message_shape" };
  if (/^(?:Cannot find module|Requiring unknown module)\b/iu.test(message))
    return { kind: "module_unavailable", evidence: "message_shape" };
  if (code === "SQLITE_ERROR")
    return { kind: "sqlite_error", evidence: "static_code" };
  return { kind: "unclassified", evidence: "none" };
}

interface SafeDevCause {
  readonly errorClass: string;
  readonly code: string | null;
  readonly reason: string;
  readonly evidence: "static_code" | "message_shape" | "none";
  readonly stack: SafeStackEvidence["status"];
  readonly locations: readonly string[];
  readonly frames: readonly string[];
}

function safeDevTrace(error: unknown): readonly SafeDevCause[] {
  const seen = new Set<unknown>();
  const chain: SafeDevCause[] = [];
  let current = error;
  for (
    let depth = 0;
    depth < 3 && plainObject(current) && !seen.has(current);
    depth++
  ) {
    seen.add(current);
    const code =
      safeCode(readErrorField(current, "code")) ??
      safeCode(readErrorField(current, "message"));
    const reason = safeTechnicalReason(current);
    const stack = safeStack(current);
    chain.push({
      errorClass: safeClass(current),
      code,
      reason: reason.kind,
      evidence: reason.evidence,
      stack: stack.status,
      locations: stack.locations,
      frames: stack.frames,
    });
    current = readErrorField(current, "cause");
  }
  return chain;
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
    frames: safeStack(error).frames,
  };
}

/** Visible in Metro only, without forwarding exception objects to Sentry. */
export function logReviewFailure(
  input: ReviewFailureInput
): SafeReviewFailureDiagnostic {
  const diagnostic = sanitizeReviewFailure(input);
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    // Only this local Metro record gains technical evidence; the returned
    // diagnostic and all user-facing notices retain their strict safe contract.
    // React Native Metro prettyFormat truncates nested object arguments;
    // strings survive unchanged. Serialize ONLY the sanitized record.
    console.warn(
      "[account-review-feedback]",
      JSON.stringify({
        ...diagnostic,
        dev: {
          chain: safeDevTrace(input.error),
          ...(reviewSaveFailurePhases(input.error).length > 0
            ? { phases: reviewSaveFailurePhases(input.error) }
            : {}),
        },
      })
    );
  }
  return diagnostic;
}
