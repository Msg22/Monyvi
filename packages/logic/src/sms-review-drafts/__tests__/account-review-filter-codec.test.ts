/**
 * #395 T054 local filter header — TESTS FIRST / NOT RUN.
 * Exercise only the real v1/v2 codec and its closed schema. Historical
 * nine-field source is derived by removing the ONE unshipped tenth field
 * from genuine V2 encoded content; no production codec or parser mock.
 */
import {
  decodeSmsReviewDraft,
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraft,
  encodeSmsReviewDraftV2,
  smsReviewDraftPayloadV2Schema,
  SmsReviewDraftCodecError,
} from "../sms-review-draft-codec";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
  T025_IDS,
} from "./account-review-v2-t025-fixtures";

type Encoded = ReturnType<typeof encodeSmsReviewDraftV2>;
type ReviewSession = ReturnType<typeof makeT025ReviewSession>;

function encodedWithFilter(
  filter: ReviewSession["filter"]
): Encoded {
  const session = makeT025ReviewSession();
  const transaction = makeT025SmsOriginal();
  const review = {
    ...makeT025StoredReview(session, T025_IDS.rowOne),
    filter,
  };
  return encodeSmsReviewDraftV2({ transaction, review });
}

function decode(encoded: Encoded | { readonly version: 2; readonly json: string }) {
  return decodeSmsReviewDraftPayload({
    ...encoded,
    expectedFingerprint: T025_IDS.fingerprintOne,
    expectedOwnerId: T025_IDS.owner,
    expectedSessionId: T025_IDS.queue,
    selectionOverride: null,
  });
}
function oldNineKeyHeader(
  filter: ReviewSession["filter"] = "all"
): { readonly version: 2; readonly json: string } {
  const latest = encodedWithFilter(filter);
  const parsed: unknown = JSON.parse(latest.json);
  if (!parsed || typeof parsed !== "object" ||
      !("review" in parsed) || !parsed.review ||
      typeof parsed.review !== "object")
    throw new Error("expected_actual_v2_review_header");
  // History originally serialized exactly nine review properties. Rebuild
  // those original bytes explicitly, without an invented legacy DTO.
  const observed = "filter" in parsed.review
    ? parsed.review.filter : undefined;
  if (observed !== undefined && observed !== filter)
    throw new Error("conflicting_actual_new_v2_filter");
  const nineReview = Object.fromEntries(
    Object.entries(parsed.review).filter(([key]) => key !== "filter")
  );
  return {
    version: 2,
    json: JSON.stringify({ ...parsed, review: nineReview }),
  };
}

describe("#395 T054 SMS review V2 filter compatibility and strict closure", () => {
  it("C01 NEW V2 encodes exactly ten review properties with the same explicit active filter", () => {
    for (const filter of ["all", "needs_review", "selected"] as const) {
      const encoded = encodedWithFilter(filter);
      const parsed = smsReviewDraftPayloadV2Schema.parse(
        JSON.parse(encoded.json) as unknown
      );
      expect(Object.keys(parsed.review).sort()).toEqual([
        "filter", "groups", "operationGeneration", "ownerId",
        "preferredCurrency", "removedEvidenceKeys", "reviewRevision",
        "row", "sessionId", "sourceRevision",
      ]);
      expect(parsed.review).toEqual(expect.objectContaining({ filter }));
      expect(decode(encoded).review).toEqual(
        expect.objectContaining({ filter })
      );
      expect(encoded.json).not.toContain("undoToken");
      expect(encoded.json).not.toContain("originalTranscript");
    }
  });

  it("C02 actual historical nine-key V2 decodes to all without raw JSON rewriting or generation bump", () => {
    const old = oldNineKeyHeader("all");
    const bytes = old.json;
    const raw: unknown = JSON.parse(bytes);
    expect(smsReviewDraftPayloadV2Schema.parse(raw)).toBeDefined();
    const decoded = decode(old);
    expect(decoded.review).toEqual(expect.objectContaining({
      filter: "all", reviewRevision: "0", operationGeneration: "0",
    }));
    expect(old.json).toBe(bytes);
    expect(decoded.transaction.smsFingerprint).toBe(T025_IDS.fingerprintOne);
    expect(decoded.transaction.date).toBeInstanceOf(Date);
  });

  it("C03 historical nine-key and explicit tenth-key all share an equivalent decoded business header", () => {
    const old = decode(oldNineKeyHeader("all"));
    const modern = decode(encodedWithFilter("all"));
    expect(old.review).toEqual(modern.review);
    expect(old.transaction).toEqual(modern.transaction);
  });

  it("C04 a post-transition write of a formerly historical row MUST materialize the tenth field", () => {
    const old = decode(oldNineKeyHeader());
    if (!old.review) throw new Error("missing_actual_legacy_review");
    const nextReview = { ...old.review, filter: "selected" as const };
    const next = encodeSmsReviewDraftV2({
      transaction: old.transaction,
      review: nextReview,
    });
    expect(smsReviewDraftPayloadV2Schema.parse(
      JSON.parse(next.json) as unknown
    ).review).toEqual(expect.objectContaining({ filter: "selected" }));
    expect(next.version).toBe(2);
    expect(next.json).not.toContain("undoToken");
  });

  it("C05 strict v2 codec rejects unknown filtering/Undo fields and invalid filter values, without diagnostic raw SMS", () => {
    const original = encodedWithFilter("selected");
    const raw: unknown = JSON.parse(original.json);
    if (!raw || typeof raw !== "object" || !("review" in raw) ||
        !raw.review || typeof raw.review !== "object")
      throw new Error("expected_actual_review_json");
    for (const changed of [
      { ...raw, review: { ...raw.review, filter: "ready" } },
      { ...raw, review: { ...raw.review, undoToken: T025_IDS.undoToken } },
      { ...raw, review: { ...raw.review, shadowFilter: "all" } },
    ]) {
      const json = JSON.stringify(changed);
      expect(() => smsReviewDraftPayloadV2Schema.parse(
        JSON.parse(json) as unknown
      )).toThrow();
      expect(() => decode({ version: 2, json })).toThrow(
        SmsReviewDraftCodecError
      );
    }
  });

  it("C06 filter changes do not modify the original financial transaction, category, fingerprint or selection override", () => {
    const session = makeT025ReviewSession();
    const original = makeT025SmsOriginal();
    const review = makeT025StoredReview(session, T025_IDS.rowOne);
    const allReview = { ...review, filter: "all" as const };
    const selectedReview = { ...review, filter: "selected" as const };
    const all = encodeSmsReviewDraftV2({
      transaction: original,
      review: allReview,
    });
    const selected = encodeSmsReviewDraftV2({
      transaction: original,
      review: selectedReview,
    });
    const before = decodeSmsReviewDraftPayload({
      ...all, expectedFingerprint: original.smsFingerprint,
      expectedOwnerId: session.ownerId, expectedSessionId: session.sessionId,
      selectionOverride: true,
    });
    const after = decodeSmsReviewDraftPayload({
      ...selected, expectedFingerprint: original.smsFingerprint,
      expectedOwnerId: session.ownerId, expectedSessionId: session.sessionId,
      selectionOverride: true,
    });
    expect(after.transaction).toEqual(before.transaction);
    expect(after.transaction.categoryId).toBe(original.categoryId);
    expect(after.review?.row.selected).toBe(true);
    expect(after.review?.row.revision).toBe(before.review?.row.revision);
    expect(after.review?.groups).toEqual(before.review?.groups);
    expect(after.review?.operationGeneration).toBe(
      before.review?.operationGeneration
    );
  });

  it("C07 original version-one encoder/decoder behavior remains unchanged, with no V2 filter or transient Undo", () => {
    const original = makeT025SmsOriginal();
    const first = encodeSmsReviewDraft(original);
    const again = encodeSmsReviewDraft(original);
    expect(again).toEqual(first);
    const restored = decodeSmsReviewDraft({
      ...first, expectedFingerprint: original.smsFingerprint,
    });
    expect(restored).toEqual(original);
    expect(first.json).not.toContain('"filter"');
    expect(first.json).not.toContain("undoToken");
  });
});
