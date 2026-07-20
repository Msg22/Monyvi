import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSmsAiAvailabilityRequest,
  type SmsAiAvailabilityHandlerDependencies,
} from "./sms-ai-availability-handler.ts";

const snapshot = {
  serverNow: "2026-07-20T12:00:00.000Z",
  rollingAvailableAt: "2026-07-20T12:05:00.000Z",
  burstAvailableAt: null,
  historyCooldownAvailableAt: "2026-07-21T12:00:00.000Z",
  availableAt: "2026-07-21T12:00:00.000Z",
  reason: "history_cooldown",
} as const;

function createDependencies(
  overrides: Partial<SmsAiAvailabilityHandlerDependencies> = {}
): SmsAiAvailabilityHandlerDependencies {
  return {
    authenticate: async () => "user-id",
    hasConsent: async () => true,
    getAvailability: async () => snapshot,
    ...overrides,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("returns server time and combined blockers for an authenticated consented user", async () => {
  const response = await handleSmsAiAvailabilityRequest(
    new Request("https://example.test/sms-ai-availability", {
      headers: { authorization: "Bearer token" },
    }),
    createDependencies()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    serverNow: snapshot.serverNow,
    blockers: {
      rolling: { availableAt: snapshot.rollingAvailableAt },
      burst: { availableAt: snapshot.burstAvailableAt },
      historyCooldown: { availableAt: snapshot.historyCooldownAvailableAt },
    },
    reason: snapshot.reason,
    availableAt: snapshot.availableAt,
  });
});

test("fails closed before consent and does not call the availability RPC", async () => {
  let availabilityCalls = 0;
  const response = await handleSmsAiAvailabilityRequest(
    new Request("https://example.test/sms-ai-availability", {
      headers: { authorization: "Bearer token" },
    }),
    createDependencies({
      hasConsent: async () => false,
      getAvailability: async () => {
        availabilityCalls += 1;
        return snapshot;
      },
    })
  );

  assert.equal(response.status, 403);
  assert.equal(availabilityCalls, 0);
  assert.deepEqual(await readJson(response), {
    serverNow: null,
    blockers: null,
    reason: "consent_required",
    availableAt: null,
  });
});

test("rejects unauthenticated and non-GET requests without ledger access", async () => {
  let availabilityCalls = 0;
  const dependencies = createDependencies({
    authenticate: async () => null,
    getAvailability: async () => {
      availabilityCalls += 1;
      return snapshot;
    },
  });

  const unauthorized = await handleSmsAiAvailabilityRequest(
    new Request("https://example.test/sms-ai-availability"),
    dependencies
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(availabilityCalls, 0);

  const methodNotAllowed = await handleSmsAiAvailabilityRequest(
    new Request("https://example.test/sms-ai-availability", { method: "POST" }),
    createDependencies({
      getAvailability: async () => {
        availabilityCalls += 1;
        return snapshot;
      },
    })
  );
  assert.equal(methodNotAllowed.status, 405);
  assert.equal(availabilityCalls, 0);
});

test("never returns or logs ledger, payload, or fingerprint fields", async () => {
  const response = await handleSmsAiAvailabilityRequest(
    new Request("https://example.test/sms-ai-availability", {
      headers: { authorization: "Bearer token" },
    }),
    createDependencies()
  );
  const serialized = JSON.stringify(await readJson(response));

  for (const forbiddenField of [
    "sms_ai_work_requests",
    "sms_ai_usage_events",
    "request_id",
    "smsFingerprint",
    "rawBody",
    "merchant",
    "amount",
  ]) {
    assert.equal(serialized.includes(forbiddenField), false, forbiddenField);
  }
});
