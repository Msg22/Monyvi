import {
  formatDisposeObservedLabel,
  shapeDisposeRateEvidence,
  type DisposeRateSnapshotDraftLike,
} from "@/components/metals/dispose-rate-presentation";

function metalDraft(
  overrides: Partial<DisposeRateSnapshotDraftLike> = {}
): DisposeRateSnapshotDraftLike {
  return {
    role: "terminal_metal",
    kind: "metal",
    instrumentCode: "metal:GOLD",
    valueDecimal: "3600",
    unit: "usd_per_pure_gram",
    orientation: "quote_per_base",
    providerObservedAt: "2026-09-05T10:00:00.000Z",
    source: "test-provider",
    quality: "valid",
    capturedFreshness: "fresh",
    capturedAt: "2026-09-05T10:00:10.000Z",
    ...overrides,
  };
}

function currencyDraft(
  overrides: Partial<DisposeRateSnapshotDraftLike> = {}
): DisposeRateSnapshotDraftLike {
  return {
    role: "terminal_purchase_currency",
    kind: "currency",
    instrumentCode: "currency:EGP",
    valueDecimal: "0.02",
    unit: "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: "2026-09-05T10:00:00.000Z",
    source: "test-provider",
    quality: "valid",
    capturedFreshness: "fresh",
    capturedAt: "2026-09-05T10:00:10.000Z",
    ...overrides,
  };
}

describe("Dispose rate presentation", () => {
  it("shapes metal and currency evidence without provider or quality identifiers", (): void => {
    const shaped = shapeDisposeRateEvidence(
      [metalDraft(), currencyDraft()],
      [
        { role: "terminal_metal", currentFreshness: "stale" },
        { role: "terminal_purchase_currency", currentFreshness: "fresh" },
      ],
      { locale: "en", unknownLabel: "Unknown" }
    );
    expect(shaped).toHaveLength(2);
    expect(shaped[0]?.role).toBe("terminal_metal");
    expect(shaped[0]?.valueLabel).toBe("3,600.00 USD/g");
    expect(shaped[0]?.freshness).toBe("stale");
    expect(typeof shaped[0]?.observedLabel).toBe("string");
    expect(shaped[1]?.role).toBe("terminal_purchase_currency");
    expect(shaped[1]?.valueLabel).toBe("0.02 USD/EGP");
    expect(shaped[1]?.freshness).toBe("fresh");
    expect(typeof shaped[1]?.observedLabel).toBe("string");
    expect(JSON.stringify(shaped)).not.toContain("test-provider");
  });

  it("labels inverse currency evidence with the truthful orientation", (): void => {
    const shaped = shapeDisposeRateEvidence(
      [
        currencyDraft({
          valueDecimal: "50",
          unit: "currency_units_per_usd",
          orientation: "base_per_quote",
        }),
      ],
      [{ role: "terminal_purchase_currency", currentFreshness: "fresh" }],
      { locale: "en", unknownLabel: "Unknown" }
    );
    expect(shaped).toHaveLength(1);
    expect(shaped[0]?.valueLabel).toBe("50 EGP/USD");
  });

  it("keeps full internal precision while display rounds the metal gram rate", (): void => {
    const shaped = shapeDisposeRateEvidence(
      [metalDraft({ valueDecimal: "3600.005" })],
      [{ role: "terminal_metal", currentFreshness: "fresh" }],
      { locale: "en", unknownLabel: "Unknown" }
    );
    expect(shaped[0]?.valueLabel).toBe("3,600.00 USD/g");
  });

  it("shows an explicit year for historical provider observations", (): void => {
    const shaped = shapeDisposeRateEvidence(
      [metalDraft({ providerObservedAt: "2024-03-14T10:00:00.000Z" })],
      [{ role: "terminal_metal", currentFreshness: "stale" }],
      { locale: "en", unknownLabel: "Unknown" }
    );
    expect(shaped[0]?.observedLabel).toContain("2024");
  });

  it("labels a missing provider observation as unknown without inventing a date", (): void => {
    expect(formatDisposeObservedLabel(null, "en", "Unknown")).toBe("Unknown");
    expect(formatDisposeObservedLabel("not-a-date", "ar", "غير معروف")).toBe(
      "غير معروف"
    );
  });
});
