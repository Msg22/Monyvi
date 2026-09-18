import {
  formatPortfolioRateUpdatedParts,
  getPortfolioRateAccessibilityCopy,
} from "@/components/metals/portfolio-rate-presentation";

describe("portfolio rate presentation", () => {
  const observedAt = new Date("2026-09-08T19:05:00.000Z");

  it("formats English provider date/time with AM/PM", () => {
    const parts = formatPortfolioRateUpdatedParts(observedAt, "en");
    expect(parts?.date).toEqual(expect.any(String));
    expect(parts?.time).toMatch(/(AM|PM)$/);
  });

  it("formats Arabic provider date/time with localized ص/م", () => {
    const parts = formatPortfolioRateUpdatedParts(observedAt, "ar");
    expect(parts?.date).toEqual(expect.any(String));
    expect(parts?.time).toMatch(/[صم]$/);
  });

  it("does not manufacture a timestamp when provider observation time is absent", () => {
    expect(formatPortfolioRateUpdatedParts(null, "en")).toBeNull();
    expect(formatPortfolioRateUpdatedParts(null, "ar")).toBeNull();
  });
});

describe("portfolio rate status copy (state-driven)", () => {
  const observedAt = new Date("2026-09-08T19:05:00.000Z");

  it("announces a current rate only when the trusted state is fresh", () => {
    expect(
      getPortfolioRateAccessibilityCopy("fresh", observedAt, "en")
    ).toEqual({ key: "portfolio.current_rate" });
  });

  it("announces last-updated info for stale/unknown when a timestamp exists", () => {
    const copy = getPortfolioRateAccessibilityCopy("stale", observedAt, "en");
    expect(copy.key).toBe("portfolio.rates_updated");
    expect(typeof copy.values?.date).toBe("string");
    expect(typeof copy.values?.time).toBe("string");
  });

  it("announces unavailable for a missing required rate even when a stale observation retained a timestamp", () => {
    expect(
      getPortfolioRateAccessibilityCopy("missing", observedAt, "en")
    ).toEqual({ key: "rate.missing" });
  });

  it("falls back to the short state label when there is no timestamp", () => {
    expect(getPortfolioRateAccessibilityCopy("unknown", null, "en")).toEqual({
      key: "rate.unknown",
    });
  });
});
