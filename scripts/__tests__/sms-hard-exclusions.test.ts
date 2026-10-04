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

test("Edge and shared hard exclusions agree on security markers and completed movement warnings", () => {
  const cases = [
    {
      body: "OTP ABC123 to authorize purchase EGP 500",
      excluded: true,
    },
    {
      body: "OTP to authorize purchase EGP 500",
      excluded: true,
    },
    {
      body: "PIN reset request for card 1234",
      excluded: true,
    },
    {
      body: "Purchase of EGP 250.00 at CARREFOUR using card **1234 was successful. Never share your verification code.",
      excluded: false,
    },
    {
      body: "EGP 100 deducted from your card. Never share your verification code.",
      excluded: false,
    },
    {
      body: "You have paid EGP 100 at SHOP. Never share your security code.",
      excluded: false,
    },
    {
      body: "Your verification code is ABC123 for EGP 250.00.",
      excluded: true,
    },
    {
      body: "Payment EGP 100 will be completed after verification code ABC123.",
      excluded: true,
    },
    {
      body: "Confirm payment EGP 100 before using verification code ABC123.",
      excluded: true,
    },
    {
      body: "Payment EGP 100 was not completed. verification code ABC123.",
      excluded: true,
    },
  ] as const;

  for (const scenario of cases) {
    assert.equal(
      isExcludedBeforeSmsParsing(scenario.body),
      scenario.excluded,
      `shared: ${scenario.body}`
    );
    assert.equal(
      isExcludedBeforeSmsParsingAtEdge(scenario.body),
      scenario.excluded,
      `edge: ${scenario.body}`
    );
    assert.equal(
      isExcludedBeforeSmsParsingAtEdge(scenario.body),
      isExcludedBeforeSmsParsing(scenario.body),
      `parity: ${scenario.body}`
    );
  }
});
