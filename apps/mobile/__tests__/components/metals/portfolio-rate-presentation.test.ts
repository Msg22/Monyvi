import { formatPortfolioRateUpdated } from "@/components/metals/portfolio-rate-presentation";

describe("portfolio rate presentation", () => {
  const observedAt = new Date("2026-09-08T19:05:00.000Z");

  it("formats English provider time with AM/PM and the approved sentence", () => {
    const result = formatPortfolioRateUpdated(observedAt, "en");

    expect(result).toMatch(/^Prices last updated .+ at .+ (AM|PM)\. They may have changed since then\.$/);
    expect(result).not.toMatch(/older than 24 hours/i);
  });

  it("formats Arabic provider time with localized ص/م and the approved sentence", () => {
    const result = formatPortfolioRateUpdated(observedAt, "ar");

    expect(result).toMatch(/^آخر تحديث للأسعار: .+، .+ [صم]\. قد تكون تغيّرت بعد ذلك\.$/);
    expect(result).not.toMatch(/24/);
  });

  it("does not manufacture a timestamp when provider observation time is absent", () => {
    expect(formatPortfolioRateUpdated(null, "en")).toBeNull();
    expect(formatPortfolioRateUpdated(null, "ar")).toBeNull();
  });
});
