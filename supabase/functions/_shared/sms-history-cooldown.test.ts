import assert from "node:assert/strict";
import test from "node:test";

import {
  getSmsHistoryCooldownState,
  type SmsHistoryCooldownInput,
} from "./sms-history-cooldown.ts";

const baseInput: SmsHistoryCooldownInput = {
  capability: "sms_full_parse",
  scanKind: "history",
  serverNow: "2026-07-20T12:00:00.000Z",
  existingStartedAt: null,
  providerStartedAt: null,
  cooldownMs: 24 * 60 * 60 * 1000,
};

test("local-only history and cancellation before admission do not start cooldown", () => {
  assert.deepEqual(getSmsHistoryCooldownState(baseInput), {
    startedAt: null,
    availableAt: null,
  });
  assert.deepEqual(
    getSmsHistoryCooldownState({
      ...baseInput,
      scanKind: "history",
      providerStartedAt: null,
    }),
    { startedAt: null, availableAt: null }
  );
});

test("first full-parser provider start starts cooldown even when provider fails", () => {
  assert.deepEqual(
    getSmsHistoryCooldownState({
      ...baseInput,
      providerStartedAt: "2026-07-20T12:00:01.000Z",
    }),
    {
      startedAt: "2026-07-20T12:00:01.000Z",
      availableAt: "2026-07-21T12:00:01.000Z",
    }
  );
});

test("incremental work remains available and cannot start history cooldown", () => {
  assert.deepEqual(
    getSmsHistoryCooldownState({
      ...baseInput,
      scanKind: "incremental",
      providerStartedAt: "2026-07-20T12:00:01.000Z",
    }),
    { startedAt: null, availableAt: null }
  );
});

test("replay is idempotent and preserves the original cooldown start", () => {
  assert.deepEqual(
    getSmsHistoryCooldownState({
      ...baseInput,
      existingStartedAt: "2026-07-20T12:00:01.000Z",
      providerStartedAt: "2026-07-20T12:10:01.000Z",
    }),
    {
      startedAt: "2026-07-20T12:00:01.000Z",
      availableAt: "2026-07-21T12:00:01.000Z",
    }
  );
});
