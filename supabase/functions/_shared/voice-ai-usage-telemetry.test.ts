import assert from "node:assert/strict";

import {
  extractVoiceAiUsageTelemetry,
  logVoiceAiUsageTelemetry,
  VOICE_AI_USAGE_TELEMETRY_EVENT,
  VOICE_AI_USAGE_TELEMETRY_MODEL,
  type VoiceAiUsageTelemetryEvent,
  type VoiceAiUsageTelemetrySink,
} from "./voice-ai-usage-telemetry.ts";

Deno.test(
  "extractVoiceAiUsageTelemetry produces observed hit and accurate ratio for full valid metadata",
  () => {
    const raw = {
      promptTokenCount: 1000,
      cachedContentTokenCount: 600,
      candidatesTokenCount: 150,
      totalTokenCount: 1150,
    };

    const event = extractVoiceAiUsageTelemetry(raw, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: 1000,
      cachedContentTokenCount: 600,
      candidatesTokenCount: 150,
      totalTokenCount: 1150,
      cacheObservedHit: true,
      cachedInputRatio: 0.6,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry produces observed miss with ratio 0 for valid 0 cached count",
  () => {
    const raw = {
      promptTokenCount: 1000,
      cachedContentTokenCount: 0,
      candidatesTokenCount: 120,
      totalTokenCount: 1120,
    };

    const event = extractVoiceAiUsageTelemetry(raw, 1);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 1,
      promptTokenCount: 1000,
      cachedContentTokenCount: 0,
      candidatesTokenCount: 120,
      totalTokenCount: 1120,
      cacheObservedHit: false,
      cachedInputRatio: 0,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry handles missing/undefined usageMetadata as unknown/null",
  () => {
    const event = extractVoiceAiUsageTelemetry(undefined, 2);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 2,
      promptTokenCount: null,
      cachedContentTokenCount: null,
      candidatesTokenCount: null,
      totalTokenCount: null,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry handles null/non-object usageMetadata safely",
  () => {
    const event = extractVoiceAiUsageTelemetry(null, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: null,
      cachedContentTokenCount: null,
      candidatesTokenCount: null,
      totalTokenCount: null,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry handles missing cachedContentTokenCount as unknown/null hit and ratio",
  () => {
    const raw = {
      promptTokenCount: 500,
      candidatesTokenCount: 50,
      totalTokenCount: 550,
    };

    const event = extractVoiceAiUsageTelemetry(raw, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: 500,
      cachedContentTokenCount: null,
      candidatesTokenCount: 50,
      totalTokenCount: 550,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry handles missing promptTokenCount as unknown/null hit and ratio even if cached count present",
  () => {
    const raw = {
      cachedContentTokenCount: 100,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
    };

    const event = extractVoiceAiUsageTelemetry(raw, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: null,
      cachedContentTokenCount: 100,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry handles paired 0 prompt and 0 cached count as observed miss with null ratio",
  () => {
    const raw = {
      promptTokenCount: 0,
      cachedContentTokenCount: 0,
      candidatesTokenCount: 10,
      totalTokenCount: 10,
    };

    const event = extractVoiceAiUsageTelemetry(raw, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: 0,
      cachedContentTokenCount: 0,
      candidatesTokenCount: 10,
      totalTokenCount: 10,
      cacheObservedHit: false,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry rejects malformed contradictory pair (cached > prompt) as null hit and null ratio",
  () => {
    const raw = {
      promptTokenCount: 100,
      cachedContentTokenCount: 200,
      candidatesTokenCount: 50,
      totalTokenCount: 250,
    };

    const event = extractVoiceAiUsageTelemetry(raw, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: 100,
      cachedContentTokenCount: 200,
      candidatesTokenCount: 50,
      totalTokenCount: 250,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry rejects invalid counts across all 4 recognized count fields",
  () => {
    const recognizedFields = [
      "promptTokenCount",
      "cachedContentTokenCount",
      "candidatesTokenCount",
      "totalTokenCount",
    ] as const;

    const invalidTestValues = [
      -1,
      -100,
      12.5,
      0.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 10,
      "100",
      "",
      true,
      false,
      {},
      [],
    ];

    for (const field of recognizedFields) {
      for (const invalidValue of invalidTestValues) {
        const raw = { [field]: invalidValue };
        const event = extractVoiceAiUsageTelemetry(raw, 0);
        assert.equal(
          event[field],
          null,
          `Expected ${field} to be null for invalid value: ${String(invalidValue)}`
        );
      }
    }
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry safely catches throwing getters on usageMetadata fields",
  () => {
    const throwingMetadata = {
      get promptTokenCount(): number {
        throw new Error("getter promptTokenCount error");
      },
      get cachedContentTokenCount(): number {
        throw new Error("getter cachedContentTokenCount error");
      },
      candidatesTokenCount: 100,
      totalTokenCount: 200,
    };

    const event = extractVoiceAiUsageTelemetry(throwingMetadata, 0);

    assert.deepEqual(event, {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: null,
      cachedContentTokenCount: null,
      candidatesTokenCount: 100,
      totalTokenCount: 200,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry normalizes negative or non-integer attempt numbers",
  () => {
    const event1 = extractVoiceAiUsageTelemetry({}, -3);
    assert.equal(event1.attempt, 0);

    const event2 = extractVoiceAiUsageTelemetry({}, 2.7);
    assert.equal(event2.attempt, 2);

    const event3 = extractVoiceAiUsageTelemetry({}, Number.NaN);
    assert.equal(event3.attempt, 0);
  }
);

Deno.test(
  "extractVoiceAiUsageTelemetry rejects arbitrary injected fields and preserves schema-only keys",
  () => {
    const raw = {
      promptTokenCount: 100,
      cachedContentTokenCount: 50,
      audio: "sensitive-audio-buffer",
      text: "transcribed sensitive text",
      userId: "user-123",
      requestKey: "key-456",
      injectedPayload: { secret: true },
    };

    const event = extractVoiceAiUsageTelemetry(raw, 0);

    assert.deepEqual(Object.keys(event).sort(), [
      "attempt",
      "cacheObservedHit",
      "cachedContentTokenCount",
      "cachedInputRatio",
      "candidatesTokenCount",
      "event",
      "model",
      "promptTokenCount",
      "totalTokenCount",
    ]);

    assert.equal("audio" in event, false);
    assert.equal("text" in event, false);
    assert.equal("userId" in event, false);
    assert.equal("requestKey" in event, false);
    assert.equal("injectedPayload" in event, false);
  }
);

Deno.test(
  "logVoiceAiUsageTelemetry accepts lazy reader and emits event with null counts when reader throws",
  () => {
    let callCount = 0;
    const throwingReader = () => {
      callCount++;
      throw new Error("response.usageMetadata getter crashed!");
    };

    const captured: VoiceAiUsageTelemetryEvent[] = [];
    const sink: VoiceAiUsageTelemetrySink = (evt) => {
      captured.push(evt);
    };

    assert.doesNotThrow(() => {
      logVoiceAiUsageTelemetry(throwingReader, 0, sink);
    });

    assert.equal(callCount, 1);
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 0,
      promptTokenCount: null,
      cachedContentTokenCount: null,
      candidatesTokenCount: null,
      totalTokenCount: null,
      cacheObservedHit: null,
      cachedInputRatio: null,
    });
  }
);

Deno.test(
  "logVoiceAiUsageTelemetry swallows sink errors cleanly without throwing",
  () => {
    const throwingSink: VoiceAiUsageTelemetrySink = () => {
      throw new Error("Disk full or log sink crashed");
    };

    assert.doesNotThrow(() => {
      logVoiceAiUsageTelemetry(
        { promptTokenCount: 100, cachedContentTokenCount: 50 },
        0,
        throwingSink
      );
    });
  }
);

Deno.test(
  "logVoiceAiUsageTelemetry delivers exact parsed event to sink",
  () => {
    const captured: VoiceAiUsageTelemetryEvent[] = [];
    const sink: VoiceAiUsageTelemetrySink = (evt) => {
      captured.push(evt);
    };

    logVoiceAiUsageTelemetry(
      () => ({ promptTokenCount: 1000, cachedContentTokenCount: 250 }),
      1,
      sink
    );

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      event: VOICE_AI_USAGE_TELEMETRY_EVENT,
      model: VOICE_AI_USAGE_TELEMETRY_MODEL,
      attempt: 1,
      promptTokenCount: 1000,
      cachedContentTokenCount: 250,
      candidatesTokenCount: null,
      totalTokenCount: null,
      cacheObservedHit: true,
      cachedInputRatio: 0.25,
    });
  }
);
