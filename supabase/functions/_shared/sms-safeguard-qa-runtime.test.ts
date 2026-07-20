import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertLocalSafeguardQaRuntime,
  parseSafeguardQaRequestMetadata,
} from "./sms-safeguard-qa-runtime.ts";

test("accepts only explicitly enabled local Supabase runtimes", () => {
  assert.doesNotThrow(() =>
    assertLocalSafeguardQaRuntime({
      isEnabled: "true",
      supabaseUrl: "http://kong:8000",
    })
  );
  assert.throws(
    () =>
      assertLocalSafeguardQaRuntime({
        isEnabled: "false",
        supabaseUrl: "http://kong:8000",
      }),
    /disabled/i
  );
  assert.throws(
    () =>
      assertLocalSafeguardQaRuntime({
        isEnabled: "true",
        supabaseUrl: "https://project.supabase.co",
      }),
    /local/i
  );
});

test("requires matching named profile and per-launch run identity", () => {
  const metadata = parseSafeguardQaRequestMetadata(
    new Request("http://localhost", {
      method: "POST",
      headers: { "x-sms-safeguard-qa-run-id": "run-123" },
    }),
    {
      qaProfileId: "partial-quota-v1",
      qaRunId: "run-123",
    }
  );

  assert.deepEqual(metadata, {
    profileId: "partial-quota-v1",
    runId: "run-123",
  });
  assert.throws(
    () =>
      parseSafeguardQaRequestMetadata(
        new Request("http://localhost", {
          headers: { "x-sms-safeguard-qa-run-id": "different" },
        }),
        { qaProfileId: "partial-quota-v1", qaRunId: "run-123" }
      ),
    /run identity/i
  );
  assert.throws(
    () =>
      parseSafeguardQaRequestMetadata(new Request("http://localhost"), {
        qaProfileId: "unknown-profile",
        qaRunId: "run-123",
      }),
    /profile/i
  );
});

test("the local QA endpoint cannot import or configure a production AI provider", () => {
  const source = readFileSync(
    new URL("../sms-safeguard-qa/index.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /GEMINI_API_KEY|generativelanguage|generateContent/i
  );
  assert.match(source, /executeSafeguardQaProvider/);
  assert.match(source, /assertLocalSafeguardQaRuntime/);
});
