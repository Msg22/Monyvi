import {
  composeHistoricalMetalDetailReference,
  type HistoricalMetalDetailCompositionDependencies,
} from "../../services/metal-historical-detail-composition-service";
import { readHistoricalMetalDetailReference } from "../../services/metal-historical-detail-facade-service";
import type { HistoricalDailyRateRecord } from "@monyvi/logic";
import {
  createHistoricalContextKey,
  createHistoricalDetailContext,
} from "../../services/metal-detail-historical-reference-service";

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
  MetalHistoricalRateCache: class MetalHistoricalRateCache {},
}));

const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>(() =>
  Promise.resolve()
);
jest.mock("../../services/user-data-access", () => ({
  assertExpectedCurrentUser: (userId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(userId),
}));

function reference(
  actionId: string,
  role: "acquisition_metal" | "acquisition_purchase_currency",
  valueDecimal: string
): Readonly<Record<string, unknown>> {
  const isMetal = role === "acquisition_metal";
  return {
    actionId,
    capturedAt: Date.parse("2026-10-10T12:00:00.000Z"),
    capturedFreshness: "fresh",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:EGP",
    kind: isMetal ? "metal" : "currency",
    orientation: "quote_per_base",
    providerObservedAt: Date.parse("2026-10-10T08:00:00.000Z"),
    quality: "valid",
    role,
    source: "metals.dev",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    valueDecimal,
  };
}

describe("#355 Details acquisition-reference composition", () => {
  it("passes only the current acquisition action pair to historical qualification", async () => {
    const readHistoricalReference = jest.fn(() =>
      Promise.resolve({
        status: "available" as const,
        rateDate: "2026-10-10",
        purchaseCurrency: "EGP",
        selectedPurityPerGramDecimal: "5000",
        origin: "action_observation" as const,
      })
    );
    const dependencies: HistoricalMetalDetailCompositionDependencies = {
      readHistoricalReference,
    };

    await composeHistoricalMetalDetailReference(
      {
        acquisitionActionId: "action-correct",
        metal: "GOLD",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-10-10",
        purityCode: "gold-999",
        purityFactorDecimal: "0.999",
        rateReferences: [
          reference("action-add", "acquisition_metal", "90"),
          reference("action-add", "acquisition_purchase_currency", "0.019"),
          reference("action-correct", "acquisition_metal", "100"),
          reference("action-correct", "acquisition_purchase_currency", "0.02"),
        ],
      },
      dependencies
    );

    expect(readHistoricalReference).toHaveBeenCalledTimes(1);
    expect(readHistoricalReference).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionMetalReference: expect.objectContaining({
          actionId: "action-correct",
          role: "acquisition_metal",
          valueDecimal: "100",
        }) as unknown,
        acquisitionCurrencyReference: expect.objectContaining({
          actionId: "action-correct",
          role: "acquisition_purchase_currency",
          valueDecimal: "0.02",
        }) as unknown,
      })
    );
  });

  it("still resolves exact-date daily history for a legacy holding with no acquisition action", async () => {
    const readHistoricalReference = jest.fn(() =>
      Promise.resolve({
        status: "unavailable" as const,
        reason: "date_unavailable" as const,
      })
    );

    await composeHistoricalMetalDetailReference(
      {
        acquisitionActionId: null,
        metal: "SILVER",
        purchaseCurrency: "USD",
        purchaseDate: "2024-03-14",
        purityCode: "silver-925",
        purityFactorDecimal: "0.925",
        rateReferences: [reference("unrelated", "acquisition_metal", "1")],
      },
      { readHistoricalReference }
    );

    expect(readHistoricalReference).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionMetalReference: undefined,
        acquisitionCurrencyReference: undefined,
        purchaseDate: "2024-03-14",
      })
    );
  });

  it("does not fetch when required recorded material facts are absent", async () => {
    const readHistoricalReference = jest.fn();

    await expect(
      composeHistoricalMetalDetailReference(
        {
          acquisitionActionId: "action-add",
          metal: "GOLD",
          purchaseCurrency: null,
          purchaseDate: "2026-10-10",
          purityCode: "gold-999",
          purityFactorDecimal: "0.999",
          rateReferences: [],
        },
        { readHistoricalReference }
      )
    ).resolves.toBeNull();

    expect(readHistoricalReference).not.toHaveBeenCalled();
  });

  it("passes allowNetwork through to readHistoricalReference when provided", async () => {
    const readHistoricalReference = jest.fn(() =>
      Promise.resolve({
        status: "unavailable" as const,
        reason: "cache_miss" as const,
      })
    );

    await composeHistoricalMetalDetailReference(
      {
        acquisitionActionId: null,
        metal: "GOLD",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-10-10",
        purityCode: "gold-999",
        purityFactorDecimal: "0.999",
        rateReferences: [],
        allowNetwork: false,
      },
      { readHistoricalReference }
    );

    expect(readHistoricalReference).toHaveBeenCalledWith(
      expect.objectContaining({
        allowNetwork: false,
      })
    );
  });

  it("defaults Details composition to local evidence without enabling network", async () => {
    const readHistoricalReference = jest.fn(() =>
      Promise.resolve({
        status: "unavailable" as const,
        reason: "cache_miss" as const,
      })
    );
    await composeHistoricalMetalDetailReference(historicalInput(), {
      readHistoricalReference,
    });
    expect(readHistoricalReference).toHaveBeenCalledWith(
      expect.objectContaining({ allowNetwork: false })
    );
  });

  it("keys historical requests by owner, holding, date and acquisition evidence rather than live refreshes", () => {
    const asset = {
      acquisitionActionId: "action-add",
      purchaseDate: new Date(2026, 9, 10),
      purchaseCurrency: "EGP" as const,
    };
    const metal = { purityCode: "gold-999", purityFactorDecimal: "0.999" };
    const acquisition = reference("action-add", "acquisition_metal", "100");
    const dateProof = {
      purchaseDate: "2026-10-10",
      acquisitionActionId: "action-add",
    };
    const context = createHistoricalDetailContext(
      asset,
      metal,
      "GOLD",
      [acquisition],
      dateProof
    );
    const withUnrelatedRate = createHistoricalDetailContext(
      asset,
      metal,
      "GOLD",
      [acquisition, reference("action-live", "acquisition_metal", "101")],
      dateProof
    );
    expect(createHistoricalContextKey("user-1", "holding-1", context)).toBe(
      createHistoricalContextKey("user-1", "holding-1", withUnrelatedRate)
    );
    expect(createHistoricalContextKey("user-2", "holding-1", context)).not.toBe(
      createHistoricalContextKey("user-1", "holding-1", context)
    );
    expect(createHistoricalContextKey("user-1", "holding-2", context)).not.toBe(
      createHistoricalContextKey("user-1", "holding-1", context)
    );
    const corrected = createHistoricalDetailContext(
      { ...asset, purchaseDate: new Date(2026, 9, 9) },
      metal,
      "GOLD",
      [acquisition],
      { purchaseDate: "2026-10-09", acquisitionActionId: null }
    );
    expect(
      createHistoricalContextKey("user-1", "holding-1", corrected)
    ).not.toBe(createHistoricalContextKey("user-1", "holding-1", context));
    const afterTravel = createHistoricalDetailContext(
      { ...asset, purchaseDate: new Date("2026-10-10T04:00:00.000Z") },
      metal,
      "GOLD",
      [acquisition],
      dateProof
    );
    expect(createHistoricalContextKey("user-1", "holding-1", afterTravel)).toBe(
      createHistoricalContextKey("user-1", "holding-1", context)
    );
  });

  it("reads local cache on initial Details composition without calling the provider", async () => {
    const fetchDaily = jest.fn<
      Promise<HistoricalDailyRateRecord>,
      [string, AbortSignal?]
    >();
    const saveCache = jest.fn();
    const result = await readHistoricalMetalDetailReference(
      { ...historicalInput(), allowNetwork: false },
      {
        readCache: jest.fn(() => Promise.resolve(null)),
        saveCache,
        fetchDaily,
      }
    );
    expect(result).toEqual({ status: "unavailable", reason: "cache_miss" });
    expect(fetchDaily).not.toHaveBeenCalled();
    expect(saveCache).not.toHaveBeenCalled();
  });

  it.each(["cancel", "auth"] as const)(
    "does not cache a late provider response after %s changes",
    async (change) => {
      mockAssertExpectedCurrentUser.mockReset().mockResolvedValue(undefined);
      const controller = new AbortController();
      const dailyResponse = createDeferred<HistoricalDailyRateRecord>();
      let onProviderStarted: (() => void) | null = null;
      const providerStarted = new Promise<void>((resolve) => {
        onProviderStarted = resolve;
      });
      const fetchDaily = jest.fn(() => {
        onProviderStarted?.();
        return dailyResponse.promise;
      });
      const saveCache = jest.fn();
      const pending = readHistoricalMetalDetailReference(
        {
          ...historicalInput(),
          allowNetwork: true,
          expectedUserId: "user-1",
          signal: controller.signal,
        },
        {
          readCache: jest.fn(() => Promise.resolve(null)),
          saveCache,
          fetchDaily,
        }
      );
      await providerStarted;
      expect(fetchDaily).toHaveBeenCalledTimes(1);
      if (change === "cancel") controller.abort();
      else
        mockAssertExpectedCurrentUser.mockRejectedValue(
          new Error("auth_scope_changed")
        );
      dailyResponse.resolve(historicalRecord());
      await pending;
      expect(saveCache).not.toHaveBeenCalled();
      mockAssertExpectedCurrentUser.mockReset().mockResolvedValue(undefined);
    }
  );
});

function historicalInput(): {
  acquisitionActionId: null;
  purchaseDate: string;
  metal: "GOLD";
  purchaseCurrency: string;
  purityCode: string;
  purityFactorDecimal: string;
  rateReferences: ReadonlyArray<Readonly<Record<string, unknown>>>;
} {
  return {
    acquisitionActionId: null,
    purchaseDate: "2026-10-10",
    metal: "GOLD",
    purchaseCurrency: "EGP",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    rateReferences: [],
  };
}

function historicalRecord(): HistoricalDailyRateRecord {
  return {
    contractVersion: 1,
    providerKey: "metals.dev",
    rateDate: "2026-10-10",
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: "3110.34768",
    silverUsdPerTroyOunceDecimal: "31.1034768",
    goldUsdPerPureGramDecimal: "100",
    silverUsdPerPureGramDecimal: "1",
    currenciesUsdPerUnit: { USD: "1", EGP: "0.02" },
    providerResponseTimestamp: null,
    fetchedAt: "2026-10-10T15:00:00.000Z",
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    source: "metals.dev",
    quality: "valid",
  };
}

function createDeferred<TValue>(): {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
} {
  let complete: (value: TValue) => void = (): void => {
    throw new Error("deferred_promise_not_initialized");
  };
  const promise = new Promise<TValue>((resolve): void => {
    complete = resolve;
  });
  return { promise, resolve: complete };
}
