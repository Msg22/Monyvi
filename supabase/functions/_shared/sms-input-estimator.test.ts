import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmsProviderUserPromptAtEdge,
  canFitSmsCandidateAtEdge,
  estimateSmsRequestInputTokensAtEdge,
  getUtf8ByteLengthAtEdge,
} from "./sms-input-estimator.ts";

test("serializes the exact user prompt framing sent to the SMS provider", () => {
  assert.equal(
    buildSmsProviderUserPromptAtEdge([
      {
        id: "message-1",
        sender: "QNB EGYPT",
        date: "2026-07-21T10:00:00.000Z",
        body: "Purchase EGP 100",
      },
    ]),
    "Parse the following 1 SMS messages into transactions:\n\n--- MESSAGE ID: message-1 ---\nSender: QNB EGYPT\nDate: 2026-07-21T10:00:00.000Z\nBody: Purchase EGP 100\n"
  );
});

test("counts UTF-8 payload bytes rather than JavaScript code units", () => {
  assert.equal(getUtf8ByteLengthAtEdge("EGP"), 3);
  assert.equal(getUtf8ByteLengthAtEdge("جنيه"), 8);
});

test("returns a conservative decomposed input estimate", () => {
  const estimate = estimateSmsRequestInputTokensAtEdge({
    prompt: "parse",
    categories: "food,transport",
    schema: "transactions",
    messages: ["عملية شراء بقيمة 100 جنيه"],
  });

  assert.ok(estimate.promptTokens > 0);
  assert.ok(estimate.categoryTokens > 0);
  assert.ok(estimate.schemaTokens > 0);
  assert.ok(estimate.candidateTokens > 0);
  assert.equal(
    estimate.totalTokens,
    estimate.promptTokens +
      estimate.categoryTokens +
      estimate.schemaTokens +
      estimate.candidateTokens
  );
});

test("accepts an exact byte/token boundary and rejects one byte over it", () => {
  assert.deepEqual(
    canFitSmsCandidateAtEdge({
      candidatePayload: "abc",
      fixedPayloadBytes: 7,
      fixedInputTokens: 2,
      maxPayloadBytes: 10,
      maxInputTokens: 3,
    }),
    { fits: true }
  );

  assert.deepEqual(
    canFitSmsCandidateAtEdge({
      candidatePayload: "abcd",
      fixedPayloadBytes: 7,
      fixedInputTokens: 2,
      maxPayloadBytes: 10,
      maxInputTokens: 4,
    }),
    { fits: false, reason: "candidate_too_large" }
  );
});
