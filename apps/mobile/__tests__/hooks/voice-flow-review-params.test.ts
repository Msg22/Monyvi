/**
 * #395 T054 TESTS-FIRST: the REAL Voice serializer must carry the original
 * canonical review session across the Expo route. No provider is invoked here.
 */
import type { AiVoiceParserSuccess } from "../../services/ai-voice-parser-service";
import { serializeAiReviewParams } from "../../hooks/voice-flow-submission";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import { makeSaveFixture } from "../services/account-review-save-test-fixtures";

function voiceResult(
  session?: AccountReviewSession
): AiVoiceParserSuccess {
  const selectedSession = session ?? makeSaveFixture("voice-shared").session;
  return {
    transactions: selectedSession.rows.map((row) => row.transaction),
    transcript: "Voice transcript visible only in the review route",
    originalTranscript: "Original voice transcript",
    detectedLanguage: "en",
    ...(session ? { reviewSession: session } : {}),
  };
}

/** Test-only decoding of JSON transport; production must validate unknown too. */
function decodeSession(
  raw: string | undefined
): AccountReviewSession {
  if (typeof raw !== "string")
    throw new Error("missing_canonical_voice_route_session");
  const decoded: unknown = JSON.parse(raw, (key: string, value: unknown): unknown => {
    if (key === "date" && typeof value === "string") {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date;
    }
    return value;
  });
  return accountReviewSessionSchema.parse(decoded);
}

describe("#395 T054 Voice route parameters, real serializer", () => {
  it("V01 carries exact owner/source/session, frozen selected intent and group/row revisions", () => {
    const fixture = makeSaveFixture("voice-shared");
    const params = serializeAiReviewParams(voiceResult(fixture.session), 3);
    const decoded = decodeSession(params.reviewSession);
    expect(decoded.ownerId).toBe(fixture.session.ownerId);
    expect(decoded.source).toBe("VOICE");
    expect(decoded.sessionId).toBe(fixture.session.sessionId);
    expect(decoded.sourceRevision).toBe(fixture.session.sourceRevision);
    expect(decoded.revision).toBe(fixture.session.revision);
    expect(decoded.operationGeneration).toBe(fixture.session.operationGeneration);
    expect(decoded.rows.map((row) => [row.rowId, row.revision, row.selected]))
      .toEqual(fixture.session.rows.map((row) =>
        [row.rowId, row.revision, row.selected]));
    expect(decoded.groups).toEqual(fixture.session.groups);
    expect(decoded.saveIntent).toEqual(fixture.intent);
    expect(params.originTabIndex).toBe("3");
  });

  it("V02 preserves the original Date objects after route JSON reconstruction", () => {
    const fixture = makeSaveFixture("voice-existing");
    const params = serializeAiReviewParams(voiceResult(fixture.session), 2);
    const decoded = decodeSession(params.reviewSession);
    expect(decoded.rows).toHaveLength(fixture.session.rows.length);
    for (const [index, row] of decoded.rows.entries()) {
      const original = fixture.session.rows[index];
      if (!original) throw new Error("fixture_index_missing");
      expect(row.transaction.date).toBeInstanceOf(Date);
      expect(row.transaction.date.getTime()).toBe(
        original.transaction.date.getTime()
      );
    }
  });

  it("V03 sends the exact canonical review bytes rather than a flattened or re-resolved provider result", () => {
    const fixture = makeSaveFixture("voice-cash");
    const before = accountReviewSessionSchema.parse(fixture.session);
    const params = serializeAiReviewParams(voiceResult(before), 1);
    expect(decodeSession(params.reviewSession)).toEqual(before);
    expect(params.transactions).toBe(
      JSON.stringify(before.rows.map((row) => row.transaction))
    );
  });

  it("V04 retains the existing v1 route/navigation and transcript contract without fabricating v2", () => {
    const result = voiceResult();
    const params = serializeAiReviewParams(result, 0);
    expect(params).toMatchObject({
      transactions: JSON.stringify(result.transactions),
      transcript: result.transcript,
      originalTranscript: result.originalTranscript,
      detectedLanguage: "en",
      originTabIndex: "0",
    });
    expect(params.reviewSession).toBeUndefined();
    expect(Object.keys(params).sort()).toEqual([
      "detectedLanguage", "originTabIndex", "originalTranscript",
      "transactions", "transcript",
    ]);
  });
});
