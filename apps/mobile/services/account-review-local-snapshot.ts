/**
 * #395 T048. Private capture only after the foundation's physical/owner checks.
 * Only nine device-local keys are persisted on the owned action root.
 */
import type { Account } from "@monyvi/db";
import type { Database } from "@nozbe/watermelondb";
import type { Sha256Provider } from "@monyvi/logic";
import {
  accountReviewLocalSaveSnapshotSchema,
  parseAccountReviewLocalSaveSnapshot,
  type AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import type {
  ReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type {
  FinancialActionLinkedOperationPreparedOwnershipInput,
} from "./financial-action-foundation-contracts";
import type { FrozenReviewSave } from "./account-review-save-preparation";
import type { SmsSaveScope } from "./account-review-save-sms";
import type { CurrentUserDataScope } from "./user-data-access";
import {
  assertPreparedReviewEffects,
  captureCreatedReviewRefs,
} from "./account-review-local-snapshot-postimages";
import { captureReviewSmsEvidence } from "./account-review-local-snapshot-sms";
import {
  captureReviewDefaultDependencies,
  captureReviewDefaultPreimages,
} from "./account-review-local-snapshot-defaults";

interface SnapshotInput {
  readonly frozen: FrozenReviewSave;
  readonly payload: ReviewBatchSavePayload;
  readonly sms: SmsSaveScope;
  readonly ownedAccounts: readonly Account[];
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly evidence: FinancialActionLinkedOperationPreparedOwnershipInput;
  readonly hashProvider: Sha256Provider;
}
type Parts = Pick<AccountReviewLocalSaveSnapshot,
  "createdEntityRefs" | "defaultPreimages" |
  "defaultDependencyActionIds" | "smsDrafts" | "queuePreimage">;

async function capturePrivateParts(input: SnapshotInput): Promise<Parts> {
  const { intent } = input.frozen;
  const [createdEntityRefs, sms, defaultPreimages, defaultDependencyActionIds] =
    await Promise.all([
      captureCreatedReviewRefs({
        payload: input.payload,
        prepared: input.evidence.preparedPostimages,
        hashProvider: input.hashProvider,
      }),
      captureReviewSmsEvidence({
        sms: input.sms, source: intent.source, sessionId: intent.sessionId,
        ownerId: intent.ownerId, payload: input.payload,
        evidence: input.evidence, hashProvider: input.hashProvider,
      }),
      captureReviewDefaultPreimages({
        ownerId: intent.ownerId, ownedAccounts: input.ownedAccounts,
        payload: input.payload, evidence: input.evidence,
        hashProvider: input.hashProvider,
      }),
      captureReviewDefaultDependencies({
        database: input.database, scope: input.scope,
        ownerId: intent.ownerId, actionId: intent.actionId,
        payload: input.payload,
      }),
    ]);
  return { createdEntityRefs, ...sms, defaultPreimages,
    defaultDependencyActionIds };
}

export async function buildAccountReviewLocalSnapshot(
  input: SnapshotInput
): Promise<AccountReviewLocalSaveSnapshot> {
  const { intent } = input.frozen;
  if (input.evidence.userId !== intent.ownerId ||
      input.scope.userId !== intent.ownerId ||
      input.payload.source !== intent.source ||
      input.payload.sessionId !== intent.sessionId)
    throw new Error("account_review_local_snapshot_scope_mismatch");
  assertPreparedReviewEffects(
    input.payload, input.evidence.preparedPostimages,
    intent.actionId, intent.ownerId
  );
  const parts = await capturePrivateParts(input);
  const snapshot = accountReviewLocalSaveSnapshotSchema.parse({
    version: "account-review-local-save/v1",
    actionId: intent.actionId,
    ownerId: intent.ownerId,
    sessionId: intent.sessionId,
    ...parts,
  });
  return parseAccountReviewLocalSaveSnapshot({
    json: JSON.stringify(snapshot),
    expectedRoot: {
      actionId: intent.actionId, ownerId: intent.ownerId,
      sessionId: intent.sessionId, source: intent.source,
    },
  });
}
