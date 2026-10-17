/** #395 genuine SQLite mixed-SMS original/public/private Save witness. */
import { createHash } from "node:crypto";
import type { FinancialActionGroup, SmsReviewDraftItem } from "@monyvi/db";
import { serializeCanonicalJsonValue } from "@monyvi/logic";
import { parseFinancialActionEnvelopeJson } from "../../../../packages/logic/src/financial-actions/action-contracts";
import { validateReviewBatchSavePayload } from "../../../../packages/logic/src/financial-actions/review-batch-save";
import { parseAccountReviewLocalSaveSnapshot } from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import { createAccountReviewFinancialRegistry } from "../../services/account-review-financial-command-service";
import {
  FINGERPRINT_A,
  type SaveFixture,
} from "./account-review-save-test-fixtures";

interface OriginalSmsWitness {
  readonly id: string;
  readonly fingerprint: string;
  readonly payloadJson: string;
  readonly snapshotHash: string;
}

/** Capture real persisted bytes BEFORE the selected drafts are prepared. */
export function captureOriginalMixedSmsWitnesses(
  drafts: readonly SmsReviewDraftItem[]
): readonly OriginalSmsWitness[] {
  return drafts.map((draft) => ({
    id: draft.id,
    fingerprint: draft.smsFingerprint,
    payloadJson: draft.payloadJson,
    snapshotHash: createHash("sha256")
      .update(
        serializeCanonicalJsonValue({
          id: draft.id,
          queueId: draft.queueId,
          smsFingerprint: draft.smsFingerprint,
          payloadVersion: String(draft.payloadVersion),
          position: String(draft.position),
          selectionOverride: draft.selectionOverride,
          payloadJson: draft.payloadJson,
          parsedAt: draft.parsedAt.toISOString(),
        }),
        "utf8"
      )
      .digest("hex"),
  }));
}

/** Every selected original disappears; only unsaved selections post finance. */
export function assertMixedSmsOriginalCleanup(
  root: FinancialActionGroup,
  frozen: SaveFixture,
  originals: readonly OriginalSmsWitness[]
): void {
  if (typeof root.localRecoverySnapshotJson !== "string")
    throw new Error("mixed_sms_private_root_missing");
  const envelope = parseFinancialActionEnvelopeJson(
    root.payloadJson,
    createAccountReviewFinancialRegistry()
  );
  const payload = validateReviewBatchSavePayload(envelope.payload);
  const privateSnapshot = parseAccountReviewLocalSaveSnapshot({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: frozen.intent.actionId,
      ownerId: frozen.intent.ownerId,
      sessionId: frozen.intent.sessionId,
      source: "SMS",
    },
  });
  const physicalById = new Map(originals.map((entry) => [entry.id, entry]));
  const physicalIds = originals.map((entry) => entry.id).sort();
  expect(originals).toHaveLength(2);
  expect(payload.selectedSourceRefs).toHaveLength(1);
  expect(payload.accountEffects).toHaveLength(1);
  expect(
    payload.domainMutation.records.filter(
      (record) =>
        record.entity === "transaction" || record.entity === "transfer"
    )
  ).toHaveLength(1);
  expect(root.payloadJson).not.toContain(FINGERPRINT_A);
  const unsaved = frozen.session.rows.find(
    (row) => row.selected && row.sourceFingerprint !== FINGERPRINT_A
  );
  expect(payload.selectedSourceRefs[0]?.sourceFingerprint).toBe(
    unsaved?.sourceFingerprint
  );

  const deleted = payload.localSmsBookkeeping.filter(
    (entry) => entry.operation === "delete_saved"
  );
  expect(deleted.map((entry) => entry.draftId).sort()).toEqual(physicalIds);
  expect(payload.localSmsBookkeeping).toHaveLength(2);
  expect(privateSnapshot.smsDrafts.map((entry) => entry.id).sort()).toEqual(
    physicalIds
  );
  for (const draft of privateSnapshot.smsDrafts) {
    const original = physicalById.get(draft.id);
    if (!original) throw new Error("mixed_sms_original_missing");
    expect(draft).toMatchObject({
      retentionState: "available",
      payloadJson: original.payloadJson,
      operation: "delete_saved",
    });
    const frozenRow = frozen.session.rows.find(
      (row) => row.sourceFingerprint === original.fingerprint
    );
    expect(
      payload.localSmsBookkeeping.find((entry) => entry.draftId === original.id)
    ).toEqual({
      draftId: original.id,
      queueId: frozen.intent.sessionId,
      snapshotHash: original.snapshotHash,
      expectedReviewRevision: frozenRow?.revision,
      operation: "delete_saved",
    });
  }
  const alreadySaved = frozen.session.rows.find(
    (row) => row.sourceFingerprint === FINGERPRINT_A
  );
  const unusedId = frozen.intent.plannedEntityIds.find(
    (alias) =>
      alias.entity === "transaction" && alias.localRef === alreadySaved?.rowId
  )?.id;
  if (!unusedId) throw new Error("mixed_sms_unused_identity_missing");
  expect(payload.domainRecordRefs).not.toContain(unusedId);
  expect(privateSnapshot.queuePreimage?.disposition).toBe("pruned_empty");
}
