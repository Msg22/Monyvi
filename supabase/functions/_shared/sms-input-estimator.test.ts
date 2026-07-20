import assert from "node:assert/strict";
import test from "node:test";

import {
  canFitSmsCandidateAtEdge,
  estimateSmsRequestInputTokensAtEdge,
  getUtf8ByteLengthAtEdge,
} from "./sms-input-estimator.ts";

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
