/**
 * #395 Add-only canonicalDefaultSnapshot outcome parser for stale/rejected receipts.
 *
 * Closed 2-key active-default authority on verified rejection/stale outcomes.
 * Accepted/idempotent Add, Review and deployed tuples MUST NOT contain this key.
 */
import {
  accountDefaultSnapshotSchema,
  type AccountDefaultSnapshot,
} from "./account-create-default";
import { uuidSchema } from "./review-batch-save-shapes";
import { parseFinancialActionEvidenceJson } from "./action-contracts";

export interface AccountCreateDefaultRecoveryOutcome {
  readonly actionId: string;
  readonly status: "stale" | "rejected";
  readonly code: string;
  readonly canonicalDefaultSnapshot: AccountDefaultSnapshot;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCanonicalDefaultSnapshot(
  value: unknown
): AccountDefaultSnapshot {
  return accountDefaultSnapshotSchema.parse(value);
}

export interface ParseAccountCreateDefaultRecoveryOutcomeInput {
  readonly outcomeJson: string;
  readonly serverOutcome?: string;
  readonly expectedActionId?: string;
}

/**
 * A deliberately narrow four-field projection, NOT a receipt authenticator.
 * Dedicated recovery must first validate the entire strict common financial
 * action outcome, canonical absence, root owner/hash and status evidence.
 */
export function parseAccountCreateDefaultRecoveryOutcome(
  input: string | ParseAccountCreateDefaultRecoveryOutcomeInput
): AccountCreateDefaultRecoveryOutcome {
  const jsonText = typeof input === "string" ? input : input.outcomeJson;
  const serverOutcome =
    typeof input === "string" ? undefined : input.serverOutcome;
  const expectedActionId =
    typeof input === "string" ? undefined : input.expectedActionId;

  const record: unknown = parseFinancialActionEvidenceJson(jsonText);
  if (!isRecord(record)) {
    throw new Error("account_create_default_outcome_invalid_object");
  }

  const status = record.status;
  if (status === "accepted" || status === "idempotent") {
    if ("canonicalDefaultSnapshot" in record) {
      throw new Error(
        "accepted_outcome_must_not_contain_canonical_default_snapshot"
      );
    }
    throw new Error("account_create_default_outcome_not_rejection_or_stale");
  }

  if (status !== "stale" && status !== "rejected") {
    throw new Error("account_create_default_outcome_invalid_status");
  }

  if (serverOutcome !== undefined && serverOutcome !== status) {
    throw new Error("account_create_default_outcome_status_mismatch");
  }

  const actionId = uuidSchema.parse(record.actionId);
  if (expectedActionId !== undefined && actionId !== expectedActionId) {
    throw new Error("account_create_default_outcome_action_id_mismatch");
  }

  if (typeof record.code !== "string" || record.code.length === 0) {
    throw new Error("account_create_default_outcome_invalid_code");
  }

  if (
    record.canonicalDefaultSnapshot === undefined ||
    record.canonicalDefaultSnapshot === null
  ) {
    throw new Error("missing_canonical_default_snapshot");
  }

  const canonicalDefaultSnapshot = parseCanonicalDefaultSnapshot(
    record.canonicalDefaultSnapshot
  );

  return Object.freeze({
    actionId,
    status,
    code: record.code,
    canonicalDefaultSnapshot,
  });
}
