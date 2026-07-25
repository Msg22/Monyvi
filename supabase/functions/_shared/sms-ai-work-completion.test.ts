import assert from "node:assert/strict";
import test from "node:test";

import { completeSmsAiWorkWithRetry } from "./sms-ai-work-completion.ts";

const COMPLETION_INPUT = {
  requestId: "request-1",
  completedWithProviderError: false,
  decisionCode: "complete",
} as const;

test("stops retrying after the bounded completion attempt limit", async () => {
  let attempts = 0;

  const didComplete = await completeSmsAiWorkWithRetry(async () => {
    attempts += 1;
    return false;
  }, COMPLETION_INPUT);

  assert.equal(didComplete, false);
  assert.equal(attempts, 3);
});
