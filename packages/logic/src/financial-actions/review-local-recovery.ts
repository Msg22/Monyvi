/**
 * #395 device-local review Save evidence. Never serialize this value to
 * financial-action payloads, Supabase, outbox, analytics or diagnostics.
 * Physical postimages, account effects and queue lifecycle must be verified
 * by the authenticated recovery writer before any compensation.
 */
import { z } from "zod";
import {
  localSmsBookkeepingSchema,
  reviewMutationSchema,
  revisionSchema,
  timestampSchema,
  uuidSchema,
  type ReviewBatchSavePayload,
} from "./review-batch-save-shapes";

const POSTIMAGE_HASH = /^[0-9a-f]{64}$/;
const postimageHashSchema = z.string().regex(POSTIMAGE_HASH);
const fingerprintSchema = z.string().min(1).refine((value) => value.trim().length > 0);
const operationSchema = localSmsBookkeepingSchema.shape.operation;

const availableSmsDraftSchema = z.strictObject({
  retentionState: z.literal("available"),
  id: uuidSchema,
  queueId: uuidSchema,
  smsFingerprint: fingerprintSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  parsedAt: timestampSchema,
  payloadVersion: revisionSchema,
  position: revisionSchema,
  selectionOverride: z.boolean().nullable(),
  payloadJson: z.string().min(1),
  expectedPostimageHash: postimageHashSchema,
  operation: operationSchema,
});

const redactedSmsDraftSchema = z.strictObject({
  retentionState: z.enum(["expired", "superseded"]),
  id: uuidSchema,
  queueId: uuidSchema,
  smsFingerprint: fingerprintSchema,
  parsedAt: timestampSchema,
  operation: operationSchema,
  expectedPostimageHash: postimageHashSchema,
});

const smsDraftSchema = z.discriminatedUnion("retentionState", [
  availableSmsDraftSchema,
  redactedSmsDraftSchema,
]);

const createdEntityRefSchema = z.strictObject({
  entity: z.enum(
    reviewMutationSchema.options.map((mutation) => mutation.shape.entity.value)
  ),
  id: uuidSchema,
  expectedPostimageHash: postimageHashSchema,
});

const defaultPreimageSchema = z.strictObject({
  accountId: uuidSchema,
  isDefault: z.boolean(),
  expectedPostimageHash: postimageHashSchema,
});

const queuePreimageSchema = z.strictObject({
  id: uuidSchema,
  userId: uuidSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  expectedPostimageHash: postimageHashSchema,
  disposition: z.enum(["present", "pruned_empty", "expired", "superseded"]),
});

function areDistinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function areSortedAndDistinct(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1]! < value
  );
}

/**
 * A private preimage format, deliberately distinct from all public wire DTOs.
 * Retention-state validation closes every nested object, including redactions.
 * Its structure cannot prove physical persistence, ownership or restoration.
 */
export const accountReviewLocalSaveSnapshotSchema = z.strictObject({
  version: z.literal("account-review-local-save/v1"),
  actionId: uuidSchema,
  ownerId: uuidSchema,
  sessionId: uuidSchema,
  smsDrafts: z.array(smsDraftSchema),
  createdEntityRefs: z.array(createdEntityRefSchema),
  defaultPreimages: z.array(defaultPreimageSchema),
  defaultDependencyActionIds: z.array(uuidSchema),
  queuePreimage: queuePreimageSchema.nullable(),
}).superRefine((snapshot, context) => {
  if (!areDistinct(snapshot.smsDrafts.map((draft) => draft.id)))
    context.addIssue({ code: "custom", path: ["smsDrafts"], message: "duplicate_draft_id" });
  if (!areDistinct(snapshot.smsDrafts.map((draft) => draft.smsFingerprint)))
    context.addIssue({ code: "custom", path: ["smsDrafts"], message: "duplicate_fingerprint" });
  if (!areDistinct(snapshot.createdEntityRefs.map((ref) => ref.id)))
    context.addIssue({ code: "custom", path: ["createdEntityRefs"], message: "duplicate_created_id" });
  if (!areDistinct(snapshot.defaultPreimages.map((ref) => ref.accountId)))
    context.addIssue({ code: "custom", path: ["defaultPreimages"], message: "duplicate_default_account" });
  if (!areSortedAndDistinct(snapshot.defaultDependencyActionIds) ||
      snapshot.defaultDependencyActionIds.includes(snapshot.actionId))
    context.addIssue({ code: "custom", path: ["defaultDependencyActionIds"], message: "invalid_dependencies" });
  if (snapshot.queuePreimage === null) {
    if (snapshot.smsDrafts.length > 0)
      context.addIssue({ code: "custom", path: ["smsDrafts"], message: "missing_queue" });
  } else {
    if (snapshot.queuePreimage.userId !== snapshot.ownerId)
      context.addIssue({ code: "custom", path: ["queuePreimage"], message: "foreign_queue" });
    if (snapshot.smsDrafts.some((draft) => draft.queueId !== snapshot.queuePreimage?.id))
      context.addIssue({ code: "custom", path: ["smsDrafts"], message: "draft_queue_mismatch" });
  }
});

export type AccountReviewLocalSaveSnapshot =
  z.infer<typeof accountReviewLocalSaveSnapshotSchema>;

interface ExpectedOwnedReviewRoot {
  readonly actionId: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly source: ReviewBatchSavePayload["source"];
}

export function parseAccountReviewLocalSaveSnapshot(input: {
  readonly json: string;
  readonly expectedRoot: ExpectedOwnedReviewRoot;
}): AccountReviewLocalSaveSnapshot {
  const raw: unknown = JSON.parse(input.json);
  const snapshot = accountReviewLocalSaveSnapshotSchema.parse(raw);
  const root = input.expectedRoot;
  if (snapshot.actionId !== root.actionId ||
      snapshot.ownerId !== root.ownerId ||
      snapshot.sessionId !== root.sessionId)
    throw new Error("account_review_local_recovery_root_mismatch");
  if (root.source === "VOICE"
    ? snapshot.queuePreimage !== null || snapshot.smsDrafts.length !== 0
    : snapshot.queuePreimage === null)
    throw new Error("account_review_local_recovery_source_mismatch");
  return snapshot;
}
