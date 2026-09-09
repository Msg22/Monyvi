import { formatPortfolioRateUpdatedParts } from "@/components/metals/portfolio-rate-presentation";

describe("portfolio rate presentation", () => {
  const observedAt = new Date("2026-09-08T19:05:00.000Z");

  it("formats English provider time with AM/PM", () => {
    const result = formatPortfolioRateUpdatedParts(observedAt, "en");

    expect(result?.date).toEqual(expect.any(String));
    expect(result?.time).toMatch(/(AM|PM)$/);
  });

  it("formats Arabic provider time with localized ص/م", () => {
    const result = formatPortfolioRateUpdatedParts(observedAt, "ar");

    expect(result?.date).toEqual(expect.any(String));
    expect(result?.time).toMatch(/[صم]$/);
  });

  it("does not manufacture a timestamp when provider observation time is absent", () => {
    expect(formatPortfolioRateUpdatedParts(null, "en")).toBeNull();
    expect(formatPortfolioRateUpdatedParts(null, "ar")).toBeNull();
  });
});
