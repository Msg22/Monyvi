import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileSmsNegativeOutcomes,
  type SmsNegativeOutcomeCandidate,
} from "./sms-negative-outcome-handler.ts";

const submittedCandidates: readonly SmsNegativeOutcomeCandidate[] = [
  {
    messageId: "positive",
    smsFingerprint: "fingerprint-positive",
    originalReceivedAt: "2026-07-20T10:00:00.000Z",
  },
  {
    messageId: "negative",
    smsFingerprint: "fingerprint-negative",
    originalReceivedAt: "2026-07-20T09:00:00.000Z",
  },
  {
    messageId: "omitted",
    smsFingerprint: "fingerprint-omitted",
    originalReceivedAt: "2026-07-20T08:00:00.000Z",
  },
];

function createRpcClient(): {
  readonly calls: Array<{
    readonly name: string;
    readonly params: Readonly<Record<string, unknown>>;
  }>;
  readonly client: {
    readonly rpc: (
      name: string,
      params: Readonly<Record<string, unknown>>
    ) => Promise<{ readonly data: readonly []; readonly error: null }>;
  };
} {
  const calls: Array<{
    readonly name: string;
    readonly params: Readonly<Record<string, unknown>>;
  }> = [];
  return {
    calls,
    client: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: [], error: null };
      },
    },
  };
}

test("persists explicit and omitted negatives only for a complete valid response", async () => {
  const { client, calls } = createRpcClient();

  const result = await reconcileSmsNegativeOutcomes({
    client,
    userId: "user-id",
    submittedCandidates,
    envelope: {
      requestId: "request-id",
      completionStatus: "complete",
      transactions: [
        { messageId: "positive", isTrusted: true },
        { messageId: "negative", isTrusted: false },
      ],
    },
  });

  assert.deepEqual(result, {
    status: "reconciled",
    positiveFingerprints: ["fingerprint-positive"],
    negativeFingerprints: ["fingerprint-negative", "fingerprint-omitted"],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "sms_ai_reconcile_outcomes");
  assert.deepEqual(calls[0]?.params.p_positive_fingerprints, [
    "fingerprint-positive",
  ]);
  assert.deepEqual(calls[0]?.params.p_negative_outcomes, [
    {
      smsFingerprint: "fingerprint-negative",
      originalReceivedAt: "2026-07-20T09:00:00.000Z",
    },
    {
      smsFingerprint: "fingerprint-omitted",
      originalReceivedAt: "2026-07-20T08:00:00.000Z",
    },
  ]);
});

for (const invalidCase of [
  {
    name: "truncated completion",
    envelope: {
      requestId: "request-id",
      completionStatus: "truncated" as const,
      transactions: [],
    },
    reason: "incomplete_response",
  },
  {
    name: "unknown response identity",
    envelope: {
      requestId: "request-id",
      completionStatus: "complete" as const,
      transactions: [{ messageId: "unknown", isTrusted: false }],
    },
    reason: "unknown_response_identity",
  },
  {
    name: "duplicate response identity",
    envelope: {
      requestId: "request-id",
      completionStatus: "complete" as const,
      transactions: [
        { messageId: "positive", isTrusted: false },
        { messageId: "positive", isTrusted: false },
      ],
    },
    reason: "duplicate_response_identity",
  },
] as const) {
  test(`creates no strike for ${invalidCase.name}`, async () => {
    const { client, calls } = createRpcClient();

    const result = await reconcileSmsNegativeOutcomes({
      client,
      userId: "user-id",
      submittedCandidates,
      envelope: invalidCase.envelope,
    });

    assert.deepEqual(result, {
      status: "ignored",
      reason: invalidCase.reason,
      positiveFingerprints: [],
      negativeFingerprints: [],
    });
    assert.equal(calls.length, 0);
  });
}

test("rejects duplicate submitted message identities without writing outcomes", async () => {
  const { client, calls } = createRpcClient();

  const result = await reconcileSmsNegativeOutcomes({
    client,
    userId: "user-id",
    submittedCandidates: [submittedCandidates[0], submittedCandidates[0]],
    envelope: {
      requestId: "request-id",
      completionStatus: "complete",
      transactions: [],
    },
  });

  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "duplicate_submitted_identity");
  assert.equal(calls.length, 0);
});

test("never passes message content or financial values to reconciliation storage", async () => {
  const { client, calls } = createRpcClient();

  await reconcileSmsNegativeOutcomes({
    client,
    userId: "user-id",
    submittedCandidates,
    envelope: {
      requestId: "request-id",
      completionStatus: "complete",
      transactions: [],
    },
  });

  const serializedCalls = JSON.stringify(calls);
  assert.doesNotMatch(serializedCalls, /body|sender|amount|merchant|category/i);
});
