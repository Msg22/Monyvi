/**
 * #395 T043: strict private, device-only local recovery evidence — TESTS FIRST.
 * The reviewed SUT ../review-local-recovery does not exist yet. An immediate
 * module-creation Red executes ZERO assertions; the cases below must become
 * real behavioral Red/Green once the private schema/parser is implemented.
 *
 * The exported type MUST be inferred from the one Zod authority, not a
 * copied union, cloud action payload, or second mutable DTO.
 */
import {
  accountReviewLocalSaveSnapshotSchema,
  parseAccountReviewLocalSaveSnapshot,
  type AccountReviewLocalSaveSnapshot,
} from "../review-local-recovery";
import { reviewMutationSchema, reviewBatchSaveWireSchema } from
  "../review-batch-save-shapes";
import {
  REVIEW_ACTION_ID,
  REVIEW_SESSION_ID,
  REVIEW_USER_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_INCOME_RECORD_ID,
  REVIEW_EXPENSE_RECORD_ID,
  reviewBatchSavePayload,
} from "./review-batch-save-fixtures";

const UUID_QUEUE = REVIEW_SESSION_ID;
const UUID_OTHER_QUEUE = "55555555-5555-4555-8555-555555555555";
const UUID_DRAFT_A = "66666666-6666-4666-8666-666666666661";
const UUID_DRAFT_B = "66666666-6666-4666-8666-666666666662";
const UUID_SENDER = "77777777-7777-4777-8777-777777777777";
const UUID_PREDECESSOR_A = "88888888-8888-4888-8888-888888888881";
const UUID_PREDECESSOR_B = "88888888-8888-4888-8888-888888888882";
const QUEUE_CREATED_AT = "2026-08-31T09:00:00.000Z";
const CREATED_AT = "2026-10-14T09:00:00.000Z";
const EXPIRED_AT = "2026-09-01T08:00:00.000Z";
const UPDATED_AT = "2026-10-15T09:00:00.000Z";
const PARSED_AT = "2026-10-15T08:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const PRIVATE_VERSION = "account-review-local-save/v1";

interface ExpectedOwnedRoot {
  readonly actionId: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly source: "VOICE" | "SMS";
}

/**
 * Exact private reader contract, not a public wire/API schema:
 * parseAccountReviewLocalSaveSnapshot({
 *   json: string, expectedRoot: {actionId,ownerId,sessionId,source}
 * }): AccountReviewLocalSaveSnapshot.
 *
 * The caller derives source/session from the VALIDATED public action envelope
 * and independently proves financial/entity membership. Never invent a
 * persisted session field in FinancialActionGroup.
 */
function expectedRoot(source: "VOICE" | "SMS" = "SMS"): ExpectedOwnedRoot {
  return {
    actionId: REVIEW_ACTION_ID,
    ownerId: REVIEW_USER_ID,
    sessionId: REVIEW_SESSION_ID,
    source,
  };
}

function availableDraft(): AccountReviewLocalSaveSnapshot["smsDrafts"][number] {
  return {
    retentionState: "available",
    id: UUID_DRAFT_A,
    queueId: UUID_QUEUE,
    smsFingerprint: "owned-sms-fingerprint-a",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    parsedAt: PARSED_AT,
    payloadVersion: "2",
    position: "0",
    selectionOverride: true,
    payloadJson: '{"transaction":"private-raw-review-a"}',
    expectedPostimageHash: HASH_A,
    operation: "delete_saved",
  };
}
function expiredDraft(): AccountReviewLocalSaveSnapshot["smsDrafts"][number] {
  return {
    retentionState: "expired",
    id: UUID_DRAFT_B,
    queueId: UUID_QUEUE,
    smsFingerprint: "owned-sms-fingerprint-b",
    parsedAt: EXPIRED_AT,
    operation: "rebind_remaining",
    expectedPostimageHash: HASH_B,
  };
}
function createdRefs(): AccountReviewLocalSaveSnapshot["createdEntityRefs"] {
  return [
    {
      entity: "account", id: REVIEW_ACCOUNT_ID,
      expectedPostimageHash: HASH_B,
    },
    {
      entity: "account_sms_sender", id: UUID_SENDER,
      expectedPostimageHash: HASH_C,
    },
    {
      entity: "transaction", id: REVIEW_INCOME_RECORD_ID,
      expectedPostimageHash: HASH_A,
    },
  ];
}
function smsSnapshot(): AccountReviewLocalSaveSnapshot {
  return accountReviewLocalSaveSnapshotSchema.parse({
    version: PRIVATE_VERSION,
    actionId: REVIEW_ACTION_ID,
    ownerId: REVIEW_USER_ID,
    sessionId: REVIEW_SESSION_ID,
    smsDrafts: [availableDraft(), expiredDraft()],
    createdEntityRefs: createdRefs(),
    defaultPreimages: [
      {
        accountId: REVIEW_ACCOUNT_ID, isDefault: true,
        expectedPostimageHash: HASH_B,
      },
    ],
    defaultDependencyActionIds: [UUID_PREDECESSOR_A, UUID_PREDECESSOR_B],
    queuePreimage: {
      id: UUID_QUEUE, userId: REVIEW_USER_ID,
      createdAt: QUEUE_CREATED_AT, updatedAt: UPDATED_AT,
      expectedPostimageHash: HASH_C, disposition: "present",
    },
  });
}

function voiceSnapshot(): AccountReviewLocalSaveSnapshot {
  return accountReviewLocalSaveSnapshotSchema.parse({
    ...smsSnapshot(),
    smsDrafts: [],
    queuePreimage: null,
    defaultDependencyActionIds: [],
  });
}

function decode(
  value: AccountReviewLocalSaveSnapshot,
  root: ExpectedOwnedRoot = expectedRoot()
): AccountReviewLocalSaveSnapshot {
  return parseAccountReviewLocalSaveSnapshot({
    json: JSON.stringify(value),
    expectedRoot: root,
  });
}

describe("#395 T043 account-review-local-save/v1 strict local schema", () => {
  it("has precisely nine required private top-level keys, no public payload extension", () => {
    expect(Object.keys(accountReviewLocalSaveSnapshotSchema.shape).sort())
      .toEqual([
        "actionId", "createdEntityRefs", "defaultDependencyActionIds",
        "defaultPreimages", "ownerId", "queuePreimage", "sessionId",
        "smsDrafts", "version",
      ]);
    expect(reviewBatchSaveWireSchema.shape)
      .not.toHaveProperty("localRecoverySnapshotJson");
    expect(reviewBatchSaveWireSchema.shape)
      .not.toHaveProperty("local_recovery_snapshot_json");
  });

  it("accepts a complete bounded SMS snapshot and preserves its exact private bytes", () => {
    const data = smsSnapshot();
    const parsed = decode(data);
    expect(parsed).toEqual(data);
    expect(parsed.queuePreimage).toMatchObject({
      id: UUID_QUEUE, userId: REVIEW_USER_ID, disposition: "present",
    });
    expect(parsed.smsDrafts).toHaveLength(2);
    expect(parsed.smsDrafts[0]).toMatchObject({
      retentionState: "available",
      payloadVersion: "2", position: "0",
      selectionOverride: true,
    });
    expect(parsed.smsDrafts[1]).toEqual({
      retentionState: "expired", id: UUID_DRAFT_B,
      queueId: UUID_QUEUE, smsFingerprint: "owned-sms-fingerprint-b",
      parsedAt: EXPIRED_AT, operation: "rebind_remaining",
      expectedPostimageHash: HASH_B,
    });
  });

  it("accepts Voice with null queue and empty SMS entries; never stores a transcript", () => {
    const parsed = decode(voiceSnapshot(), expectedRoot("VOICE"));
    expect(parsed.smsDrafts).toEqual([]);
    expect(parsed.queuePreimage).toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/transcript|rawAudio|audioBytes/);
  });

  it.each(["actionId", "ownerId", "sessionId"] as const)(
    "rejects a changed private %s against the authenticated public action root",
    (field) => {
      const snapshot = smsSnapshot();
      const changedId = "99999999-9999-4999-8999-999999999999";
      const tampered = {
        ...snapshot,
        [field]: changedId,
        ...(field === "ownerId" && snapshot.queuePreimage !== null
          ? { queuePreimage: { ...snapshot.queuePreimage, userId: changedId } }
          : {}),
      };
      // Still structurally valid: the OWNER/ACTION/SESSION mismatch must
      // fail at the root-bound parser, not only the Zod field grammar.
      expect(accountReviewLocalSaveSnapshotSchema.safeParse(tampered).success)
        .toBe(true);
      expect(() => parseAccountReviewLocalSaveSnapshot({
        json: JSON.stringify(tampered),
        expectedRoot: expectedRoot(),
      })).toThrow();
    }
  );

  it("rejects a forged expected Voice root for stored SMS evidence", () => {
    expect(() => decode(smsSnapshot(), expectedRoot("VOICE"))).toThrow();
    expect(() => decode(voiceSnapshot(), expectedRoot("SMS"))).toThrow();
  });

  it("rejects unknown/missing root keys and invalid version, not stripping evidence", () => {
    const valid = smsSnapshot();
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, transcript: "must stay memory-only",
    }).success).toBe(false);
    const { queuePreimage: omittedQueue, ...missing } = valid;
    expect(omittedQueue).not.toBeUndefined();
    expect(accountReviewLocalSaveSnapshotSchema.safeParse(missing).success)
      .toBe(false);
    for (const version of ["account-review-local-save/v2", "", "v1"]) {
      expect(accountReviewLocalSaveSnapshotSchema.safeParse({
        ...valid, version,
      }).success).toBe(false);
    }
  });

  it.each([
    "present", "pruned_empty", "expired", "superseded",
  ])("allows %s as a closed queue-header vocabulary value, not a lifecycle proof", (disposition) => {
    const queue = smsSnapshot().queuePreimage;
    if (!queue) throw new Error("Missing actual queue preimage");
    expect(accountReviewLocalSaveSnapshotSchema.shape.queuePreimage.safeParse({
      ...queue, disposition,
    }).success).toBe(true);
    // T049 must prove the real disposition and entry retention atomically;
    // pure schema vocabulary cannot authorize physical resurrection.
  });

  it("rejects an unexpected queue header or forged queue owner", () => {
    const valid = smsSnapshot();
    const queue = valid.queuePreimage;
    if (!queue) throw new Error("Missing owned queue in test fixture");
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, queuePreimage: { ...queue, transportLease: 0 },
    }).success).toBe(false);
    expect(() => decode({
      ...valid,
      queuePreimage: { ...queue,
        userId: "99999999-9999-4999-8999-999999999999" },
    })).toThrow();
  });

  it("rejects mismatched draft queue identity and reused source fingerprint", () => {
    const valid = smsSnapshot();
    const available = valid.smsDrafts[0];
    if (!available || available.retentionState !== "available")
      throw new Error("Missing available private test draft");
    expect(() => decode({
      ...valid,
      smsDrafts: [{ ...available,
        queueId: "99999999-9999-4999-8999-999999999999" }],
    })).toThrow();
    expect(() => decode({
      ...valid, smsDrafts: [available, { ...available, id: UUID_DRAFT_B }],
    })).toThrow();
  });

  it("accepts only exact available-entry fields and known bookkeeping operation", () => {
    const valid = smsSnapshot();
    const available = valid.smsDrafts[0];
    if (!available || available.retentionState !== "available")
      throw new Error("No available draft");
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid,
      smsDrafts: [{ ...available, extraRawSmsBody: "private" }],
    }).success).toBe(false);
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, smsDrafts: [{ ...available, operation: "delete_any" }],
    }).success).toBe(false);
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, smsDrafts: [{ ...available, selectionOverride: "" }],
    }).success).toBe(false);
  });

  it.each(["expired", "superseded"] as const)(
    "%s retains only metadata and rejects raw payload, selection, and timestamps",
    (retentionState) => {
      const valid = smsSnapshot();
      const expired = valid.smsDrafts[1];
      if (!expired) throw new Error("No redacted draft");
      const redacted = { ...expired, retentionState };
      expect(accountReviewLocalSaveSnapshotSchema.safeParse({
        ...valid, smsDrafts: [redacted],
      }).success).toBe(true);
      expect(accountReviewLocalSaveSnapshotSchema.safeParse({
        ...valid, smsDrafts: [{
          ...redacted, payloadJson: '{"private":"data"}',
          selectionOverride: true, createdAt: CREATED_AT,
        }],
      }).success).toBe(false);
    }
  );

  it.each(["00", "01", "+1", "-1", "1.0", "1e1", "9223372036854775808"])(
    "rejects noncanonical unsigned private payloadVersion %s",
    (payloadVersion) => {
      const valid = smsSnapshot();
      const available = valid.smsDrafts[0];
      if (!available || available.retentionState !== "available")
        throw new Error("No available draft");
      expect(accountReviewLocalSaveSnapshotSchema.safeParse({
        ...valid, smsDrafts: [{ ...available, payloadVersion }],
      }).success).toBe(false);
    }
  );

  it.each(["00", "01", "+1", "-1", "1.0", "1e1", 2])(
    "rejects noncanonical unsigned private position %s",
    (position) => {
      const valid = smsSnapshot();
      const available = valid.smsDrafts[0];
      if (!available || available.retentionState !== "available")
        throw new Error("No available draft");
      expect(accountReviewLocalSaveSnapshotSchema.safeParse({
        ...valid, smsDrafts: [{ ...available, position }],
      }).success).toBe(false);
    }
  );

  it("uses exactly the existing ReviewMutation entity vocabulary, without effects", () => {
    const canonical = reviewMutationSchema.options.map((shape) =>
      shape.shape.entity.value
    ).sort();
    const local = accountReviewLocalSaveSnapshotSchema
      .shape.createdEntityRefs.element.shape.entity.options;
    expect([...local].sort()).toEqual(canonical);
    expect(local).not.toContain("account_financial_effect");
  });

  it("rejects unknown entity kinds, duplicate creates and invalid postimage hashes", () => {
    const valid = smsSnapshot();
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, createdEntityRefs: [{
        entity: "account_financial_effect", id: REVIEW_ACCOUNT_ID,
        expectedPostimageHash: HASH_B,
      }],
    }).success).toBe(false);
    const first = valid.createdEntityRefs[0];
    if (!first) throw new Error("Missing actual first entity reference");
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, createdEntityRefs: [first, first],
    }).success).toBe(false);
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, createdEntityRefs: [{
        entity: "transaction", id: REVIEW_EXPENSE_RECORD_ID,
        expectedPostimageHash: HASH_B.toUpperCase(),
      }],
    }).success).toBe(false);
  });

  it("requires canonical distinct ASCII-sorted default predecessor action IDs", () => {
    const valid = smsSnapshot();
    expect(decode(valid).defaultDependencyActionIds)
      .toEqual([UUID_PREDECESSOR_A, UUID_PREDECESSOR_B]);
    for (const dependencies of [
      [UUID_PREDECESSOR_B, UUID_PREDECESSOR_A],
      [UUID_PREDECESSOR_A, UUID_PREDECESSOR_A],
      [REVIEW_ACTION_ID],
    ]) {
      expect(accountReviewLocalSaveSnapshotSchema.safeParse({
        ...valid, defaultDependencyActionIds: dependencies,
      }).success).toBe(false);
    }
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, defaultDependencyActionIds: [],
    }).success).toBe(true);
  });

  it("rejects bogus/default postimages and duplicate default preimages", () => {
    const valid = smsSnapshot();
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, defaultPreimages: [{
        accountId: REVIEW_ACCOUNT_ID, isDefault: false,
        expectedPostimageHash: "not-a-hash",
      }],
    }).success).toBe(false);
    const defaultRef = valid.defaultPreimages[0];
    if (!defaultRef) throw new Error("Missing actual default preimage");
    expect(accountReviewLocalSaveSnapshotSchema.safeParse({
      ...valid, defaultPreimages: [defaultRef, defaultRef],
    }).success).toBe(false);
  });

  it("rejects malformed raw JSON and an untrusted empty snapshot", () => {
    expect(() => parseAccountReviewLocalSaveSnapshot({
      json: "{bad-json", expectedRoot: expectedRoot(),
    })).toThrow();
    expect(() => parseAccountReviewLocalSaveSnapshot({
      json: "{}", expectedRoot: expectedRoot(),
    })).toThrow();
  });

  it("requires an SMS queue and all its drafts to belong to the authenticated review session", () => {
    const snapshot = smsSnapshot();
    const consistent = { ...snapshot, sessionId: UUID_QUEUE };
    const matchingRoot = { ...expectedRoot(), sessionId: UUID_QUEUE };
    expect(accountReviewLocalSaveSnapshotSchema.safeParse(consistent).success)
      .toBe(true);
    expect(decode(consistent, matchingRoot)).toEqual(consistent);

    // A different, internally consistent queue is structurally valid but
    // is never authority to restore into the authenticated SMS session.
    const wrongQueue = snapshot.queuePreimage;
    if (wrongQueue === null) throw new Error("Missing owned SMS queue");
    const mismatched = {
      ...snapshot,
      queuePreimage: { ...wrongQueue, id: UUID_OTHER_QUEUE },
      smsDrafts: snapshot.smsDrafts.map((draft) => ({
        ...draft,
        queueId: UUID_OTHER_QUEUE,
      })),
    };
    expect(accountReviewLocalSaveSnapshotSchema.safeParse(mismatched).success)
      .toBe(true);
    expect(() => decode(mismatched, expectedRoot())).toThrow();
  });

  it.each(["payloadVersion", "position"] as const)(
    "keeps canonical %s text exact at the unsafe Number-conversion boundary",
    (field) => {
      const snapshot = smsSnapshot();
      const first = snapshot.smsDrafts[0];
      if (!first || first.retentionState !== "available")
        throw new Error("Missing available SMS preimage");
      const tooLargeForNumber = "9007199254740992";
      const parsed = accountReviewLocalSaveSnapshotSchema.parse({
        ...snapshot,
        smsDrafts: [{ ...first, [field]: tooLargeForNumber }],
      });
      const available = parsed.smsDrafts[0];
      if (!available || available.retentionState !== "available")
        throw new Error("Missing canonical available SMS evidence");
      expect(available[field]).toBe(tooLargeForNumber);
      expect(Number.isSafeInteger(Number(available[field]))).toBe(false);
      // T051 must reject an unsafe numeric SQLite conversion; there is
      // no authorised restoration converter in this source wave.
    }
  );

  it("retains a closed public review payload with only an opaque intent digest", () => {
    const valid = smsSnapshot();
    const withPrivate = {
      ...reviewBatchSavePayload, localRecoverySnapshotJson: JSON.stringify(valid),
    };
    expect(reviewBatchSaveWireSchema.safeParse(withPrivate).success).toBe(false);
    expect(reviewBatchSaveWireSchema.safeParse({
      ...reviewBatchSavePayload, local_recovery_snapshot_json: JSON.stringify(valid),
    }).success).toBe(false);
    expect(JSON.stringify(reviewBatchSavePayload)).not.toContain(
      "private-raw-review-a"
    );
    expect(reviewBatchSaveWireSchema.parse(reviewBatchSavePayload)
      .frozenIntentDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});
