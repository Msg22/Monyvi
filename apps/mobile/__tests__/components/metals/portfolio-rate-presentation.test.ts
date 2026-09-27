import {
  formatPortfolioRateUpdatedParts,
  getPortfolioRateAccessibilityCopy,
  getPortfolioRateCompactLabel,
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

  describe("getPortfolioRateCompactLabel", () => {
    const mockT = (key: string, values?: Record<string, string>): string => {
      const map: Record<string, string> = {
        "portfolio.rates_updated_today": `Updated today, ${values?.time ?? ""}`,
        "portfolio.rates_updated_compact": `Updated ${values?.date ?? ""}, ${values?.time ?? ""}`,
        "rate.short_fresh": "Current",
        "rate.short_stale": "Last available",
        "rate.short_unknown": "Age unknown",
        "rate.missing": "Rates: current rate unavailable",
        "rate.stale": "Last available price",
        "rate.unknown": "Rates: rate age is unknown",
      };
      return map[key] ?? key;
    };

    it("returns unqualified updated today for a fresh same-day rate", () => {
      const sameDayNow = new Date("2026-09-08T20:00:00.000Z");
      const parts = formatPortfolioRateUpdatedParts(observedAt, "en");
      const label = getPortfolioRateCompactLabel(
        "fresh",
        observedAt,
        "en",
        sameDayNow,
        mockT
      );
      expect(label).toBe(`Updated today, ${parts?.time}`);
    });

    it("qualifies stale rates with a localized state prefix while preserving observation timestamp", () => {
      const sameDayNow = new Date("2026-09-08T20:00:00.000Z");
      const parts = formatPortfolioRateUpdatedParts(observedAt, "en");
      const label = getPortfolioRateCompactLabel(
        "stale",
        observedAt,
        "en",
        sameDayNow,
        mockT
      );
      expect(label).toBe(`Last available · Updated today, ${parts?.time}`);
    });

    it("qualifies unknown-age rates with a localized state prefix while preserving observation timestamp", () => {
      const sameDayNow = new Date("2026-09-08T20:00:00.000Z");
      const parts = formatPortfolioRateUpdatedParts(observedAt, "en");
      const label = getPortfolioRateCompactLabel(
        "unknown",
        observedAt,
        "en",
        sameDayNow,
        mockT
      );
      expect(label).toBe(`Age unknown · Updated today, ${parts?.time}`);
    });

    it("returns missing label when state is missing", () => {
      const label = getPortfolioRateCompactLabel(
        "missing",
        observedAt,
        "en",
        new Date(),
        mockT
      );
      expect(label).toBe("Rates: current rate unavailable");
    });

    it("falls back to base state label when timestamp is absent", () => {
      const label = getPortfolioRateCompactLabel(
        "stale",
        null,
        "en",
        new Date(),
        mockT
      );
      expect(label).toBe("Last available price");
    });
  });
});
