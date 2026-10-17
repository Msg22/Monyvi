/**
 * #395 T049 private physical evidence capture and validation.
 * Extracted unchanged proof boundaries from the foundation repository.
 * No new runtime carrier, public DTO, storage field, or financial writer.
 */
import type { Model } from "@nozbe/watermelondb";
import type { FinancialActionEnvelopeV1 } from "../../../packages/logic/src/financial-actions";
import { reviewBatchSaveWireSchema } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { parseAccountReviewLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  serializeAccountCreateDefaultLocalRecoverySnapshotJson,
} from "../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import { validateAccountCreateDefaultPayload } from "../../../packages/logic/src/financial-actions/account-create-default";
import { cloneWatermelonRaw } from "./watermelon-raw-integrity";
import type { CachedModelSnapshot } from "./watermelon-cache-snapshot";
import {
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES,
  type FinancialActionLinkedExistingOperation,
  type FinancialActionLinkedOperationPlan,
  type FinancialActionLinkedOperationPreparedOwnershipInput,
  type FinancialActionLinkedOperationPreimage,
  type FinancialActionLinkedOperationPostimage,
} from "./financial-action-foundation-contracts";

export interface ExistingOperationExpectation {
  readonly model: Model;
  readonly table: string;
  readonly id: string;
  readonly kind: FinancialActionLinkedExistingOperation["kind"];
  readonly expectedPreparedState: "update" | "markAsDeleted";
}

export interface PreparedOperationExpectation {
  readonly model: Model;
  readonly table: string;
  readonly id: string;
  readonly kind: FinancialActionLinkedOperationPostimage["kind"];
  readonly expectedPreparedState: "create" | "update" | "markAsDeleted";
  readonly raw: Readonly<Model["_raw"]>;
  readonly isEditing: boolean;
}

/** Bind private bytes to the original validated public action, never a new DTO. */
export async function captureLocalRecoverySnapshotJson(
  envelope: FinancialActionEnvelopeV1,
  userId: string,
  plan: FinancialActionLinkedOperationPlan,
  evidence: FinancialActionLinkedOperationPreparedOwnershipInput
): Promise<string | null> {
  const builder = plan.buildLocalRecoverySnapshot;
  if (builder === undefined) return null;
  if (typeof builder !== "function") {
    throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
  }

  if (
    envelope.kind === "review_batch_save" &&
    envelope.payloadVersion === "review.batch-save/v1"
  ) {
    const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
    const candidate = await builder(evidence);
    try {
      const validated = parseAccountReviewLocalSaveSnapshot({
        json: JSON.stringify(candidate),
        expectedRoot: {
          actionId: envelope.actionId,
          ownerId: userId,
          sessionId: payload.sessionId,
          source: payload.source,
        },
      });
      return JSON.stringify(validated);
    } catch {
      // A failed private validation must not surface raw SMS in error messages.
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  if (
    envelope.kind === "create_with_default" &&
    envelope.payloadVersion === "account.create-default/v1" &&
    envelope.domain === "accounts"
  ) {
    if (
      !evidence.payloadHash ||
      envelope.userId !== userId ||
      evidence.userId !== userId
    ) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    const publicPayload = validateAccountCreateDefaultPayload(envelope.payload);
    const candidate = await builder(evidence);
    try {
      const canonicalJson =
        serializeAccountCreateDefaultLocalRecoverySnapshotJson(candidate);
      const snapshot = parseAccountCreateDefaultLocalRecoverySnapshotJson({
        json: canonicalJson,
        expectedRoot: {
          actionId: envelope.actionId,
          ownerId: userId,
          domainReferenceId: envelope.domainReferenceId,
          payloadHash: evidence.payloadHash,
          expectedDefaultSnapshot: publicPayload.expectedDefaultSnapshot,
        },
      });
      // Independent final physical/private/public membership admission.
      // This is NOT a replacement for the writer's prepared-hash checks.
      const account = publicPayload.domainMutation.records.find(
        (record) => record.entity === "account"
      );
      const children = publicPayload.domainMutation.records.filter(
        (record) =>
          record.entity === "bank_details" ||
          record.entity === "account_sms_sender"
      );
      const privateChildKeys = snapshot.createdChildren
        .map((child) => child.entity + ":" + child.id)
        .sort();
      const publicChildKeys = children
        .map((child) => child.entity + ":" + child.after.id)
        .sort();
      const clear = publicPayload.domainMutation.records.find(
        (record) => record.entity === "account_default"
      );
      const opening = publicPayload.accountEffects[0];
      if (
        !account ||
        account.entity !== "account" ||
        account.after.id !== snapshot.createdAccount.accountId ||
        account.after.currency !== snapshot.createdAccount.postimage.currency ||
        account.after.openingBalanceMinorUnits !==
          snapshot.createdAccount.postimage.balanceMinorUnits ||
        account.after.isDefault !==
          snapshot.createdAccount.postimage.isDefault ||
        privateChildKeys.length !== publicChildKeys.length ||
        privateChildKeys.some((key, index) => key !== publicChildKeys[index]) ||
        (clear !== undefined) !== (snapshot.priorDefault !== null) ||
        (clear?.after.id ?? null) !==
          (snapshot.priorDefault?.accountId ?? null) ||
        (opening === undefined) !== (snapshot.openingEffect === null) ||
        (opening !== undefined &&
          (opening.effectId !== snapshot.openingEffect?.effectId ||
            opening.accountId !== snapshot.openingEffect?.accountId ||
            opening.currency !== snapshot.openingEffect?.postimage.currency ||
            opening.amountMinorUnits !==
              snapshot.openingEffect?.postimage.amountMinorUnits))
      ) {
        throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
      }
      return canonicalJson;
    } catch {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
  }

  throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
}

export function captureExistingOperationExpectations(
  operations: readonly FinancialActionLinkedExistingOperation[]
): readonly ExistingOperationExpectation[] {
  return Object.freeze(
    operations.map((operation) =>
      Object.freeze({
        model: operation.model,
        table: operation.model.table,
        id: operation.model.id,
        kind: operation.kind,
        expectedPreparedState: operation.kind,
      })
    )
  );
}

export function capturePreparedExpectations(
  preparedCreates: readonly Model[],
  preparedExistingOperations: readonly Model[],
  existingExpectations: readonly ExistingOperationExpectation[]
): readonly PreparedOperationExpectation[] {
  const createExpectations = preparedCreates.map((model) =>
    Object.freeze({
      model,
      table: model.table,
      id: model.id,
      kind: "create" as const,
      expectedPreparedState: "create" as const,
      raw: Object.freeze(cloneWatermelonRaw(model._raw)),
      isEditing: false,
    })
  );
  const updateExpectations = preparedExistingOperations.map((model, index) => {
    const existing = existingExpectations[index];
    if (!existing || model !== existing.model) {
      throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
    }
    return Object.freeze({
      model,
      table: existing.table,
      id: existing.id,
      kind: existing.kind,
      expectedPreparedState: existing.expectedPreparedState,
      raw: Object.freeze(cloneWatermelonRaw(model._raw)),
      isEditing: false,
    });
  });
  return Object.freeze([...createExpectations, ...updateExpectations]);
}

function immutableRaw(raw: Readonly<Model["_raw"]>): Readonly<Model["_raw"]> {
  return Object.freeze(cloneWatermelonRaw(raw));
}

export function createImmutablePreimages(
  snapshots: readonly CachedModelSnapshot[],
  expectations: readonly ExistingOperationExpectation[]
): readonly FinancialActionLinkedOperationPreimage[] {
  return Object.freeze(
    snapshots.map((snapshot, index) => {
      const expectation = expectations[index];
      if (!expectation) {
        throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
      }
      return Object.freeze({
        id: expectation.id,
        kind: expectation.kind,
        table: expectation.table,
        raw: immutableRaw(snapshot.raw),
      });
    })
  );
}

export function createImmutablePostimages(
  expectations: readonly PreparedOperationExpectation[]
): readonly FinancialActionLinkedOperationPostimage[] {
  return Object.freeze(
    expectations.map((expectation) =>
      Object.freeze({
        id: expectation.id,
        kind: expectation.kind,
        table: expectation.table,
        raw: immutableRaw(expectation.raw),
      })
    )
  );
}
