import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSmsProviderCompletionEnvelope,
  reconcileSmsProviderCompletionAtEdge,
} from "./sms-provider-completion.ts";

test("parses a complete identity-safe completion envelope", () => {
  const envelope = parseSmsProviderCompletionEnvelope({
    requestId: "request-id",
    completionStatus: "complete",
    transactions: [
      { messageId: "positive", isTrusted: true },
      { messageId: "negative", isTrusted: false },
    ],
  });

  assert.deepEqual(
    reconcileSmsProviderCompletionAtEdge({
      submittedMessageIds: ["positive", "negative", "omitted"],
      envelope,
    }),
    {
      isValid: true,
      positiveMessageIds: ["positive"],
      negativeMessageIds: ["negative", "omitted"],
    }
  );
});

test("does not create negatives from incomplete or malformed identity results", () => {
  assert.deepEqual(
    reconcileSmsProviderCompletionAtEdge({
      submittedMessageIds: ["a"],
      envelope: parseSmsProviderCompletionEnvelope({
        requestId: "request-id",
        completionStatus: "truncated",
        transactions: [],
      }),
    }),
    {
      isValid: false,
      reason: "incomplete_response",
      positiveMessageIds: [],
      negativeMessageIds: [],
    }
  );

  assert.throws(
    () =>
      parseSmsProviderCompletionEnvelope({
        requestId: "request-id",
        completionStatus: "complete",
        transactions: [{ messageId: "a", isTrusted: "yes" }],
      }),
    /Invalid SMS provider completion envelope/
  );
});
