import assert from "node:assert/strict";
import test from "node:test";
import { buildSmsParserSpecialCaseRules } from "../../supabase/functions/_shared/sms-parser-special-cases";

test("describes the approved transfer-request exception without real financial values", () => {
  const rules = buildSmsParserSpecialCaseRules();

  assert.match(rules, /You have requested a transfer of : <AMOUNT> <CURRENCY>/);
  assert.match(rules, /Sender.*exactly.*QNB EGYPT/i);
  assert.match(rules, /other sender/i);
  assert.match(rules, /EXPENSE/);
  assert.match(rules, /isTrusted=true/);
  assert.match(rules, /needs review/i);
  assert.match(rules, /counterparty=""/);
  assert.doesNotMatch(rules, /132129/);
});
