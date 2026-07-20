import assert from "node:assert/strict";
import test from "node:test";

import { logSmsAiOperationalResponse } from "./sms-ai-operational-telemetry.ts";

test("logs only capability, status, and privacy-safe decision code", async () => {
  const values: unknown[] = [];
  const response = new Response(
    JSON.stringify({
      reason: "rolling_limit",
      rawSmsBody: "secret",
      sender: "BANK",
      amount: 100,
      smsFingerprint: "private",
    }),
    { status: 429 }
  );

  await logSmsAiOperationalResponse("sms_full_parse", response, (...args) =>
    values.push(...args)
  );

  assert.deepEqual(values, [
    "smsAi.operational",
    {
      capability: "sms_full_parse",
      status: 429,
      decisionCode: "rolling_limit",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(values), /secret|BANK|100|private/);
});

test("separates category enrichment and falls back to HTTP status safely", async () => {
  const values: unknown[] = [];
  await logSmsAiOperationalResponse(
    "sms_category_enrichment",
    new Response("not-json", { status: 502 }),
    (...args) => values.push(...args)
  );

  assert.deepEqual(values, [
    "smsAi.operational",
    {
      capability: "sms_category_enrichment",
      status: 502,
      decisionCode: "http_502",
    },
  ]);
});
