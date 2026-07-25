import assert from "node:assert/strict";
import test from "node:test";

import type { ExecuteSmsProviderInput } from "./parse-sms-handler.ts";
import {
  executeSafeguardQaProvider,
  SAFEGUARD_QA_PROVIDER_OUTCOMES,
  SafeguardQaProviderError,
} from "./sms-safeguard-qa-provider.ts";

const INPUT: ExecuteSmsProviderInput = {
  messages: [
    {
      id: "message-1",
      body: "QA fixture transaction",
      sender: "QA BANK",
      date: "2026-07-20T12:00:00.000Z",
      smsFingerprint: "a".repeat(64),
    },
  ],
  categories: "L1: other",
  supportedCurrencies: ["EGP"],
};

test("declares every approved deterministic provider outcome", () => {
  assert.deepEqual(SAFEGUARD_QA_PROVIDER_OUTCOMES, [
    "trusted-success",
    "low-confidence-success",
    "explicit-negative",
    "omission",
    "retryable-failure",
    "permanent-failure",
    "malformed",
    "incomplete",
    "invalid-identity",
    "duplicate-identity",
    "delay",
    "cancelled",
  ]);
});

test("returns trusted, low-confidence, explicit-negative, and omitted results", async () => {
  const trusted = await executeSafeguardQaProvider("trusted-success", INPUT);
  const lowConfidence = await executeSafeguardQaProvider(
    "low-confidence-success",
    INPUT
  );
  const explicitNegative = await executeSafeguardQaProvider(
    "explicit-negative",
    INPUT
  );
  const omitted = await executeSafeguardQaProvider("omission", INPUT);

  assert.equal(trusted.transactions[0]?.isTrusted, true);
  assert.equal(trusted.transactions[0]?.confidenceScore, 0.95);
  assert.equal(lowConfidence.transactions[0]?.isTrusted, true);
  assert.equal(lowConfidence.transactions[0]?.confidenceScore, 0.3);
  assert.equal(explicitNegative.transactions[0]?.isTrusted, false);
  assert.deepEqual(omitted.transactions, []);
});

test("returns malformed, incomplete, unknown, and duplicate identities without inventing success", async () => {
  const malformed = await executeSafeguardQaProvider("malformed", INPUT);
  const incomplete = await executeSafeguardQaProvider("incomplete", INPUT);
  const invalidIdentity = await executeSafeguardQaProvider(
    "invalid-identity",
    INPUT
  );
  const duplicateIdentity = await executeSafeguardQaProvider(
    "duplicate-identity",
    INPUT
  );

  assert.equal(malformed.isResponseSchemaValid, false);
  assert.equal(incomplete.completionStatus, "truncated");
  assert.equal(
    invalidIdentity.transactions[0]?.messageId,
    "unknown-simulated-message"
  );
  assert.equal(duplicateIdentity.transactions.length, 2);
  assert.equal(
    duplicateIdentity.transactions[0]?.messageId,
    duplicateIdentity.transactions[1]?.messageId
  );
});

test("distinguishes retryable, permanent, and cancelled provider failures", async () => {
  for (const outcome of [
    "retryable-failure",
    "permanent-failure",
    "cancelled",
  ] as const) {
    await assert.rejects(
      executeSafeguardQaProvider(outcome, INPUT),
      (error: unknown) =>
        error instanceof SafeguardQaProviderError && error.outcome === outcome
    );
  }
});

test("uses an injected delay without reaching a production provider", async () => {
  const delays: number[] = [];
  const result = await executeSafeguardQaProvider("delay", INPUT, {
    sleep: (delayMs) => {
      delays.push(delayMs);
      return Promise.resolve();
    },
  });

  assert.deepEqual(delays, [25]);
  assert.equal(result.transactions[0]?.isTrusted, true);
});
