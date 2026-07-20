import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("server safeguard contracts contain no financial payload fields or logs", () => {
  const root = path.resolve(__dirname, "../../..");
  const source = [
    "supabase/functions/_shared/sms-ai-safeguard-contract.ts",
    "supabase/functions/_shared/sms-ai-safeguard-service.ts",
    "supabase/migrations/061_sms_ai_safeguards.sql",
  ]
    .map((file) => readFileSync(path.join(root, file), "utf8"))
    .join("\n");

  for (const field of [
    "raw_sms",
    "sms_body",
    "sender_name",
    "merchant_name",
    "category_id",
    "account_id",
    "card_last_4",
    "provider_response",
  ]) {
    assert.equal(
      source.includes(field),
      false,
      `${field} must not be persisted`
    );
  }
  assert.equal(/console\.(?:log|info|warn|error)/.test(source), false);
});
