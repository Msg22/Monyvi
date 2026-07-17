import assert from "node:assert/strict";
import test from "node:test";
import { isExcludedBeforeSmsParsing } from "../../packages/logic/src/parsers/sms-keyword-filter";
import { isExcludedBeforeSmsParsingAtEdge } from "../../supabase/functions/_shared/sms-hard-exclusions";

test("Edge SMS parsing blocks every configured hard-exclusion phrase", () => {
  const excludedPhrases = [
    "اكسب",
    "حجز",
    "ادفع",
    "اتبرع",
    "كاش باك",
    "موعد",
    "كهرباء",
    "غاز",
    "مياه",
  ];

  for (const phrase of excludedPhrases) {
    assert.equal(
      isExcludedBeforeSmsParsingAtEdge(`QNB EGYPT ${phrase} EGP 100`),
      true
    );
    assert.equal(
      isExcludedBeforeSmsParsingAtEdge(`QNB EGYPT ${phrase} EGP 100`),
      isExcludedBeforeSmsParsing(`QNB EGYPT ${phrase} EGP 100`)
    );
  }
});

test("Edge SMS parsing keeps ordinary completed transactions", () => {
  assert.equal(
    isExcludedBeforeSmsParsingAtEdge(
      "Your Debit Card **2132 had a Successful transaction of EGP 490.00"
    ),
    false
  );
});
