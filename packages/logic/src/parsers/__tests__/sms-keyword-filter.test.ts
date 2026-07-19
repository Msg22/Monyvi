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
});
