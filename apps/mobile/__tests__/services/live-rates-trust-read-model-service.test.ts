import {
  buildLiveRatesTrustReadModel,
  summarizeLiveRatesTrust,
  type LiveRatesTrustObservation,
} from "@/services/live-rates-trust-read-model-service";

const NOW_MS = Date.parse("2026-09-01T12:00:00.000Z");
const DAY_MS = 86_400_000;

function observation(
  instrumentCode: string,
  overrides: Partial<LiveRatesTrustObservation> = {}
): LiveRatesTrustObservation {
  return {
    instrumentCode,
    valueDecimal: "100.25",
    unit: instrumentCode.startsWith("metal:")
      ? "usd_per_pure_gram"
      : "usd_per_currency_unit",
    orientation: "quote_per_base",
    quality: "valid",
    source: "test-provider",
    providerObservedAt: new Date(NOW_MS - 1_000),
    createdAt: new Date(NOW_MS),
    ...overrides,
  };
}

describe("live-rates trust read model", () => {
  it("derives Gold, Silver, and currency trust independently from newest provider observations", () => {
    const readModel = buildLiveRatesTrustReadModel(
      [
        observation("metal:GOLD", {
          providerObservedAt: new Date(NOW_MS - DAY_MS - 1),
          createdAt: new Date(NOW_MS - DAY_MS - 1),
        }),
        observation("metal:GOLD"),
        observation("metal:SILVER", {
          providerObservedAt: new Date(NOW_MS - DAY_MS - 1),
        }),
        observation("currency:EGP", { providerObservedAt: null }),
      ],
      NOW_MS
    );

    expect(readModel.gold.state).toBe("fresh");
    expect(readModel.gold.valueDecimal).toBe("100.25");
    expect(readModel.silver.state).toBe("stale");
    expect(readModel.currencies.get("EGP")?.state).toBe("unknown");
  });

  it("does not use created-at, sync time, or a historical observation to make current trust fresh", () => {
    const readModel = buildLiveRatesTrustReadModel(
      [
        observation("metal:GOLD", {
          providerObservedAt: new Date(NOW_MS - DAY_MS - 1),
          createdAt: new Date(NOW_MS),
        }),
        observation("metal:SILVER", {
          providerObservedAt: new Date(NOW_MS - 1_000),
          createdAt: new Date(NOW_MS - DAY_MS - 1),
        }),
      ],
      NOW_MS
    );

    expect(readModel.gold).toMatchObject({ state: "stale", ageMs: DAY_MS + 1 });
    expect(readModel.silver).toMatchObject({ state: "unknown", ageMs: null });
  });

  it.each([
    [null, "unknown"],
    [new Date(NOW_MS + 1), "unknown"],
  ] as const)(
    "marks provider observation %p as %s without hiding valid cached values",
    (providerObservedAt, state) => {
      const readModel = buildLiveRatesTrustReadModel(
        [observation("metal:GOLD", { providerObservedAt })],
        NOW_MS
      );

      expect(readModel.gold.state).toBe(state);
    }
  );

  it("marks a missing or invalid observed value unavailable without changing unrelated instruments", () => {
    const readModel = buildLiveRatesTrustReadModel(
      [
        observation("metal:SILVER", { valueDecimal: "0" }),
        observation("currency:EGP"),
      ],
      NOW_MS
    );

    expect(readModel.gold.state).toBe("missing");
    expect(readModel.gold.valueDecimal).toBeNull();
    expect(readModel.silver.state).toBe("invalid");
    expect(readModel.silver.valueDecimal).toBeNull();
    expect(readModel.currencies.get("EGP")?.state).toBe("fresh");
  });

  it("exposes only validated normalized exact values for portfolio valuation", () => {
    const readModel = buildLiveRatesTrustReadModel(
      [
        observation("currency:EGP", {
          valueDecimal: "50",
          unit: "currency_units_per_usd",
          orientation: "base_per_quote",
        }),
        observation("metal:GOLD", { valueDecimal: "01" }),
      ],
      NOW_MS
    );

    expect(readModel.currencies.get("EGP")).toMatchObject({
      state: "fresh",
      valueDecimal: "0.02",
    });
    expect(readModel.gold).toMatchObject({
      state: "invalid",
      valueDecimal: null,
    });
  });

  it("marks an empty summary missing until local observations arrive", () => {
    expect(summarizeLiveRatesTrust([])).toBe("missing");
  });
});
