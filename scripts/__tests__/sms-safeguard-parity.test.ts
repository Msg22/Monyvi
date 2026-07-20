import assert from "node:assert/strict";
import test from "node:test";

import {
  canFitSmsCandidate,
  DEFAULT_SMS_SCAN_POLICY,
  estimateSmsRequestInputTokens,
  getUtf8ByteLength,
} from "../../packages/logic/src/sms-safeguards/index.ts";
import {
  canFitSmsCandidateAtEdge,
  estimateSmsRequestInputTokensAtEdge,
  getUtf8ByteLengthAtEdge,
} from "../../supabase/functions/_shared/sms-input-estimator.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from "../../supabase/functions/_shared/sms-safeguard-policy.ts";

test("mobile and Edge safeguard policies are identical", () => {
  assert.deepEqual(DEFAULT_SMS_SAFEGUARD_POLICY, DEFAULT_SMS_SCAN_POLICY);
});

test("mobile and Edge input estimators make identical decisions", () => {
  const estimateInput = {
    prompt: "Parse financial SMS",
    categories: "food,transport",
    schema: "transactions",
    messages: ["خصم ١٠٠ جنيه", "EGP 50 purchase"],
  };
  const fitInput = {
    candidatePayload: "عملية شراء بقيمة 100 جنيه",
    fixedPayloadBytes: 1024,
    fixedInputTokens: 100,
    maxPayloadBytes: 128 * 1024,
    maxInputTokens: 32_000,
  };

  assert.equal(
    getUtf8ByteLengthAtEdge(estimateInput.messages[0]),
    getUtf8ByteLength(estimateInput.messages[0])
  );
  assert.deepEqual(
    estimateSmsRequestInputTokensAtEdge(estimateInput),
    estimateSmsRequestInputTokens(estimateInput)
  );
  assert.deepEqual(
    canFitSmsCandidateAtEdge(fitInput),
    canFitSmsCandidate(fitInput)
  );
});
