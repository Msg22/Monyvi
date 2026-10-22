import type { AccountFinancialEffect, FinancialActionGroup } from "@monyvi/db";
import {
  FINANCIAL_ACTION_STATES,
  parseCanonicalDecimal,
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
  type FinancialActionState,
  type FinancialActionValidationInput,
} from "@monyvi/logic";
import { Q, type Database } from "@nozbe/watermelondb";
import { assertCanonicalMetalRevision } from "../metal-financial-action-adapter";
import { INVALID_LEGACY_ID_PULL_ROW } from "./metal-dedicated-identity-pull";
import { createAccountDefaultAndReviewRegistry } from "../../../../packages/logic/src/financial-actions/account-create-default-registration";

/** Original exact PostgREST text normalization, mechanically relocated from
 * pull-strategies. PR385 collision checks remain separately fail-closed.
 */
export const EXACT_TEXT_PULL_ERROR_CODE = "sync_invalid_exact_text";

function normalizeExactTextColumn(
  record: Record<string, unknown>,
  alias: string,
  target: string,
  validate: (value: string) => void
): Record<string, unknown> {
  const value = record[alias];
  if (value !== null && typeof value !== "string") {
    throw new Error(EXACT_TEXT_PULL_ERROR_CODE);
  }
  if (typeof value === "string") {
    try {
      validate(value);
    } catch {
      throw new Error(EXACT_TEXT_PULL_ERROR_CODE);
    }
  }
  const normalized = { ...record, [target]: value };
  delete normalized[alias];
  return normalized;
}

function validateCanonicalDecimal(value: string): void {
  parseCanonicalDecimal(value);
}

function validateSerializedJson(value: string): void {
  JSON.parse(value);
}

function validateCanonicalAccountRevision(value: string): void {
  if (!/^(0|[1-9]\d*)$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new Error(EXACT_TEXT_PULL_ERROR_CODE);
  }
}

function validateSignedMinorUnits(value: string): void {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new Error(EXACT_TEXT_PULL_ERROR_CODE);
  }
  const parsed = BigInt(value);
  if (parsed < -9223372036854775807n || parsed > 9223372036854775807n) {
    throw new Error(EXACT_TEXT_PULL_ERROR_CODE);
  }
}

export function normalizeDedicatedPullRecord(
  table: string,
  record: Record<string, unknown>
): Record<string, unknown> {
  if (table === "account_financial_effects") {
    const revision = normalizeExactTextColumn(
      record,
      "accepted_account_revision_text",
      "accepted_account_revision",
      validateCanonicalAccountRevision
    );
    const amount = normalizeExactTextColumn(
      revision,
      "amount_minor_units_text",
      "amount_minor_units",
      validateSignedMinorUnits
    );
    return normalizeFinancialEffectTimestamp(
      amount,
      INVALID_LEGACY_ID_PULL_ROW
    );
  }
  if (table === "financial_action_groups") {
    const accountGuards = normalizeExactTextColumn(
      record,
      "account_guards_json_text",
      "account_guards_json",
      validateSerializedJson
    );
    const outcome = normalizeExactTextColumn(
      accountGuards,
      "outcome_json_text",
      "outcome_json",
      validateSerializedJson
    );
    return normalizeExactTextColumn(
      outcome,
      "payload_json_text",
      "payload_json",
      validateSerializedJson
    );
  }
  if (table === "metal_action_evidence") {
    const canonicalRevision = normalizeExactTextColumn(
      record,
      "canonical_holding_revision_text",
      "canonical_holding_revision",
      assertCanonicalMetalRevision
    );
    const payload = normalizeExactTextColumn(
      canonicalRevision,
      "domain_payload_json_text",
      "domain_payload_json",
      validateSerializedJson
    );
    return normalizeExactTextColumn(
      payload,
      "expected_holding_revision_text",
      "expected_holding_revision",
      assertCanonicalMetalRevision
    );
  }
  if (table === "metal_lifecycle_events") {
    return normalizeExactTextColumn(
      record,
      "payload_json_text",
      "payload_json",
      validateSerializedJson
    );
  }
  if (table === "metal_rate_references") {
    return normalizeExactTextColumn(
      record,
      "value_decimal_text",
      "value_decimal",
      validateCanonicalDecimal
    );
  }
  return normalizePulledExactText("metal_holding_states", record);
}

export function normalizePulledExactText(
  table: string,
  record: Record<string, unknown>
): Record<string, unknown> {
  if (table === "assets") {
    return normalizeExactTextColumn(
      record,
      "purchase_price_decimal_text",
      "purchase_price_decimal",
      validateCanonicalDecimal
    );
  }
  if (table === "asset_metals") {
    const weight = normalizeExactTextColumn(
      record,
      "weight_grams_decimal_text",
      "weight_grams_decimal",
      validateCanonicalDecimal
    );
    return normalizeExactTextColumn(
      weight,
      "purity_factor_decimal_text",
      "purity_factor_decimal",
      validateCanonicalDecimal
    );
  }
  if (table === "metal_holding_states") {
    return normalizeExactTextColumn(
      record,
      "financial_revision_text",
      "financial_revision",
      assertCanonicalMetalRevision
    );
  }
  if (table === "accounts" || table === "recurring_payments") {
    return normalizeExactTextColumn(
      record,
      "financial_revision_text",
      "financial_revision",
      validateCanonicalAccountRevision
    );
  }
  return { ...record };
}

export const FINANCIAL_PULL_SHAPING_ERROR_CODE =
  "sync_pull_financial_action_collision_mismatch";
const REGISTRY = createAccountDefaultAndReviewRegistry();
const UNRESOLVED_FINANCIAL_ACTION_STATES = [
  "pending_local",
  "local_complete",
  "sync_pending",
  "sync_failed",
  "rejected_compensating",
  "reconciliation_incomplete",
] as const satisfies readonly FinancialActionState[];
const UNRESOLVED_FINANCIAL_ACTION_STATE_SET = new Set<string>(
  UNRESOLVED_FINANCIAL_ACTION_STATES
);

export interface FinancialPullRow extends Record<string, unknown> {
  readonly id: string;
}

function fail(): never {
  throw new Error(FINANCIAL_PULL_SHAPING_ERROR_CODE);
}
function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) fail();
  return value;
}
function requiredNullableString(
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") fail();
  return value;
}
function readOwnedActionId(record: FinancialPullRow, userId: string): string {
  if (requiredString(record, "user_id") !== userId) fail();
  return requiredString(record, "action_id");
}
function readServerPayloadJson(record: FinancialPullRow): string {
  return typeof record.payload_json_text === "string"
    ? record.payload_json_text
    : requiredString(record, "payload_json");
}
function isUnresolvedState(state: string): boolean {
  if (!FINANCIAL_ACTION_STATES.some((candidate) => candidate === state)) fail();
  return UNRESOLVED_FINANCIAL_ACTION_STATE_SET.has(state);
}

function currentCalendarDate(): string {
  // Match the existing Add/Edit creation-side business-date contract.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) fail();
    return part.value;
  };
  return `${read("year")}-${read("month")}-${read("day")}`;
}
function canonicalPayloadIdentity(
  rawText: string,
  validationInput: FinancialActionValidationInput
): {
  readonly canonicalText: string;
  readonly envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
} {
  try {
    // The default registry omits the registered AccountAdd/Review definitions.
    const envelope = parseFinancialActionEnvelopeJson(
      rawText,
      REGISTRY,
      validationInput
    );
    return {
      canonicalText: serializeFinancialActionEnvelope(
        envelope,
        REGISTRY,
        validationInput
      ),
      envelope,
    };
  } catch {
    fail();
  }
}
async function loadOwnedRoots(
  database: Database,
  userId: string,
  actionIds: readonly string[]
): Promise<readonly FinancialActionGroup[]> {
  if (actionIds.length === 0) return [];
  const roots = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(
      Q.where("user_id", userId),
      Q.where("action_id", Q.oneOf([...new Set(actionIds)]))
    )
    .fetch();
  const seen = new Set<string>();
  for (const root of roots) {
    if (root.userId !== userId || seen.has(root.actionId)) fail();
    seen.add(root.actionId);
  }
  return roots;
}
export async function hasOwnedUnresolvedFinancialActions(
  database: Database,
  userId: string
): Promise<boolean> {
  const count = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(
      Q.where("user_id", userId),
      Q.where("state", Q.oneOf([...UNRESOLVED_FINANCIAL_ACTION_STATES]))
    )
    .fetchCount();
  return count > 0;
}
/** Existing internal-only opt-in: only registered, claimed terminal Add/Review
 * candidates reach the #395 authenticated SDK writer. That writer, not this
 * prewriter network shaping step, proves SQL091/SQL090 receipts, original
 * physical identities, private evidence and SDK checkpoint/ACK. The default
 * remains PR385's withholding of every unresolved local root.
 */
export interface ProtectedAcceptedAddPullOption {
  readonly admitAcceptedAddToProtectedWriter?: boolean;
}

function canForwardAcceptedAddCandidate(
  record: FinancialPullRow,
  local: FinancialActionGroup,
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): boolean {
  if (
    !["local_complete", "sync_pending", "sync_failed"].includes(local.state) ||
    local.domain !== "accounts" ||
    local.kind !== "create_with_default" ||
    envelope.domain !== "accounts" ||
    envelope.kind !== "create_with_default" ||
    // Version is registered INSIDE payload_json; no root payload_version SQL
    // column exists. PR385 already parsed this envelope with Cairo's date rule.
    envelope.payloadVersion !== "account.create-default/v1" ||
    envelope.userId !== local.userId ||
    envelope.actionId !== local.actionId ||
    envelope.domainReferenceId !== local.domainReferenceId ||
    record.domain !== "accounts" ||
    record.kind !== "create_with_default" ||
    record.state !== "accepted" ||
    record.server_outcome !== "accepted" ||
    record.deleted !== false ||
    record.rejection_code !== null ||
    record.domain_reference_id !== local.domainReferenceId ||
    typeof record.account_guards_json_text !== "string" ||
    typeof record.outcome_json_text !== "string"
  )
    return false;
  // JSONB ::text is semantically identical to the registered guards, but
  // Postgres may change whitespace/object-key order. The #395 writer still
  // independently validates the entire immutable tuple and receipt.
  try {
    const guards: unknown = JSON.parse(record.account_guards_json_text);
    if (
      !Array.isArray(guards) ||
      guards.length !== envelope.accountGuards.length ||
      guards.some((value: unknown, i: number) => {
        const expected = envelope.accountGuards[i];
        return (
          !expected ||
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value) ||
          Object.keys(value).length !== 2 ||
          !("accountId" in value) ||
          value.accountId !== expected.accountId ||
          !("expectedRevision" in value) ||
          value.expectedRevision !== expected.expectedRevision
        );
      })
    )
      return false;
    const receipt: unknown = JSON.parse(record.outcome_json_text);
    return (
      typeof receipt === "object" &&
      receipt !== null &&
      !Array.isArray(receipt) &&
      "actionId" in receipt &&
      receipt.actionId === local.actionId &&
      "status" in receipt &&
      receipt.status === "accepted" &&
      "accountRevisions" in receipt &&
      Array.isArray(receipt.accountRevisions)
    );
  } catch {
    return false;
  }
}

/** Admission is NOT a Review acceptance verdict. Forward only a claimed
 * terminal response for the already committed registered Review action.
 * Do not inspect/re-serialize the receipt here: missing, malformed,
 * duplicated or mismatched original exact-text bytes must be rejected by
 * the existing final authenticated writer, never silently omitted while the
 * SDK advances its pull checkpoint.
 */
function canForwardClaimedAcceptedReviewCandidate(
  record: FinancialPullRow,
  local: FinancialActionGroup,
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): boolean {
  return (
    ["local_complete", "sync_pending", "sync_failed"].includes(local.state) &&
    local.domain === "transactions" &&
    local.kind === "review_batch_save" &&
    envelope.domain === "transactions" &&
    envelope.kind === "review_batch_save" &&
    envelope.payloadVersion === "review.batch-save/v1" &&
    envelope.userId === local.userId &&
    envelope.actionId === local.actionId &&
    envelope.domainReferenceId === local.domainReferenceId &&
    record.state === "accepted"
  );
}

function shapeRootRecord(
  record: FinancialPullRow,
  local: FinancialActionGroup | undefined,
  userId: string,
  option: ProtectedAcceptedAddPullOption
): readonly FinancialPullRow[] {
  const actionId = readOwnedActionId(record, userId);
  if (!local) return [record];
  if (!isUnresolvedState(local.state)) return [{ ...record, id: local.id }];
  const validationInput: FinancialActionValidationInput = {
    latestAllowedCalendarDate: currentCalendarDate(),
  };
  const localIdentity = canonicalPayloadIdentity(
    local.payloadJson,
    validationInput
  );
  const serverIdentity = canonicalPayloadIdentity(
    readServerPayloadJson(record),
    validationInput
  );
  if (
    local.userId !== userId ||
    local.actionId !== actionId ||
    local.payloadHash !== requiredString(record, "payload_hash") ||
    localIdentity.canonicalText !== serverIdentity.canonicalText
  )
    fail();
  // PR385 withholds unresolved roots by default. Only a registered AccountAdd
  // receipt candidate OR a claimed terminal registered Review candidate can
  // reach the unchanged #395 authenticated writer. The Review writer must
  // reject malformed SQL090 evidence before checkpoint; no prewriter receipt
  // parsing can turn untrusted network bytes into an acceptance verdict.
  return option.admitAcceptedAddToProtectedWriter &&
    (canForwardAcceptedAddCandidate(record, local, serverIdentity.envelope) ||
      canForwardClaimedAcceptedReviewCandidate(
        record,
        local,
        serverIdentity.envelope
      ))
    ? [record]
    : [];
}
export async function shapeFinancialActionRootPull(
  database: Database,
  userId: string,
  records: readonly FinancialPullRow[],
  option: ProtectedAcceptedAddPullOption = {}
): Promise<readonly FinancialPullRow[]> {
  const roots = await loadOwnedRoots(
    database,
    userId,
    records.map((record) => readOwnedActionId(record, userId))
  );
  const localByAction = new Map(roots.map((root) => [root.actionId, root]));
  return records.flatMap((record) =>
    shapeRootRecord(
      record,
      localByAction.get(readOwnedActionId(record, userId)),
      userId,
      option
    )
  );
}
function assertEffectIdentity(
  local: AccountFinancialEffect,
  record: FinancialPullRow,
  userId: string
): void {
  if (
    local.id !== record.id ||
    local.userId !== userId ||
    local.actionId !== readOwnedActionId(record, userId) ||
    local.accountId !== requiredString(record, "account_id") ||
    local.domain !== requiredString(record, "domain") ||
    local.kind !== requiredString(record, "kind") ||
    local.currency !== requiredString(record, "currency") ||
    local.amountMinorUnits !==
      requiredString(record, "amount_minor_units_text") ||
    local.acceptedAccountRevision !==
      requiredString(record, "accepted_account_revision_text") ||
    local.reversesEffectId !==
      requiredNullableString(record, "reverses_effect_id")
  )
    fail();
}
async function loadCollidingEffects(
  database: Database,
  userId: string,
  records: readonly FinancialPullRow[]
): Promise<ReadonlyMap<string, AccountFinancialEffect>> {
  const ids = records.map((record) => {
    readOwnedActionId(record, userId);
    return record.id;
  });
  if (ids.length === 0) return new Map();
  const effects = await database
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(
      Q.where("user_id", userId),
      Q.where("id", Q.oneOf([...new Set(ids)]))
    )
    .fetch();
  return new Map(effects.map((effect) => [effect.id, effect]));
}
export async function shapeAccountFinancialEffectPull(
  database: Database,
  userId: string,
  records: readonly FinancialPullRow[]
): Promise<readonly FinancialPullRow[]> {
  const roots = await loadOwnedRoots(
    database,
    userId,
    records.map((record) => readOwnedActionId(record, userId))
  );
  const unresolved = new Set(
    roots
      .filter((root) => isUnresolvedState(root.state))
      .map((root) => root.actionId)
  );
  const localById = await loadCollidingEffects(database, userId, records);
  return records.filter((record) => {
    const actionId = readOwnedActionId(record, userId);
    const local = localById.get(record.id);
    if (!local) return true;
    assertEffectIdentity(local, record, userId);
    // Matching unresolved effects stay local until actual reconciliation.
    // Matching settled effects receive the canonical mutable outcome.
    return !unresolved.has(actionId);
  });
}
export async function shapeFinancialPullRecords(
  table: string,
  records: readonly FinancialPullRow[],
  userId: string,
  database?: Database,
  option: ProtectedAcceptedAddPullOption = {}
): Promise<readonly FinancialPullRow[]> {
  if (!database) return records;
  if (table === "financial_action_groups")
    return shapeFinancialActionRootPull(database, userId, records, option);
  if (table === "account_financial_effects")
    return shapeAccountFinancialEffectPull(database, userId, records);
  return records;
}
export function normalizeFinancialEffectTimestamp(
  record: Record<string, unknown>,
  invalidRowErrorCode: string
): Record<string, unknown> {
  const value = record.compensated_at;
  if (value === null) return { ...record };
  if (typeof value !== "string") throw new Error(invalidRowErrorCode);
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  )
    throw new Error(invalidRowErrorCode);
  return { ...record, compensated_at: timestamp };
}
