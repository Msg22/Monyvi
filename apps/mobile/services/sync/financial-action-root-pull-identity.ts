/** Canonical owner/action identity at the dedicated financial root pull seam. */
import * as Crypto from "expo-crypto";
import {
  FINANCIAL_ACTION_STATES,
  SERVER_OUTCOMES,
  assertFinancialActionStateEvidence,
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
  type FinancialActionServerOutcome,
  type FinancialActionState,
} from "../../../../packages/logic/src/financial-actions/action-contracts";
import { schema } from "../../../../packages/db/src/schema";
import { createAccountReviewFinancialRegistry } from
  "../account-review-financial-command-service";

export interface CheckedCloudActionRoot {
  readonly actionId: string;
  readonly id: string;
  readonly ownerId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly canonical: Readonly<Record<string, unknown>>;
  readonly isDeleted: boolean;
  readonly state: FinancialActionState;
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
function stringField(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0)
    return invalid("invalid_" + key);
  return value;
}
function nullableString(row: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return invalid("invalid_" + key);
  return value;
}
function requireActionState(value: unknown): FinancialActionState {
  const found = FINANCIAL_ACTION_STATES.find((state) => state === value);
  return found ?? invalid("invalid_state");
}
function requireServerOutcome(value: unknown): FinancialActionServerOutcome | null {
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
  try { decoded = JSON.parse(raw); }
  catch { return invalid("invalid_guards_json"); }
  if (!Array.isArray(decoded) || decoded.length !== guards.length)
    return invalid("invalid_guards_membership");
  for (const [i, guard] of guards.entries()) {
    const entry = pullRecord(decoded[i]);
    if (Object.keys(entry).length !== 2 ||
        entry.accountId !== guard.accountId ||
        entry.expectedRevision !== guard.expectedRevision)
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
    } else if (column.type !== typeof value ||
      (column.type === "number" && !Number.isFinite(value)))
      invalid("invalid_" + column.name);
  }
  return actual;
}
function checkedEnvelope(
  row: Readonly<Record<string, unknown>>,
  expectedOwnerId: string
): { readonly payloadJson: string; readonly guards: string } {
  const registry = createAccountReviewFinancialRegistry();
  const envelope = parseFinancialActionEnvelopeJson(
    stringField(row, "payload_json"), registry
  );
  if (envelope.userId !== expectedOwnerId ||
      envelope.actionId !== row.action_id ||
      envelope.domain !== row.domain ||
      envelope.kind !== row.kind ||
      envelope.domainReferenceId !== row.domain_reference_id)
    return invalid("immutable_identity_changed");
  return {
    payloadJson: serializeFinancialActionEnvelope(envelope, registry),
    guards: canonicalGuardText(
      stringField(row, "account_guards_json"), envelope.accountGuards
    ),
  };
}
function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype)
    return invalid("unsupported_outcome_value");
  return "{" + Object.entries(value).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  ).map(([key, item]) =>
    JSON.stringify(key) + ":" + canonicalJson(item)
  ).join(",") + "}";
}
function canonicalOutcomeText(row: Readonly<Record<string, unknown>>): string | null {
  const raw = nullableString(row, "outcome_json");
  if (raw === null) return null;
  try { return canonicalJson(JSON.parse(raw)); }
  catch { return invalid("invalid_outcome_json"); }
}
function checkedState(
  row: Readonly<Record<string, unknown>>
): { readonly state: FinancialActionState; readonly outcomeJson: string | null } {
  const state = requireActionState(row.state);
  const outcomeJson = canonicalOutcomeText(row);
  try {
    assertFinancialActionStateEvidence(state, {
      serverOutcome: requireServerOutcome(row.server_outcome),
      outcomeJson,
      rejectionCode: nullableString(row, "rejection_code"),
    });
  } catch {
    return invalid("invalid_state_evidence");
  }
  return { state, outcomeJson };
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
  const { state, outcomeJson } = checkedState(record);
  const envelope = checkedEnvelope(record, expectedOwnerId);
  const actualHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256, envelope.payloadJson
  );
  if (actualHash !== hash) invalid("payload_hash_mismatch");
  if (record.deleted !== false && record.deleted !== true)
    invalid("invalid_deleted");
  return {
    id, actionId, ownerId: expectedOwnerId,
    payloadHash: hash,
    payloadJson: envelope.payloadJson,
    state, isDeleted: record.deleted === true,
    canonical: {
      ...record,
      payload_json: envelope.payloadJson,
      account_guards_json: envelope.guards,
      outcome_json: outcomeJson,
    },
  };
}
