import {
  normalizeHistoricalMetalTroyOunceToPureGramDecimal,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
  MetalHistoricalRateCache: class MetalHistoricalRateCache {},
}));

import { readHistoricalMetalDetailReference } from "../../services/metal-historical-detail-facade-service";

const DATE = "2026-10-10";

function record(): HistoricalDailyRateRecord {
  const gold = "3110.34768";
  const silver = "31.1034768";
  return {
    contractVersion: 1,
    providerKey: "metals.dev",
    rateDate: DATE,
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: gold,
    silverUsdPerTroyOunceDecimal: silver,
    goldUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(gold) ?? "",
    silverUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(silver) ?? "",
    currenciesUsdPerUnit: { USD: "1" },
    providerResponseTimestamp: null,
    fetchedAt: "2026-10-10T15:00:00.000Z",
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    source: "metals.dev",
    quality: "valid",
  };
}

describe("#355 historical Details facade", () => {
  it("returns a presentation-safe purchase-date rate distinct from paid cost", async () => {
    const historical = record();
    const result = await readHistoricalMetalDetailReference(
      {
        purchaseDate: DATE,
        metal: "GOLD",
        purityCode: "gold-999",
        purityFactorDecimal: "0.999",
        purchaseCurrency: "USD",
      },
      {
        readCache: jest.fn(() => Promise.resolve(historical)),
        saveCache: jest.fn((value) => Promise.resolve(value)),
        fetchDaily: jest.fn(() => Promise.resolve(historical)),
      }
    );

    expect(result).toEqual({
      status: "available",
      rateDate: DATE,
      purchaseCurrency: "USD",
      selectedPurityPerGramDecimal: "100",
      origin: "daily_history",
    });
    expect(result).not.toHaveProperty("source");
    expect(result).not.toHaveProperty("trust");
    expect(result).not.toHaveProperty("purchasePriceDecimal");
  });

  it("preserves unavailable state instead of deriving paid-cost-per-gram", async () => {
    const result = await readHistoricalMetalDetailReference(
      {
        purchaseDate: DATE,
        metal: "GOLD",
        purityCode: "gold-999",
        purityFactorDecimal: "0.999",
        purchaseCurrency: "EGP",
        allowNetwork: false,
      },
      {
        readCache: jest.fn(() => Promise.resolve(null)),
        saveCache: jest.fn((value) => Promise.resolve(value)),
        fetchDaily: jest.fn(() => Promise.resolve(record())),
      }
    );

    expect(result).toEqual({ status: "unavailable", reason: "cache_miss" });
  });
});
