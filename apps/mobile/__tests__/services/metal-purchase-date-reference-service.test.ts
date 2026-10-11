import {
  normalizeHistoricalMetalTroyOunceToPureGramDecimal,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

import {
  resolvePurchaseDateHistoricalRate,
  type PurchaseDateHistoricalRateDependencies,
} from "../../services/metal-purchase-date-reference-service";
import {
  METAL_HISTORICAL_RATE_FETCH_ERROR_CODES,
  MetalHistoricalRateFetchError,
} from "../../services/metal-historical-rate-fetch-service";

const DATE = "2026-10-10";
const CAPTURED_AT = Date.parse("2026-10-10T12:00:00.000Z");
const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>(() =>
  Promise.resolve()
);
jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(),
    write: jest.fn(),
  },
  MetalHistoricalRateCache: class MetalHistoricalRateCache {},
}));

jest.mock("../../services/user-data-access", () => ({
  assertExpectedCurrentUser: (userId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(userId),
}));

function daily(
  currencies: Readonly<Record<string, string>> = { USD: "1", EGP: "0.02" }
): HistoricalDailyRateRecord {
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
    currenciesUsdPerUnit: currencies,
    providerResponseTimestamp: null,
    fetchedAt: "2026-10-10T15:00:00.000Z",
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    source: "metals.dev",
    quality: "valid",
  };
}

function actionReference(
  role: "acquisition_metal" | "acquisition_purchase_currency",
  instrumentCode: "metal:GOLD" | "currency:EGP",
  valueDecimal: string
): Readonly<Record<string, unknown>> {
  const metal = role === "acquisition_metal";
  return {
    role,
    kind: metal ? "metal" : "currency",
    instrumentCode,
    valueDecimal,
    unit: metal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: Date.parse("2026-10-10T08:00:00.000Z"),
    source: "metals.dev",
    quality: "valid",
    capturedAt: CAPTURED_AT,
    capturedFreshness: "fresh",
  };
}

interface MockPurchaseDateHistoricalRateDependencies extends PurchaseDateHistoricalRateDependencies {
  readonly readCache: jest.Mock<
    ReturnType<PurchaseDateHistoricalRateDependencies["readCache"]>,
    Parameters<PurchaseDateHistoricalRateDependencies["readCache"]>
  >;
  readonly saveCache: jest.Mock<
    ReturnType<PurchaseDateHistoricalRateDependencies["saveCache"]>,
    Parameters<PurchaseDateHistoricalRateDependencies["saveCache"]>
  >;
  readonly fetchDaily: jest.Mock<
    ReturnType<PurchaseDateHistoricalRateDependencies["fetchDaily"]>,
    Parameters<PurchaseDateHistoricalRateDependencies["fetchDaily"]>
  >;
}

function dependencies(input?: {
  readonly cache?: HistoricalDailyRateRecord | null;
  readonly fetched?: HistoricalDailyRateRecord;
  readonly fetchError?: Error;
}): MockPurchaseDateHistoricalRateDependencies {
  const readCache = jest.fn<
    ReturnType<PurchaseDateHistoricalRateDependencies["readCache"]>,
    Parameters<PurchaseDateHistoricalRateDependencies["readCache"]>
  >(() => Promise.resolve(input?.cache ?? null));
  const saveCache = jest.fn<
    ReturnType<PurchaseDateHistoricalRateDependencies["saveCache"]>,
    Parameters<PurchaseDateHistoricalRateDependencies["saveCache"]>
  >((value: HistoricalDailyRateRecord) => Promise.resolve(value));
  const fetchDaily = jest.fn<
    ReturnType<PurchaseDateHistoricalRateDependencies["fetchDaily"]>,
    Parameters<PurchaseDateHistoricalRateDependencies["fetchDaily"]>
  >(() =>
    input?.fetchError
      ? Promise.reject(input.fetchError)
      : Promise.resolve(input?.fetched ?? daily())
  );

  return {
    readCache,
    saveCache,
    fetchDaily,
  };
}

describe("#355 purchase-date historical resolver", () => {
  beforeEach(() => {
    mockAssertExpectedCurrentUser.mockReset().mockResolvedValue(undefined);
  });
  it("prefers a qualifying action-linked Add snapshot without cache or network", async () => {
    const deps = dependencies();
    const result = await resolvePurchaseDateHistoricalRate(
      {
        purchaseDate: DATE,
        metal: "GOLD",
        purchaseCurrency: "EGP",
        actionMetalReference: actionReference(
          "acquisition_metal",
          "metal:GOLD",
          "100"
        ),
        actionCurrencyReference: actionReference(
          "acquisition_purchase_currency",
          "currency:EGP",
          "0.02"
        ),
      },
      deps
    );

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.source).toBe("action");
      expect(result.value.origin).toBe("action_observation");
    }
    expect(deps.readCache).not.toHaveBeenCalled();
    expect(deps.fetchDaily).not.toHaveBeenCalled();
  });

  it("uses validated offline cache before any network fetch", async () => {
    const deps = dependencies({ cache: daily() });
    const result = await resolvePurchaseDateHistoricalRate(
      {
        purchaseDate: DATE,
        metal: "SILVER",
        purchaseCurrency: "EGP",
      },
      deps
    );

    expect(result.status).toBe("available");
    if (result.status === "available") expect(result.source).toBe("cache");
    expect(deps.fetchDaily).not.toHaveBeenCalled();
  });

  it("fetches the same exact date once, saves it locally, then returns the pair", async () => {
    const deps = dependencies({ cache: null, fetched: daily() });
    const result = await resolvePurchaseDateHistoricalRate(
      {
        purchaseDate: DATE,
        metal: "GOLD",
        purchaseCurrency: "EGP",
      },
      deps
    );

    expect(result.status).toBe("available");
    expect(deps.fetchDaily).toHaveBeenCalledWith(DATE);
    expect(deps.saveCache).toHaveBeenCalledWith(daily());
  });

  it("keeps EGP unavailable when that exact daily response has no EGP", async () => {
    const deps = dependencies({
      cache: null,
      fetched: daily({ USD: "1", EUR: "1.1" }),
    });
    await expect(
      resolvePurchaseDateHistoricalRate(
        {
          purchaseDate: DATE,
          metal: "GOLD",
          purchaseCurrency: "EGP",
        },
        deps
      )
    ).resolves.toEqual({
      status: "unavailable",
      reason: "purchase_currency_unavailable",
    });
  });

  it("keeps offline cache misses explicit and never invents a current-rate fallback", async () => {
    const deps = dependencies({ cache: null });
    const result = await resolvePurchaseDateHistoricalRate(
      {
        purchaseDate: DATE,
        metal: "GOLD",
        purchaseCurrency: "EGP",
        allowNetwork: false,
      },
      deps
    );
    expect(result).toEqual({ status: "unavailable", reason: "cache_miss" });
    expect(deps.fetchDaily).not.toHaveBeenCalled();
  });

  it("maps provider exact-date absence separately from dependency failure", async () => {
    const unavailable = dependencies({
      fetchError: new MetalHistoricalRateFetchError(
        METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.DATE_UNAVAILABLE
      ),
    });
    await expect(
      resolvePurchaseDateHistoricalRate(
        { purchaseDate: DATE, metal: "GOLD", purchaseCurrency: "EGP" },
        unavailable
      )
    ).resolves.toEqual({
      status: "unavailable",
      reason: "date_unavailable",
    });

    const failed = dependencies({
      fetchError: new Error("network down"),
    });
    const result = await resolvePurchaseDateHistoricalRate(
      { purchaseDate: DATE, metal: "GOLD", purchaseCurrency: "EGP" },
      failed
    );
    expect(result.status).toBe("fetch_failed");
  });

  it.each(["owner", "cancel"] as const)(
    "does not cache a pending Add response after %s changes",
    async (change) => {
      const deps = dependencies();
      const controller = new AbortController();
      const dailyResponse = createDeferred<HistoricalDailyRateRecord>();
      let started: (() => void) | null = null;
      const fetchStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      deps.fetchDaily.mockImplementation(() => {
        started?.();
        return dailyResponse.promise;
      });
      const pending = resolvePurchaseDateHistoricalRate(
        {
          purchaseDate: DATE,
          metal: "GOLD",
          purchaseCurrency: "EGP",
          expectedUserId: "user-1",
          signal: controller.signal,
        },
        deps
      );
      await fetchStarted;
      expect(deps.fetchDaily).toHaveBeenCalledWith(DATE, controller.signal);
      if (change === "owner")
        mockAssertExpectedCurrentUser.mockRejectedValue(
          new Error("auth_scope_changed")
        );
      else controller.abort();
      dailyResponse.resolve(daily());
      await expect(pending).resolves.toEqual(
        expect.objectContaining({ status: "fetch_failed" })
      );
      expect(deps.saveCache).not.toHaveBeenCalled();
    }
  );

  it("passes captured owner and cancellation into the final serialized cache write", async () => {
    const deps = dependencies();
    const controller = new AbortController();
    await resolvePurchaseDateHistoricalRate(
      {
        purchaseDate: DATE,
        metal: "GOLD",
        purchaseCurrency: "EGP",
        expectedUserId: "user-1",
        signal: controller.signal,
      },
      deps
    );
    expect(deps.saveCache).toHaveBeenCalledWith(daily(), undefined, {
      expectedUserId: "user-1",
      signal: controller.signal,
    });
  });
});

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
