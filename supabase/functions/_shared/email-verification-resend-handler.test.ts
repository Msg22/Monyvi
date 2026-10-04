import assert from "node:assert/strict";
import test from "node:test";

import {
  computeEmailVerificationKey,
  handleEmailVerificationResendRequest,
  normalizeVerificationEmail,
  type EmailVerificationResendDependencies,
  type EmailVerificationReservation,
} from "./email-verification-resend-handler.ts";

const EMAIL = "User@Example.com";
const NORMALIZED_EMAIL = "user@example.com";
const KEY = "a".repeat(64);
const NOW = new Date("2026-10-04T10:00:00.000Z");

function createDependencies(
  overrides: Partial<EmailVerificationResendDependencies> = {}
): EmailVerificationResendDependencies {
  return {
    pepper: "test-pepper-that-is-long-enough-for-tests",
    now: () => NOW,
    registerInitial: async () => true,
    reserveResend: async (): Promise<EmailVerificationReservation> => ({
      accepted: true,
      decisionCode: "accepted",
      reservationId: "11111111-1111-4111-8111-111111111111",
      availableAt: null,
    }),
    sendResend: async () => ({ success: true }),
    finalizeResend: async () => true,
    releaseResend: async () => true,
    computeEmailKey: async () => KEY,
    ...overrides,
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("normalizes email without retaining whitespace/case", () => {
  assert.equal(normalizeVerificationEmail("  USER@Example.COM "), NORMALIZED_EMAIL);
});

test("HMAC key is deterministic and does not expose raw email", async () => {
  const first = await computeEmailVerificationKey(
    NORMALIZED_EMAIL,
    "pepper-321"
  );
  const second = await computeEmailVerificationKey(
    NORMALIZED_EMAIL,
    "pepper-321"
  );

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first.includes("user"), false);
  assert.notEqual(
    first,
    await computeEmailVerificationKey(NORMALIZED_EMAIL, "different-pepper")
  );
});

test("register_initial delegates with normalized email and privacy-safe key", async () => {
  const calls: unknown[] = [];
  const response = await handleEmailVerificationResendRequest(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ operation: "register_initial", email: EMAIL }),
    }),
    createDependencies({
      registerInitial: async (input) => {
        calls.push(input);
        return true;
      },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { status: "ok" });
  assert.deepEqual(calls, [{ email: NORMALIZED_EMAIL, emailKey: KEY }]);
});

test("successful resend reserves, sends, and finalizes once", async () => {
  const calls: string[] = [];
  const response = await handleEmailVerificationResendRequest(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ operation: "resend", email: EMAIL }),
    }),
    createDependencies({
      reserveResend: async () => {
        calls.push("reserve");
        return {
          accepted: true,
          decisionCode: "accepted",
          reservationId: "11111111-1111-4111-8111-111111111111",
          availableAt: null,
        };
      },
      sendResend: async (email) => {
        calls.push(`send:${email}`);
        return { success: true };
      },
      finalizeResend: async () => {
        calls.push("finalize");
        return true;
      },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "reserve",
    `send:${NORMALIZED_EMAIL}`,
    "finalize",
  ]);
  assert.deepEqual(await json(response), {
    status: "sent",
    sentAt: "2026-10-04T10:00:00.000Z",
    resendAvailableAt: "2026-10-04T10:02:00.000Z",
    verificationExpiresAt: "2026-10-04T10:10:00.000Z",
  });
});

test("downstream resend failure releases reservation without finalizing", async () => {
  const calls: string[] = [];
  const response = await handleEmailVerificationResendRequest(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ operation: "resend", email: EMAIL }),
    }),
    createDependencies({
      sendResend: async () => {
        calls.push("send");
        return { success: false, errorCode: "provider_failure" };
      },
      finalizeResend: async () => {
        calls.push("finalize");
        return true;
      },
      releaseResend: async () => {
        calls.push("release");
        return true;
      },
    })
  );

  assert.deepEqual(calls, ["send", "release"]);
  assert.deepEqual(await json(response), { status: "temporary_failure" });
});

test("cooldown and limit decisions do not call the provider", async () => {
  let sendCalls = 0;
  for (const reservation of [
    {
      accepted: false,
      decisionCode: "cooldown",
      reservationId: null,
      availableAt: "2026-10-04T10:01:30.000Z",
    },
    {
      accepted: false,
      decisionCode: "limit",
      reservationId: null,
      availableAt: "2026-10-05T09:00:00.000Z",
    },
  ] satisfies EmailVerificationReservation[]) {
    const response = await handleEmailVerificationResendRequest(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ operation: "resend", email: EMAIL }),
      }),
      createDependencies({
        reserveResend: async () => reservation,
        sendResend: async () => {
          sendCalls += 1;
          return { success: true };
        },
      })
    );

    const body = await json(response);
    assert.equal(body.status, reservation.decisionCode);
    assert.equal(body.retryAt, reservation.availableAt);
  }

  assert.equal(sendCalls, 0);
});

test("not_pending response is enumeration-safe and provider-free", async () => {
  let sendCalls = 0;
  const response = await handleEmailVerificationResendRequest(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ operation: "resend", email: "missing@example.com" }),
    }),
    createDependencies({
      reserveResend: async () => ({
        accepted: false,
        decisionCode: "not_pending",
        reservationId: null,
        availableAt: null,
      }),
      sendResend: async () => {
        sendCalls += 1;
        return { success: true };
      },
    })
  );

  assert.equal(sendCalls, 0);
  const body = await json(response);
  assert.equal(body.status, "sent");
  assert.equal(typeof body.sentAt, "string");
});

test("invalid payload is rejected without echoing email", async () => {
  const response = await handleEmailVerificationResendRequest(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ operation: "resend", email: "not-an-email" }),
    }),
    createDependencies()
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await json(response), { status: "invalid_request" });
});
