import {
  convertCurrentAmountExact,
  getCurrencyUsdPerUnitDecimal,
  getMetalUsdPerPureGramDecimal,
  validateCurrentMarketSnapshot,
  type CurrentMarketInstrument,
  type CurrentMarketRate,
  type CurrentMarketSnapshotObservationInput,
} from "../current-market-snapshot";
import {
  completeSnapshotA,
  REQUIRED_INSTRUMENT_CODES,
  snapshotWithObservationSource,
  snapshotWithoutObservation,
} from "./current-market-snapshot.fixtures";

function toInputs(
  observations: ReadonlyArray<{
    instrumentCode: string;
    valueDecimal: string;
    unit: string;
    orientation: string;
    providerObservedAt: string | null;
    source: string | null;
    quality: string;
    capturedAt: string;
  }>
): CurrentMarketSnapshotObservationInput[] {
  return observations.map((observation) => ({ ...observation }));
}

function expectValid(
  observations: CurrentMarketSnapshotObservationInput[]
): ReadonlyMap<CurrentMarketInstrument, CurrentMarketRate> {
  const result = validateCurrentMarketSnapshot(observations);
  if (!result.available) {
    throw new Error(`unexpected invalidation: ${result.reasons.join(",")}`);
  }
  return result.rates;
}

describe("validateCurrentMarketSnapshot", () => {
  it("accepts the complete 37-instrument snapshot", () => {
    const rates = expectValid(toInputs(completeSnapshotA().observations));

    expect(rates.size).toBe(37);
    expect(rates.get("metal:GOLD")?.valueDecimal).toBe("3738.74000000");
    expect(rates.get("currency:USD")?.valueDecimal).toBe("1");
    expect(rates.get("currency:OMR")?.valueDecimal).toBe("0.10000000000000001");
  });

  it("rejects a missing required instrument", () => {
    const snapshot = snapshotWithoutObservation(
      completeSnapshotA(),
      "currency:EGP"
    );
    const result = validateCurrentMarketSnapshot(
      toInputs(snapshot.observations)
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reasons).toContain("missing_instrument:currency:EGP");
    }
  });

  it("rejects a duplicated instrument", () => {
    const observations = toInputs(completeSnapshotA().observations);
    const result = validateCurrentMarketSnapshot([
      ...observations,
      { ...observations[0] },
    ]);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(
        result.reasons.some((reason) =>
          reason.startsWith("duplicate_instrument:metal:GOLD")
        )
      ).toBe(true);
    }
  });

  it("rejects unexpected instruments including currency:BTC", () => {
    const observations = toInputs(completeSnapshotA().observations);
    const result = validateCurrentMarketSnapshot([
      ...observations,
      { ...observations[0], instrumentCode: "currency:BTC" },
    ]);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reasons).toContain("unexpected_instrument:currency:BTC");
    }
  });

  it("rejects non-positive and non-canonical decimals", () => {
    for (const valueDecimal of ["0", "-1.5", "01.5", "not-a-number", ""]) {
      const snapshot = snapshotWithObservationSource(
        completeSnapshotA(),
        "metal:GOLD",
        "metals.dev"
      );
      const observations = toInputs(snapshot.observations).map((input) =>
        input.instrumentCode === "metal:GOLD"
          ? { ...input, valueDecimal }
          : input
      );
      const result = validateCurrentMarketSnapshot(observations);

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(
          result.reasons.some((reason) =>
            reason.startsWith("invalid_value:metal:GOLD")
          )
        ).toBe(true);
      }
    }
  });

  it("enforces the exact USD identity", () => {
    const observations = toInputs(completeSnapshotA().observations).map(
      (input) =>
        input.instrumentCode === "currency:USD"
          ? { ...input, valueDecimal: "1.00000000000000001" }
          : input
    );
    const result = validateCurrentMarketSnapshot(observations);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reasons).toContain("invalid_value:currency:USD");
    }
  });

  it("rejects null, empty, and whitespace-only source", () => {
    for (const source of [null, "", "   "]) {
      const snapshot = snapshotWithObservationSource(
        completeSnapshotA(),
        "currency:EGP",
        source
      );
      const result = validateCurrentMarketSnapshot(
        toInputs(snapshot.observations)
      );

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reasons).toContain("invalid_source:currency:EGP");
      }
    }
  });

  it("rejects invalid quality and unsupported unit/orientation pairs", () => {
    const qualityObservations = toInputs(completeSnapshotA().observations).map(
      (input) =>
        input.instrumentCode === "metal:SILVER"
          ? { ...input, quality: "unknown" }
          : input
    );
    const qualityResult = validateCurrentMarketSnapshot(qualityObservations);
    expect(qualityResult.available).toBe(false);

    const unitObservations = toInputs(completeSnapshotA().observations).map(
      (input) =>
        input.instrumentCode === "metal:SILVER"
          ? { ...input, unit: "currency_units_per_usd" }
          : input
    );
    const unitResult = validateCurrentMarketSnapshot(unitObservations);
    expect(unitResult.available).toBe(false);
    if (!unitResult.available) {
      expect(
        unitResult.reasons.some((reason) =>
          reason.startsWith("invalid_unit:metal:SILVER")
        )
      ).toBe(true);
    }
  });

  it("normalizes missing, malformed, and future provider time to null without substituting capture time", () => {
    const inputs = toInputs(completeSnapshotA().observations).map((input) =>
      input.instrumentCode === "metal:GOLD"
        ? { ...input, providerObservedAt: "not-a-timestamp" }
        : input
    );
    const rates = expectValid(inputs);
    expect(rates.get("metal:GOLD")?.providerObservedAt).toBeNull();

    const futureRates = expectValid(
      toInputs(completeSnapshotA().observations).map((input) =>
        input.instrumentCode === "metal:GOLD"
          ? { ...input, providerObservedAt: "2099-01-01T00:00:00Z" }
          : input
      )
    );
    expect(futureRates.get("metal:GOLD")?.providerObservedAt).toBeNull();
  });

  it("preserves the accepted instrument set", () => {
    const codes = REQUIRED_INSTRUMENT_CODES;
    expect(codes.length).toBe(37);
    expect(codes.filter((code) => code.startsWith("currency:USD"))).toEqual([
      "currency:USD",
    ]);
  });
});

describe("current exact lookups and conversion", () => {
  it("returns exact metal USD-per-pure-gram decimals", () => {
    const rates = expectValid(toInputs(completeSnapshotA().observations));

    expect(getMetalUsdPerPureGramDecimal(rates, "GOLD")).toBe("3738.74000000");
    expect(getMetalUsdPerPureGramDecimal(rates, "SILVER")).toBe("43.73874000");
  });

  it("returns exact currency USD-per-unit decimals with USD identity", () => {
    const rates = expectValid(toInputs(completeSnapshotA().observations));

    expect(getCurrencyUsdPerUnitDecimal(rates, "EGP")).toBe("0.0210523309");
    expect(getCurrencyUsdPerUnitDecimal(rates, "USD")).toBe("1");
  });

  it("returns null for instruments outside the selected snapshot", () => {
    const rates = new Map<CurrentMarketInstrument, CurrentMarketRate>();

    expect(getMetalUsdPerPureGramDecimal(rates, "GOLD")).toBeNull();
    expect(getCurrencyUsdPerUnitDecimal(rates, "EGP")).toBeNull();
  });

  it("converts amounts exactly through Decimal strings", () => {
    const rates = expectValid(toInputs(completeSnapshotA().observations));

    const toUsd = convertCurrentAmountExact({
      amountDecimal: "1000",
      fromCurrency: "EGP",
      toCurrency: "USD",
      rates,
    });
    expect(toUsd.available).toBe(true);
    if (toUsd.available) {
      expect(toUsd.value).toBe("21.0523309");
    }

    const roundTrip = convertCurrentAmountExact({
      amountDecimal: "21.0523309",
      fromCurrency: "USD",
      toCurrency: "EGP",
      rates,
    });
    expect(roundTrip.available).toBe(true);
    if (roundTrip.available) {
      expect(roundTrip.value).toBe("1000");
    }
  });

  it("fails closed when a conversion input is missing", () => {
    const rates = new Map<CurrentMarketInstrument, CurrentMarketRate>();
    const result = convertCurrentAmountExact({
      amountDecimal: "1000",
      fromCurrency: "EGP",
      toCurrency: "USD",
      rates,
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("missing_rate");
    }
  });
});
