import {
  formatPortfolioRateUpdatedParts,
  getPortfolioRateAccessibilityCopy,
  resolvePortfolioRateCopy,
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
    expect(parts?.time).toMatch(/[صم.]$/);
  });

  it("does not manufacture a timestamp when provider observation time is absent", () => {
    expect(formatPortfolioRateUpdatedParts(null, "en")).toBeNull();
    expect(formatPortfolioRateUpdatedParts(null, "ar")).toBeNull();
  });
});

describe("portfolio rate status copy (state-driven)", () => {
  const observedAt = new Date("2026-09-08T19:05:00.000Z");

  it("announces the provider timestamp for a fresh rate instead of one unlabeled current rate", () => {
    const copy = getPortfolioRateAccessibilityCopy(
      "fresh",
      observedAt,
      "en",
      new Date(observedAt.getTime() + 60_000)
    );
    expect(copy.key).toBe("portfolio.rates_updated_fresh");
    expect(copy.relativeDateKey).toBe("portfolio.today");
    expect(copy.values?.time).toMatch(/(AM|PM)$/);
  });

  it("uses the calendar date when a fresh rate was observed on an earlier day", () => {
    const copy = getPortfolioRateAccessibilityCopy(
      "fresh",
      observedAt,
      "en",
      new Date(observedAt.getTime() + 2 * 86_400_000)
    );
    expect(copy.key).toBe("portfolio.rates_updated_fresh");
    expect(copy.relativeDateKey).toBeUndefined();
    expect(typeof copy.values?.date).toBe("string");
  });

  it("falls back to the short current-rate label when a fresh rate has no timestamp", () => {
    expect(
      getPortfolioRateAccessibilityCopy("fresh", null, "en", new Date())
    ).toEqual({ key: "portfolio.current_rate" });
  });

  it("substitutes the localized today label when resolving a same-day fresh copy", () => {
    const copy = getPortfolioRateAccessibilityCopy(
      "fresh",
      observedAt,
      "en",
      new Date(observedAt.getTime() + 60_000)
    );
    const translate = (key: string, values?: Record<string, string>): string =>
      key === "portfolio.today" ? "today" : `${key} ${JSON.stringify(values)}`;

    const label = resolvePortfolioRateCopy(copy, translate);
    expect(label).toContain("portfolio.rates_updated_fresh");
    expect(label).toContain("today");
  });

  it("announces last-updated info for stale/unknown when a timestamp exists", () => {
    const copy = getPortfolioRateAccessibilityCopy(
      "stale",
      observedAt,
      "en",
      new Date(observedAt.getTime() + 90_000_000)
    );
    expect(copy.key).toBe("portfolio.rates_updated");
    expect(typeof copy.values?.date).toBe("string");
    expect(typeof copy.values?.time).toBe("string");
  });

  it("announces unavailable for a missing required rate even when a stale observation retained a timestamp", () => {
    expect(
      getPortfolioRateAccessibilityCopy("missing", observedAt, "en", new Date())
    ).toEqual({ key: "rate.missing" });
  });

  it("falls back to the short state label when there is no timestamp", () => {
    expect(
      getPortfolioRateAccessibilityCopy("unknown", null, "en", new Date())
    ).toEqual({
      key: "rate.unknown",
    });
  });
});
