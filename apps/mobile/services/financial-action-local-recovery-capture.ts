/**
 * #395 T049 private physical evidence capture and validation.
 * Extracted unchanged proof boundaries from the foundation repository.
 * No new runtime carrier, public DTO, storage field, or financial writer.
 */
import type { Model } from "@nozbe/watermelondb";
import type { FinancialActionEnvelopeV1 } from
  "../../../packages/logic/src/financial-actions";
import {
  reviewBatchSaveWireSchema,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import {
  parseAccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import { cloneWatermelonRaw } from "./watermelon-raw-integrity";
import type {
  CachedModelSnapshot,
} from "./watermelon-cache-snapshot";
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
  if (typeof builder !== "function" ||
      envelope.kind !== "review_batch_save" ||
      envelope.payloadVersion !== "review.batch-save/v1")
    throw new Error(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
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
  const updateExpectations = preparedExistingOperations.map(
    (model, index) => {
      const existing = existingExpectations[index];
      if (!existing || model !== existing.model) {
        throw new Error(
          FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
        );
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
    }
  );
  return Object.freeze([...createExpectations, ...updateExpectations]);
}


function immutableRaw(raw: Readonly<Model["_raw"]>): Readonly<Model["_raw"]> {
  return Object.freeze(cloneWatermelonRaw(raw));
}

export function createImmutablePreimages(
  snapshots: ReadonlyArray<CachedModelSnapshot>,
  expectations: readonly ExistingOperationExpectation[]
): readonly FinancialActionLinkedOperationPreimage[] {
  return Object.freeze(
    snapshots.map((snapshot, index) => {
      const expectation = expectations[index];
      if (!expectation) {
        throw new Error(
          FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT
        );
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

