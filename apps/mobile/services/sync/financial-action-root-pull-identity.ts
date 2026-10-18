/** Canonical owner/action identity at the dedicated financial root pull seam. */
import * as Crypto from "expo-crypto";
import {
  FINANCIAL_ACTION_STATES,
  SERVER_OUTCOMES,
  MAX_CANONICAL_UNSIGNED_INTEGER_STRING,
  assertFinancialActionStateEvidence,
  parseFinancialActionEvidenceJson,
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
  type FinancialActionServerOutcome,
  type FinancialActionState,
  type FinancialActionEnvelopeV1,
} from "../../../../packages/logic/src/financial-actions/action-contracts";
import { schema } from "../../../../packages/db/src/schema";
import { calendarDateForTimestamp } from "../../../../packages/logic/src/metals/historical-rate";
import {
  MAX_CANONICAL_ACTION_UTF8_BYTES,
  getFinancialActionUtf8ByteLength,
} from "../../../../packages/logic/src/financial-actions/action-registry";
import {
  reviewBatchSaveWireSchema,
  revisionSchema,
  timestampSchema,
  uuidSchema,
} from "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from "../account-review-financial-command-service";

export interface CheckedCloudActionRoot {
  readonly actionId: string;
  readonly id: string;
  readonly ownerId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly canonical: Readonly<Record<string, unknown>>;
  readonly isDeleted: boolean;
  readonly state: FinancialActionState;
  /** True only after validating the COMPLETE SQL090 six-key accepted Review
   * receipt against this immutable, registered action envelope. */
  readonly verifiedReviewAcceptance: boolean;
}

const rootSchema = schema.tables.financial_action_groups;
const rootColumns = rootSchema.columnArray.filter(
  (column) => column.name !== "local_recovery_snapshot_json"
);
const ROOT_LOCAL_ONLY = "local_recovery_snapshot_json";
const SHA256 = /^[0-9a-f]{64}$/;

function invalid(reason: string): never {
  throw new Error("financial_action_root_pull_" + reason);
}
export function pullRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return invalid("invalid_row");
  return Object.fromEntries(Object.entries(value));
}
function stringField(
  row: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0)
    return invalid("invalid_" + key);
  return value;
}
function nullableString(
  row: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return invalid("invalid_" + key);
  return value;
}
function requireActionState(value: unknown): FinancialActionState {
  const found = FINANCIAL_ACTION_STATES.find((state) => state === value);
  return found ?? invalid("invalid_state");
}
function requireServerOutcome(
  value: unknown
): FinancialActionServerOutcome | null {
  if (value === null || value === undefined) return null;
  const found = SERVER_OUTCOMES.find((status) => status === value);
  return found ?? invalid("invalid_server_outcome");
}
function canonicalGuardText(
  raw: string,
  guards: ReadonlyArray<{
    readonly accountId: string;
    readonly expectedRevision: string;
  }>
): string {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return invalid("invalid_guards_json");
  }
  if (!Array.isArray(decoded) || decoded.length !== guards.length)
    return invalid("invalid_guards_membership");
  for (const [i, guard] of guards.entries()) {
    const entry = pullRecord(decoded[i]);
    if (
      Object.keys(entry).length !== 2 ||
      entry.accountId !== guard.accountId ||
      entry.expectedRevision !== guard.expectedRevision
    )
      return invalid("invalid_guards_binding");
  }
  return JSON.stringify(guards);
}
function validatePublicProjection(
  record: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  // Watermelon stores id implicitly, outside the declared column array.
  const allowed = new Set(["id", ...rootColumns.map((column) => column.name)]);
  const actual: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === ROOT_LOCAL_ONLY) continue;
    if (!allowed.has(key)) invalid("unknown_public_column");
    actual[key] = value;
  }
  for (const column of rootColumns) {
    const value = actual[column.name];
    if (value === undefined || value === null) {
      if (!column.isOptional) invalid("missing_" + column.name);
      actual[column.name] = null;
    } else if (
      column.type !== typeof value ||
      (column.type === "number" && !Number.isFinite(value))
    )
      invalid("invalid_" + column.name);
  }
  return actual;
}
function checkedEnvelope(
  row: Readonly<Record<string, unknown>>,
  expectedOwnerId: string
): {
  readonly payloadJson: string;
  readonly guards: string;
  readonly envelope: FinancialActionEnvelopeV1;
} {
  const registry = createAccountReviewFinancialRegistry();
  // Metals date validation requires a trusted Cairo calendar ceiling even
  // when re-reading immutable, previously valid cloud action envelopes.
  // Freeze it once for BOTH parse and serialize, never from network payload.
  const latestAllowedCalendarDate = calendarDateForTimestamp(Date.now());
  if (latestAllowedCalendarDate === null)
    return invalid("calendar_date_unavailable");
  const validationInput = { latestAllowedCalendarDate };
  const envelope = parseFinancialActionEnvelopeJson(
    stringField(row, "payload_json"),
    registry,
    validationInput
  );
  if (
    envelope.userId !== expectedOwnerId ||
    envelope.actionId !== row.action_id ||
    envelope.domain !== row.domain ||
    envelope.kind !== row.kind ||
    envelope.domainReferenceId !== row.domain_reference_id
  )
    return invalid("immutable_identity_changed");
  return {
    payloadJson: serializeFinancialActionEnvelope(
      envelope,
      registry,
      validationInput
    ),
    envelope,
    guards: canonicalGuardText(
      stringField(row, "account_guards_json"),
      envelope.accountGuards
    ),
  };
}
function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return invalid("unsupported_outcome_value");
  return (
    "{" +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item))
      .join(",") +
    "}"
  );
}
function canonicalOutcomeText(
  row: Readonly<Record<string, unknown>>
): string | null {
  const raw = nullableString(row, "outcome_json");
  if (raw === null) return null;
  try {
    // Validate ORIGINAL exact network bytes before normalization: the shared
    // financial-evidence parser enforces the registered UTF-8 ceiling and
    // rejects duplicate keys at any depth (including escaped aliases).
    // Valid whitespace/key ordering may still normalize for state evidence.
    return canonicalJson(parseFinancialActionEvidenceJson(raw));
  } catch {
    return invalid("invalid_outcome_json");
  }
}
function checkedState(row: Readonly<Record<string, unknown>>): {
  readonly state: FinancialActionState;
  readonly outcomeJson: string | null;
  readonly serverOutcome: FinancialActionServerOutcome | null;
} {
  const state = requireActionState(row.state);
  const outcomeJson = canonicalOutcomeText(row);
  const serverOutcome = requireServerOutcome(row.server_outcome);
  try {
    assertFinancialActionStateEvidence(state, {
      serverOutcome,
      outcomeJson,
      rejectionCode: nullableString(row, "rejection_code"),
    });
  } catch {
    return invalid("invalid_state_evidence");
  }
  return { state, outcomeJson, serverOutcome };
}

/** Closed SQL090 Review terminal-receipt gate. A generic valid JSON outcome or
 * state='accepted' is NEVER authority to discard device-private recovery.
 * SQL090 emits every affected account revision: each guarded CREATE becomes
 * revision 1; every existing guard advances its exact registered revision by 1.
 * The RPC replay variant changes only status to 'idempotent'. */
function closedReceiptObject(
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function invalidReviewReceipt(): never {
  return invalid("invalid_review_acceptance_receipt");
}
function verifyReviewAcceptedReceipt(
  envelope: FinancialActionEnvelopeV1,
  state: FinancialActionState,
  serverOutcome: FinancialActionServerOutcome | null,
  outcomeJson: string | null
): boolean {
  // New acceptance restrictions apply ONLY to the registered Review tuple.
  if (
    envelope.domain !== "transactions" ||
    envelope.kind !== "review_batch_save" ||
    envelope.payloadVersion !== "review.batch-save/v1" ||
    state !== "accepted"
  ) {
    return false;
  }
  if (
    (serverOutcome !== "accepted" && serverOutcome !== "idempotent") ||
    outcomeJson === null ||
    getFinancialActionUtf8ByteLength(outcomeJson) >
      MAX_CANONICAL_ACTION_UTF8_BYTES
  ) {
    invalidReviewReceipt();
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(outcomeJson);
  } catch {
    return invalidReviewReceipt();
  }
  if (
    !closedReceiptObject(decoded, [
      "accountRevisions",
      "actionId",
      "effectiveEventId",
      "holdingRevision",
      "serverAcceptedAt",
      "status",
    ]) ||
    decoded.actionId !== envelope.actionId ||
    decoded.status !== serverOutcome ||
    decoded.effectiveEventId !== null ||
    decoded.holdingRevision !== null ||
    !timestampSchema.safeParse(decoded.serverAcceptedAt).success ||
    !Array.isArray(decoded.accountRevisions)
  ) {
    invalidReviewReceipt();
  }
  const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
  const createdIds = new Set(
    payload.domainMutation.records
      .filter((record) => record.entity === "account")
      .map((record) => record.after.id)
  );
  const rows = decoded.accountRevisions;
  const guards = envelope.accountGuards;
  if (
    rows.length !== guards.length ||
    rows.length !== payload.accountEffects.length
  ) {
    invalidReviewReceipt();
  }
  const revisionCeiling = BigInt(MAX_CANONICAL_UNSIGNED_INTEGER_STRING);
  const seen = new Set<string>();
  for (const [index, guard] of guards.entries()) {
    const row: unknown = rows[index];
    if (
      !closedReceiptObject(row, ["accountId", "revision"]) ||
      !uuidSchema.safeParse(row.accountId).success ||
      !revisionSchema.safeParse(row.revision).success ||
      row.accountId !== guard.accountId ||
      payload.accountEffects[index]?.accountId !== guard.accountId ||
      seen.has(guard.accountId)
    ) {
      invalidReviewReceipt();
    }
    seen.add(guard.accountId);
    const expected = BigInt(guard.expectedRevision) + 1n;
    if (
      expected > revisionCeiling ||
      (createdIds.has(guard.accountId) && guard.expectedRevision !== "0") ||
      row.revision !== expected.toString()
    ) {
      invalidReviewReceipt();
    }
  }
  return true;
}

/** Verify normalized public columns and immutable review/legacy envelopes. */
export async function checkedCloudActionRoot(
  input: unknown,
  expectedOwnerId: string
): Promise<CheckedCloudActionRoot> {
  const record = validatePublicProjection(pullRecord(input));
  if (stringField(record, "user_id") !== expectedOwnerId)
    invalid("foreign_owner");
  const id = stringField(record, "id");
  const actionId = stringField(record, "action_id");
  const hash = stringField(record, "payload_hash");
  if (!SHA256.test(hash)) invalid("invalid_payload_hash");
  const { state, outcomeJson, serverOutcome } = checkedState(record);
  const envelope = checkedEnvelope(record, expectedOwnerId);
  const actualHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    envelope.payloadJson
  );
  if (actualHash !== hash) invalid("payload_hash_mismatch");
  if (record.deleted !== false && record.deleted !== true)
    invalid("invalid_deleted");
  const verifiedReviewAcceptance = verifyReviewAcceptedReceipt(
    envelope.envelope,
    state,
    serverOutcome,
    outcomeJson
  );
  return {
    id,
    actionId,
    ownerId: expectedOwnerId,
    payloadHash: hash,
    payloadJson: envelope.payloadJson,
    state,
    isDeleted: record.deleted === true,
    verifiedReviewAcceptance,
    canonical: {
      ...record,
      payload_json: envelope.payloadJson,
      account_guards_json: envelope.guards,
      outcome_json: outcomeJson,
    },
  };
}
