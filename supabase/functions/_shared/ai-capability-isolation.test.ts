import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const VOICE_ENTRY_PATH = new URL("../parse-voice/index.ts", import.meta.url);

test("voice Edge parsing does not import SMS safeguard policy or ledgers", async () => {
  const source = await readFile(VOICE_ENTRY_PATH, "utf8");

  assert.doesNotMatch(source, /sms-safeguard-policy/);
  assert.doesNotMatch(source, /sms-ai-safeguard-service/);
  assert.doesNotMatch(source, /sms_ai_(work_requests|usage_events)/);
  assert.doesNotMatch(source, /SMS_(FULL_PARSER|CATEGORY_ENRICHMENT)_ENABLED/);
});
