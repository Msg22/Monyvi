import assert from "node:assert/strict";
import test from "node:test";

import {
  completeSmsAiWork,
  getSmsAiAvailability,
  readSmsAiAvailability,
  markSmsAiProviderStarted,
  reconcileSmsAiOutcomes,
  releaseSmsAiWork,
  reserveSmsAiWork,
} from "./sms-ai-safeguard-service.ts";
import { DEFAULT_SMS_SAFEGUARD_POLICY } from "./sms-safeguard-policy.ts";

interface RpcCall {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

function createClient(results: readonly unknown[]): {
  readonly calls: RpcCall[];
  readonly client: {
    rpc: (
      name: string,
      params: Readonly<Record<string, unknown>>
    ) => Promise<{ data: unknown; error: null }>;
  };
} {
  const calls: RpcCall[] = [];
  let index = 0;
  return {
    calls,
    client: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        const data = results[index];
        index += 1;
        return { data, error: null };
      },
    },
  };
}

test("reserves full-parser work with only server-policy limits", async () => {
  const { client, calls } = createClient([
    [
      {
        request_id: "request-id",
        accepted: true,
        decision_code: "accepted",
        available_at: null,
        is_replay: false,
      },
    ],
  ]);

  const decision = await reserveSmsAiWork(client, {
    userId: "user-id",
    requestKey: "request-key",
    capability: "sms_full_parse",
    scanSessionId: "scan-id",
    scanKind: "history",
    unitCount: 12,
    payloadBytes: 2048,
    estimatedInputTokens: 500,
    requestDigest: "a".repeat(64),
    candidateFingerprints: ["b".repeat(64)],
    policy: DEFAULT_SMS_SAFEGUARD_POLICY,
  });

  assert.equal(decision.accepted, true);
  assert.equal(calls[0]?.name, "sms_ai_reserve_work_v2");
  assert.equal(calls[0]?.params.p_request_digest, "a".repeat(64));
  assert.deepEqual(calls[0]?.params.p_candidate_fingerprints, ["b".repeat(64)]);
  assert.equal(calls[0]?.params.p_max_units_per_scan, 200);
  assert.equal(calls[0]?.params.p_max_units_per_rolling_window, 200);
  assert.equal(calls[0]?.params.p_reservation_lease_seconds, 300);
});

test("uses independent enrichment allowance and no history cooldown claim", async () => {
  const { client, calls } = createClient([
    [
      {
        request_id: "request-id",
        accepted: false,
        decision_code: "rolling_limit",
        available_at: "2026-07-21T00:00:00.000Z",
        is_replay: false,
      },
    ],
  ]);

  await reserveSmsAiWork(client, {
    userId: "user-id",
    requestKey: "request-key",
    capability: "sms_category_enrichment",
    scanSessionId: "scan-id",
    scanKind: "incremental",
    unitCount: 20,
    payloadBytes: 100,
    estimatedInputTokens: 50,
    requestDigest: "c".repeat(64),
    candidateFingerprints: [],
    policy: DEFAULT_SMS_SAFEGUARD_POLICY,
  });

  assert.equal(calls[0]?.params.p_max_units_per_rolling_window, 100);
  assert.equal(calls[0]?.params.p_history_cooldown_seconds, 0);
  assert.equal(calls[0]?.params.p_max_units_per_scan, 0);
});

test("maps only server-returned availability without using client time", () => {
  assert.deepEqual(
    getSmsAiAvailability({
      accepted: false,
      decisionCode: "rolling_limit",
      availableAt: "2026-07-21T00:00:00.000Z",
    }),
    {
      reason: "rolling_limit",
      availableAt: "2026-07-21T00:00:00.000Z",
    }
  );
  assert.deepEqual(
    getSmsAiAvailability({
      accepted: true,
      decisionCode: "accepted",
      availableAt: null,
    }),
    { reason: null, availableAt: null }
  );
});

test("reads aggregate availability through the service-role RPC", async () => {
  const { client, calls } = createClient([
    [
      {
        server_now: "2026-07-20T12:00:00.000Z",
        rolling_available_at: "2026-07-20T12:05:00.000Z",
        burst_available_at: null,
        history_cooldown_available_at: "2026-07-21T12:00:00.000Z",
        available_at: "2026-07-21T12:00:00.000Z",
        reason: "history_cooldown",
      },
    ],
  ]);

  const snapshot = await readSmsAiAvailability(client, {
    userId: "user-id",
    policy: DEFAULT_SMS_SAFEGUARD_POLICY,
  });

  assert.deepEqual(snapshot, {
    serverNow: "2026-07-20T12:00:00.000Z",
    rollingAvailableAt: "2026-07-20T12:05:00.000Z",
    burstAvailableAt: null,
    historyCooldownAvailableAt: "2026-07-21T12:00:00.000Z",
    availableAt: "2026-07-21T12:00:00.000Z",
    reason: "history_cooldown",
  });
  assert.equal(calls[0]?.name, "sms_ai_get_availability");
  assert.equal(calls[0]?.params.p_user_id, "user-id");
  assert.equal(calls[0]?.params.p_max_units_per_rolling_window, 200);
  assert.equal(calls[0]?.params.p_max_provider_starts_per_burst, 30);
  assert.equal(calls[0]?.params.p_history_cooldown_seconds, 86_400);
});

test("maps provider lifecycle and privacy-safe outcome RPCs", async () => {
  const { client, calls } = createClient([
    [
      {
        started: true,
        decision_code: "provider_started",
        terminal_fingerprints: [],
      },
    ],
    true,
    true,
    [],
  ]);

  await markSmsAiProviderStarted(client, "request-id");
  await completeSmsAiWork(client, {
    requestId: "request-id",
    completedWithProviderError: false,
    decisionCode: "complete",
  });
  await releaseSmsAiWork(client, "request-id", "cancelled");
  await reconcileSmsAiOutcomes(client, {
    userId: "user-id",
    positiveFingerprints: ["positive"],
    negativeOutcomes: [
      {
        smsFingerprint: "negative",
        originalReceivedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
  });

  assert.equal(calls[0]?.name, "sms_ai_mark_provider_started_v2");

  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      "sms_ai_mark_provider_started_v2",
      "sms_ai_complete_work",
      "sms_ai_release_work",
      "sms_ai_reconcile_outcomes",
    ]
  );
  assert.equal(JSON.stringify(calls).includes("rawBody"), false);
});
