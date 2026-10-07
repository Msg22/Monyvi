import {
  isExcludedBeforeSmsParsing,
  isLikelyFinancialSms,
} from "../sms-keyword-filter";

describe("SMS keyword filter", () => {
  it("does not treat InstaPay as a generic financial keyword", () => {
    expect(isLikelyFinancialSms("InstaPay reference 12345")).toBe(false);
  });

  it("still detects ordinary financial messages with amounts and currency", () => {
    expect(
      isLikelyFinancialSms("Purchase EGP 120.50 from card ending 1234")
    ).toBe(true);
  });

  it.each([
    "اكسب",
    "حجز",
    "ادفع",
    "اتبرع",
    "كاش باك",
    "موعد",
    "كهرباء",
    "غاز",
    "مياه",
  ])(
    "hard-excludes trusted-sender messages containing %s before parsing",
    (phrase) => {
      expect(
        isExcludedBeforeSmsParsing(
          `QNB EGYPT ${phrase} الآن، عرض بقيمة EGP 125.50`
        )
      ).toBe(true);
    }
  );

  it("normalizes Arabic alef variants, diacritics, tatweel, and whitespace", () => {
    expect(isExcludedBeforeSmsParsing("إِكْسَــب الآن")).toBe(true);
    expect(isExcludedBeforeSmsParsing("عرض كاش   باك اليوم")).toBe(true);
  });

  it("keeps ordinary completed financial messages eligible", () => {
    expect(
      isExcludedBeforeSmsParsing(
        "Your Debit Card **2132 had a Successful transaction of EGP 125.50 @MARKET"
      )
    ).toBe(false);
  });
  it.each([
    "OTP ABC123 to authorize purchase EGP 500",
    "OTP to authorize purchase EGP 500",
    "PIN reset request for card 1234",
  ])(
    "hard-excludes explicit security markers without requiring adjacent numeric codes: %s",
    (body) => {
      expect(isExcludedBeforeSmsParsing(body)).toBe(true);
    }
  );

  it.each([
    "Purchase of EGP 250.00 at CARREFOUR using card **1234 was successful. Never share your verification code.",
    "EGP 100 deducted from your card. Never share your verification code.",
    "You have paid EGP 100 at SHOP. Never share your security code.",
  ])(
    "keeps clearly completed money movement eligible despite security warnings: %s",
    (body) => {
      expect(isExcludedBeforeSmsParsing(body)).toBe(false);
    }
  );

  it.each([
    "Your verification code is ABC123 for EGP 250.00.",
    "Payment EGP 100 will be completed after verification code ABC123.",
    "Confirm payment EGP 100 before using verification code ABC123.",
    "Payment EGP 100 was not completed. verification code ABC123.",
  ])(
    "does not treat amount/currency, future, authorization, or negated wording as completed movement: %s",
    (body) => {
      expect(isExcludedBeforeSmsParsing(body)).toBe(true);
    }
  );
});
