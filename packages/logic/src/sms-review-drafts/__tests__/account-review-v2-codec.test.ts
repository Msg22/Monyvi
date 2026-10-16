/**
 * #395 T025 genuine creation Red: the four T028 codec exports must be added
 * to the real codec module. Do not mock codec, schema, normalizer or reducer.
 * The V1 regression suite is preserved untouched in its original file.
 */
import {
  decodeSmsReviewDraft,
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraft,
  encodeSmsReviewDraftV2,
  migrateSmsReviewDraftV1ToV2,
  smsReviewDraftPayloadV2Schema,
  SmsReviewDraftCodecError,
} from "../sms-review-draft-codec";
import {
  makeT025ConfirmedSession,
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
  T025_IDS,
} from "./account-review-v2-t025-fixtures";

function encodedV2(): {
  readonly transaction: ReturnType<typeof makeT025SmsOriginal>;
  readonly session: ReturnType<typeof makeT025ReviewSession>;
  readonly encoded: ReturnType<typeof encodeSmsReviewDraftV2>;
} {
  const transaction = makeT025SmsOriginal();
  const session = makeT025ReviewSession();
  return {
    transaction,
    session,
    encoded: encodeSmsReviewDraftV2({
      transaction,
      review: makeT025StoredReview(session, T025_IDS.rowOne),
    }),
  };
}

/**
 * Thin proposed T025 adapter: exactly existing V1 encoded fields plus outer
 * owner/queue and selection_override. These are existing DB record columns,
 * not a new durable review DTO or a second codec schema.
 */
function decodeV2(
  encoded: { readonly version: number; readonly json: string },
  fingerprint: string = T025_IDS.fingerprintOne,
  ownerId: string = T025_IDS.owner,
  sessionId: string = T025_IDS.queue,
  selectionOverride: boolean | null = null
): ReturnType<typeof decodeSmsReviewDraftPayload> {
  return decodeSmsReviewDraftPayload({
    ...encoded,
    expectedFingerprint: fingerprint,
    expectedOwnerId: ownerId,
    expectedSessionId: sessionId,
    selectionOverride,
  });
}

function expectClosedCodecFailure(action: () => unknown): void {
  let error: unknown;
  try {
    action();
  } catch (caught: unknown) {
    error = caught;
  }
  expect(error).toBeInstanceOf(SmsReviewDraftCodecError);
  if (!(error instanceof SmsReviewDraftCodecError)) return;
  expect(error.message).not.toContain("QNB purchase");
  expect(error.message).not.toContain(T025_IDS.fingerprintOne);
}

describe("#395 T025 real V2 codec and unchanged V1 wire compatibility", () => {
  it("uses the exact version-2 root, serialized source transaction and referenced review", () => {
    const { transaction, session, encoded } = encodedV2();
    expect(encoded.version).toBe(2);
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    expect(Object.keys(payload).sort()).toEqual([
      "review",
      "transaction",
      "version",
    ]);
    expect(Object.keys(payload.review).sort()).toEqual([
      "filter", "groups",
      "operationGeneration",
      "ownerId",
      "preferredCurrency",
      "removedEvidenceKeys",
      "reviewRevision",
      "row",
      "sessionId",
      "sourceRevision",
    ]);
    expect(payload.transaction.date).toBe(transaction.date.toISOString());
    expect(payload.review.sessionId).toBe(session.sessionId);
    expect(payload.review.filter).toBe("all");
    expect(payload.review.row.sourceFingerprint).toBe(
      transaction.smsFingerprint
    );
    expect(payload.review.groups).toEqual(session.groups);
    expect(payload.review.removedEvidenceKeys).toEqual([]);
    expect(encoded.json).not.toContain("undoToken");
    expect(encoded.json).not.toContain("afterRemovalGeneration");
  });

  it("restores a real Date, exact owner/session and unchanged financial values", () => {
    const { transaction, encoded } = encodedV2();
    const decoded = decodeV2(encoded);
    expect(decoded.version).toBe(2);
    expect(decoded.transaction).toEqual(transaction);
    expect(decoded.transaction.date).toBeInstanceOf(Date);
    expect(decoded.review?.row.amountDecimal).toBe("50");
    expect(decoded.review?.row.sourceFingerprint).toBe(
      transaction.smsFingerprint
    );
  });

  it("uses the persisted selection_override rather than stale JSON selected status", () => {
    const session = makeT025ConfirmedSession(makeT025ReviewSession(), [
      T025_IDS.rowOne,
    ]);
    const transaction = makeT025SmsOriginal();
    const encoded = encodeSmsReviewDraftV2({
      transaction,
      review: makeT025StoredReview(session, T025_IDS.rowOne),
    });
    expect(
      decodeV2(
        encoded,
        transaction.smsFingerprint,
        T025_IDS.owner,
        T025_IDS.queue,
        false
      ).review?.row.selected
    ).toBe(false);
    expect(
      decodeV2(
        encoded,
        transaction.smsFingerprint,
        T025_IDS.owner,
        T025_IDS.queue,
        true
      ).review?.row.selected
    ).toBe(true);
  });

  it("retains deterministic encoding for identical canonical review snapshots", () => {
    const { transaction, session } = encodedV2();
    const first = encodeSmsReviewDraftV2({
      transaction,
      review: makeT025StoredReview(session, T025_IDS.rowOne),
    });
    const second = encodeSmsReviewDraftV2({
      transaction: { ...transaction, date: new Date(transaction.date) },
      review: makeT025StoredReview(session, T025_IDS.rowOne),
    });
    expect(second).toEqual(first);
  });

  it.each([
    ["fingerprint", T025_IDS.fingerprintTwo, T025_IDS.owner, T025_IDS.queue],
    ["owner", T025_IDS.fingerprintOne, T025_IDS.foreignOwner, T025_IDS.queue],
    [
      "queue/session",
      T025_IDS.fingerprintOne,
      T025_IDS.owner,
      T025_IDS.alternateQueue,
    ],
  ] as const)(
    "refuses mismatched outer %s without returning a different review",
    (_label, fingerprint, ownerId, sessionId) => {
      const { encoded } = encodedV2();
      expectClosedCodecFailure(() =>
        decodeV2(encoded, fingerprint, ownerId, sessionId)
      );
    }
  );

  it("rejects outer payload_version disagreement rather than guessing V1/V2", () => {
    const { encoded } = encodedV2();
    expectClosedCodecFailure(() => decodeV2({ ...encoded, version: 1 }));
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    expectClosedCodecFailure(() =>
      decodeV2({ ...encoded, json: JSON.stringify({ ...payload, version: 1 }) })
    );
  });

  it("rejects corrupted source fingerprints even when the outer fingerprint is valid", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    expectClosedCodecFailure(() =>
      decodeV2({
        ...encoded,
        json: JSON.stringify({
          ...payload,
          review: {
            ...payload.review,
            row: {
              ...payload.review.row,
              sourceFingerprint: T025_IDS.fingerprintTwo,
            },
          },
        }),
      })
    );
  });

  it("rejects source/review transaction disagreement without financial substitution", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    expectClosedCodecFailure(() =>
      decodeV2({
        ...encoded,
        json: JSON.stringify({
          ...payload,
          transaction: { ...payload.transaction, amount: 999 },
        }),
      })
    );
  });

  it("rejects unapproved Undo or diagnostic fields in the exact V2 root", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    expect(
      smsReviewDraftPayloadV2Schema.safeParse({
        ...payload,
        review: { ...payload.review, undoToken: T025_IDS.undoToken },
      }).success
    ).toBe(false);
    expect(
      smsReviewDraftPayloadV2Schema.safeParse({
        ...payload,
        debugRawSmsPayload: "QNB purchase",
      }).success
    ).toBe(false);
  });

  it("does not persist VOICE rows in an SMS review draft", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    expect(
      smsReviewDraftPayloadV2Schema.safeParse({
        ...payload,
        review: {
          ...payload.review,
          row: { ...payload.review.row, source: "VOICE" },
        },
      }).success
    ).toBe(false);
  });

  it.each([
    {
      name: "unresolved",
      assignmentKind: "unresolved",
      unknownCurrency: false,
    },
    { name: "existing", assignmentKind: "existing", unknownCurrency: false },
    {
      name: "unresolved with unknown currency",
      assignmentKind: "unresolved",
      unknownCurrency: true,
    },
  ])(
    "$name assignment cannot coexist with an active group linking this row",
    ({ assignmentKind, unknownCurrency }) => {
      const { encoded } = encodedV2();
      const raw: unknown = JSON.parse(encoded.json);
      const payload = smsReviewDraftPayloadV2Schema.parse(raw);
      const assignment =
        assignmentKind === "existing"
          ? {
              state: "existing",
              accountId: "00000000-0000-4000-8000-000000000102",
              origin: "user",
              currency: "EGP",
              identityRevision: "0",
            }
          : {
              state: "unresolved",
              accountId: null,
              reasonCode: "account_needed",
              candidateAccountIds: [],
            };
      const invalid = {
        ...payload,
        review: {
          ...payload.review,
          row: {
            ...payload.review.row,
            assignment,
            currency: unknownCurrency
              ? {
                  state: "unconfirmed",
                  reason: "legacy_unknown",
                  candidateCodes: [],
                  statedCode: null,
                  evidenceSpans: [],
                }
              : payload.review.row.currency,
          },
        },
      };
      expect(payload.review.groups[0]?.linkedRowIds).toContain(
        payload.review.row.rowId
      );
      expect(smsReviewDraftPayloadV2Schema.safeParse(invalid).success).toBe(
        false
      );
      expectClosedCodecFailure(() =>
        decodeV2({ ...encoded, json: JSON.stringify(invalid) })
      );
    }
  );

  it("rejects multiple active groups linking one stored row even when one is reciprocal", () => {
    const { encoded } = encodedV2();
    const raw: unknown = JSON.parse(encoded.json);
    const payload = smsReviewDraftPayloadV2Schema.parse(raw);
    const first = payload.review.groups[0];
    if (!first) throw new Error("Missing canonical active T025 group");
    const duplicateMembership = {
      ...first,
      groupId: T025_IDS.alternateQueue,
      evidenceKey: "b".repeat(64),
      linkedRowIds: [...first.linkedRowIds],
    };
    const invalid = {
      ...payload,
      review: {
        ...payload.review,
        groups: [first, duplicateMembership],
      },
    };
    expect(payload.review.row.assignment.state).toBe("suggested");
    expect(smsReviewDraftPayloadV2Schema.safeParse(invalid).success).toBe(
      false
    );
    expectClosedCodecFailure(() =>
      decodeV2({ ...encoded, json: JSON.stringify(invalid) })
    );
  });

  it("allows an inert removed tombstone detached from the final live row", () => {
    const { transaction, encoded } = encodedV2();
    const raw: unknown = JSON.parse(encoded.json);
    const payload = smsReviewDraftPayloadV2Schema.parse(raw);
    const group = payload.review.groups[0];
    if (!group) throw new Error("Missing original group for tombstone");
    const removed = {
      ...payload,
      review: {
        ...payload.review,
        groups: [{ ...group, status: "removed", linkedRowIds: [] }],
        removedEvidenceKeys: [group.evidenceKey],
        row: {
          ...payload.review.row,
          selected: false,
          assignment: {
            state: "unresolved",
            accountId: null,
            reasonCode: "account_group_removed",
            candidateAccountIds: [],
          },
          reviewReasons: ["account_group_removed"],
        },
      },
    };
    const parsed = smsReviewDraftPayloadV2Schema.safeParse(removed);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Valid removal tombstone rejected");
    const encodedRemoved = encodeSmsReviewDraftV2({
      transaction,
      review: parsed.data.review,
    });
    expect(decodeV2(encodedRemoved).review?.groups[0]?.status).toBe("removed");
    expect(decodeV2(encodedRemoved).review?.removedEvidenceKeys).toEqual([
      group.evidenceKey,
    ]);
  });

  it("refuses an unrelated non-tombstoned group inside one row's V2 snapshot", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    const first = payload.review.groups[0];
    if (!first) throw new Error("Missing original canonical T025 group");
    expect(
      smsReviewDraftPayloadV2Schema.safeParse({
        ...payload,
        review: {
          ...payload.review,
          groups: [
            ...payload.review.groups,
            {
              ...first,
              groupId: T025_IDS.alternateQueue,
              evidenceKey: "b".repeat(64),
              linkedRowIds: [T025_IDS.rowTwo],
            },
          ],
        },
      }).success
    ).toBe(false);
  });

  it("rejects contradictory group status/revision instead of last-write-wins", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    const original = payload.review.groups[0];
    if (!original) throw new Error("Missing original linked group");
    expectClosedCodecFailure(() =>
      decodeV2({
        ...encoded,
        json: JSON.stringify({
          ...payload,
          review: {
            ...payload.review,
            groups: [
              {
                ...original,
                revision: "3",
                status: "confirmed",
                confirmedIdentityRevision: "3",
              },
            ],
          },
        }),
      })
    );
  });

  it("keeps removal tombstones durable without a persisted Undo lease", () => {
    const { encoded } = encodedV2();
    const payload = smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(encoded.json) as unknown
    );
    const group = payload.review.groups[0];
    if (!group) throw new Error("Missing original group");
    const removed: typeof payload = {
      ...payload,
      review: {
        ...payload.review,
        groups: [{ ...group, status: "removed" }],
        removedEvidenceKeys: [group.evidenceKey],
        row: {
          ...payload.review.row,
          selected: false,
          assignment: {
            state: "unresolved",
            accountId: null,
            reasonCode: "account_group_removed",
            candidateAccountIds: [],
          },
          reviewReasons: ["account_group_removed"],
        },
      },
    };
    const encodedRemoved = encodeSmsReviewDraftV2({
      transaction: makeT025SmsOriginal(),
      review: removed.review,
    });
    expect(encodedRemoved.json).not.toContain("undoToken");
    expect(decodeV2(encodedRemoved).review?.removedEvidenceKeys).toContain(
      group.evidenceKey
    );
    expect(decodeV2(encodedRemoved).review?.row.assignment.state).toBe(
      "unresolved"
    );
  });

  it("preserves legacy V1 encoder/decoder bytes and transaction category selection", () => {
    const transaction = makeT025SmsOriginal();
    const prior = encodeSmsReviewDraft(transaction);
    expect(prior.version).toBe(1);
    expect(
      decodeSmsReviewDraft({
        ...prior,
        expectedFingerprint: transaction.smsFingerprint,
      })
    ).toEqual(transaction);
    expect(
      encodeSmsReviewDraft({ ...transaction, date: new Date(transaction.date) })
    ).toEqual(prior);
    const dualReader = decodeV2(prior);
    expect(dualReader.version).toBe(1);
    expect(dualReader.transaction.categoryId).toBe(transaction.categoryId);
    expect(dualReader.transaction.categoryConfirmed).toBe(true);
  });

  it("migrates V1 without fabricating explicit currency proof or losing an account choice", () => {
    const chosen = {
      ...makeT025SmsOriginal(),
      accountId: "00000000-0000-4000-8000-000000000102",
    };
    const original = encodeSmsReviewDraft(chosen);
    // Same V1 encoded tuple, authenticated queue and canonical initial review
    // fields; the writer supplies these from its actual owned row/queue.
    const migrated = migrateSmsReviewDraftV1ToV2({
      ...original,
      expectedFingerprint: chosen.smsFingerprint,
      expectedOwnerId: T025_IDS.owner,
      expectedSessionId: T025_IDS.queue,
      rowId: T025_IDS.rowOne,
      sourceRevision: "0",
      preferredCurrency: "EGP",
      reviewRevision: "0",
      operationGeneration: "0",
      selectionOverride: true,
    });
    expect(migrated.version).toBe(2);
    const restored = decodeV2(
      migrated,
      chosen.smsFingerprint,
      T025_IDS.owner,
      T025_IDS.queue,
      true
    );
    expect(restored.transaction.accountId).toBe(chosen.accountId);
    expect(restored.transaction.categoryConfirmed).toBe(true);
    expect(restored.review?.row.currency).toMatchObject({
      state: "unconfirmed",
      reason: "legacy_unknown",
    });
    expect(restored.review?.row.selected).toBe(true);
    expect(restored.review?.row.assignment.state).not.toBe("suggested");
  });

  it("does not turn a pending legacy account into a silently confirmed group", () => {
    const original = makeT025SmsOriginal();
    const pending = encodeSmsReviewDraft({
      ...original,
      pendingAccount: {
        tempId: "t025-pending-qnb",
        name: "QNB",
        currency: "EGP",
        type: "BANK",
        institutionId: null,
        providerDisplayName: "QNB",
        senderDisplayName: "QNB",
        cardLast4: "0007",
      },
    });
    const migrated = migrateSmsReviewDraftV1ToV2({
      ...pending,
      expectedFingerprint: original.smsFingerprint,
      expectedOwnerId: T025_IDS.owner,
      expectedSessionId: T025_IDS.queue,
      rowId: T025_IDS.rowOne,
      sourceRevision: "0",
      preferredCurrency: "EGP",
      reviewRevision: "0",
      operationGeneration: "0",
      selectionOverride: null,
    });
    const decoded = decodeV2(migrated);
    expect(
      decoded.review?.groups.every((group) => group.status !== "confirmed")
    ).toBe(true);
    expect(decoded.review?.row.selected).toBe(false);
    expect(decoded.transaction.pendingAccount?.tempId).toBe("t025-pending-qnb");
  });

  it("migrates V1 account evidence as uncertain, never a proven absence", () => {
    const legacy: Parameters<typeof encodeSmsReviewDraft>[0] = {
      ...makeT025SmsOriginal(),
      accountId: "00000000-0000-4000-8000-000000000102",
      pendingAccount: {
        tempId: "t025-legacy-pending-qnb",
        name: "QNB",
        currency: "EGP",
        type: "BANK",
        institutionId: null,
        providerDisplayName: "QNB",
        senderDisplayName: "QNB",
        cardLast4: "0007",
      },
      categoryConfirmed: true,
    };
    const original = encodeSmsReviewDraft(legacy);
    const migrated = migrateSmsReviewDraftV1ToV2({
      ...original,
      expectedFingerprint: legacy.smsFingerprint,
      expectedOwnerId: T025_IDS.owner,
      expectedSessionId: T025_IDS.queue,
      rowId: T025_IDS.rowOne,
      sourceRevision: "0",
      preferredCurrency: "EGP",
      reviewRevision: "0",
      operationGeneration: "0",
      selectionOverride: true,
    });
    const restored = decodeV2(
      migrated,
      legacy.smsFingerprint,
      T025_IDS.owner,
      T025_IDS.queue,
      true
    );
    const row = restored.review?.row;
    expect(restored.version).toBe(2);
    expect(row?.sourceRef).toBe("legacy-local:" + T025_IDS.rowOne);
    expect(row?.sourceFingerprint).toBe(legacy.smsFingerprint);
    expect(row?.accountEvidence).toEqual({
      state: "uncertain",
      name: null,
      type: null,
      institutionId: null,
      providerDisplayName: null,
      cardLast4: null,
      evidenceSpans: [],
      candidateAccountIds: [],
    });
    expect(row?.currency).toMatchObject({
      state: "unconfirmed",
      reason: "legacy_unknown",
    });
    expect(row?.assignment.state).toBe("unresolved");
    expect(restored.review?.groups).toEqual([]);
    expect(restored.transaction.accountId).toBe(legacy.accountId);
    expect(restored.transaction.pendingAccount).toEqual(legacy.pendingAccount);
    expect(row?.transaction.accountId).toBe(legacy.accountId);
    if (!row || row.transaction.source !== "SMS") {
      throw new Error("Expected migrated SMS review transaction");
    }
    expect(row?.transaction.pendingAccount).toEqual(legacy.pendingAccount);
    expect(row?.transaction.categoryId).toBe(legacy.categoryId);
    expect(row?.transaction.categoryConfirmed).toBe(true);
    expect(row?.transaction.date).toEqual(legacy.date);
    expect(restored.transaction.date).toEqual(legacy.date);
    expect(row?.selected).toBe(true);
    expect(migrated.json).not.toContain("undoToken");
  });

  it("refuses malformed legacy bytes without rewriting or leaking source content", () => {
    const broken = {
      version: 1,
      json: '{"version":1,"transaction":{"rawSmsBody":"QNB purchase"',
      expectedFingerprint: T025_IDS.fingerprintOne,
      expectedOwnerId: T025_IDS.owner,
      expectedSessionId: T025_IDS.queue,
      rowId: T025_IDS.rowOne,
      sourceRevision: "0",
      preferredCurrency: "EGP" as const,
      reviewRevision: "0",
      operationGeneration: "0",
      selectionOverride: false,
    };
    const immutableBytes = broken.json;
    expectClosedCodecFailure(() => migrateSmsReviewDraftV1ToV2(broken));
    expect(broken.json).toBe(immutableBytes);
  });
});
