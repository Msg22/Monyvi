import {
  formatPortfolioRateUpdated,
  formatPortfolioRateUpdatedParts,
} from "@/components/metals/portfolio-rate-presentation";

describe("portfolio rate presentation", () => {
  const observedAt = new Date("2026-09-08T19:05:00.000Z");

  it("formats English provider time with AM/PM and the approved sentence", () => {
    const parts = formatPortfolioRateUpdatedParts(observedAt, "en");
    const sentence = formatPortfolioRateUpdated(observedAt, "en");

    expect(parts?.date).toEqual(expect.any(String));
    expect(parts?.time).toMatch(/(AM|PM)$/);
    expect(sentence).toMatch(
      /^Prices last updated .+ at .+ (AM|PM)\. They may have changed since then\.$/
    );
    expect(sentence).not.toMatch(/older than 24 hours/i);
  });

  it("formats Arabic provider time with localized ص/م and the approved sentence", () => {
    const parts = formatPortfolioRateUpdatedParts(observedAt, "ar");
    const sentence = formatPortfolioRateUpdated(observedAt, "ar");

    expect(parts?.date).toEqual(expect.any(String));
    expect(parts?.time).toMatch(/[صم]$/);
    expect(sentence).toMatch(
      /^آخر تحديث للأسعار: .+، .+ [صم]\. قد تكون تغيّرت بعد ذلك\.$/
    );
    expect(sentence).not.toMatch(/24/);
  });

  it("does not manufacture a timestamp when provider observation time is absent", () => {
    expect(formatPortfolioRateUpdatedParts(null, "en")).toBeNull();
    expect(formatPortfolioRateUpdatedParts(null, "ar")).toBeNull();
    expect(formatPortfolioRateUpdated(null, "en")).toBeNull();
    expect(formatPortfolioRateUpdated(null, "ar")).toBeNull();
  });
});
