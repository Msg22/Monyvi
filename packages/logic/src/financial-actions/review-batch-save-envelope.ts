/**
 * #395 T046 one explicitly versioned pure envelope parity check.
 * Input is already validated through the caller's explicit opt-in registry.
 * Reparse the new payload to obtain canonical inferred types, never a cast.
 */
import type { FinancialActionAccountGuard } from "./action-contracts";
import type { RegisteredActionPayload } from "./action-registry";
import { validateReviewBatchSavePayload } from "./review-batch-save";
import {
  affectedAccountIds,
  financialRecords,
  newAccountRecords,
} from "./review-batch-save-integrity";

const REVISION_LIMIT = 9223372036854775807n;

export function assertReviewBatchSaveEnvelope(
  rawPayload: RegisteredActionPayload,
  guards: readonly FinancialActionAccountGuard[],
  domainReferenceId: string
): void {
  const payload = validateReviewBatchSavePayload(rawPayload);
  const financialIds = financialRecords(payload)
    .map((record) => record.after.id)
    .sort();
  if (financialIds[0] !== domainReferenceId)
    throw new Error("financial_action_invalid_envelope");

  const affected = affectedAccountIds(payload);
  if (
    guards.length !== payload.accountEffects.length ||
    guards.length !== affected.size
  )
    throw new Error("financial_action_invalid_envelope");

  const newIds = new Set(
    newAccountRecords(payload).map((record) => record.after.id)
  );
  const absentAccountIds = new Set(
    payload.createGuards
      .filter((guard) => guard.entity === "account")
      .map((guard) => guard.id)
  );
  for (let index = 0; index < guards.length; index++) {
    const guard = guards[index];
    const effect = payload.accountEffects[index];
    if (
      !guard ||
      !effect ||
      guard.accountId !== effect.accountId ||
      !affected.has(guard.accountId) ||
      BigInt(guard.expectedRevision) === REVISION_LIMIT
    )
      throw new Error("financial_action_invalid_envelope");
    if (
      newIds.has(guard.accountId) &&
      (guard.expectedRevision !== "0" || !absentAccountIds.has(guard.accountId))
    )
      throw new Error("financial_action_invalid_envelope");
  }
}
