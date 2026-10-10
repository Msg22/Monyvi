const mockInvokeAuthenticatedEdgeFunction = jest.fn();
const mockGetEdgeFunctionErrorStatus = jest.fn();

jest.mock("../../services/authenticated-edge-function-service", () => ({
  invokeAuthenticatedEdgeFunction: (
    functionName: string,
    options: unknown
  ): Promise<unknown> =>
    mockInvokeAuthenticatedEdgeFunction(functionName, options),
  getEdgeFunctionErrorStatus: (error: unknown): number | undefined =>
    mockGetEdgeFunctionErrorStatus(error),
}));

import {
  METAL_HISTORICAL_RATE_FETCH_ERROR_CODES,
  fetchHistoricalDailyRate,
} from "../../services/metal-historical-rate-fetch-service";
import {
  normalizeHistoricalMetalTroyOunceToPureGramDecimal,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

function record(): HistoricalDailyRateRecord {
  const gold = "3110.34768";
  const silver = "31.1034768";
  return {
    contractVersion: 1,
    providerKey: "metals.dev",
    rateDate: "2026-10-10",
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: gold,
    silverUsdPerTroyOunceDecimal: silver,
    goldUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(gold) ?? "",
    silverUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(silver) ?? "",
    currenciesUsdPerUnit: { USD: "1", EGP: "0.02" },
    providerResponseTimestamp: null,
    fetchedAt: "2026-10-10T15:00:00.000Z",
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    source: "metals.dev",
    quality: "valid",
  };
}

describe("#355 authenticated historical Edge fetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests the exact date from the authenticated server-only endpoint", async () => {
    mockInvokeAuthenticatedEdgeFunction.mockResolvedValue({
      data: { success: true, record: record() },
      error: null,
    });

    await expect(fetchHistoricalDailyRate("2026-10-10")).resolves.toEqual(
      record()
    );
    expect(mockInvokeAuthenticatedEdgeFunction).toHaveBeenCalledWith(
      "fetch-historical-metal-rate",
      { body: { date: "2026-10-10" } }
    );
  });

  it("maps an exact-date 404 without inventing a fallback", async () => {
    const error = new Error("function returned 404");
    mockInvokeAuthenticatedEdgeFunction.mockResolvedValue({
      data: null,
      error,
    });
    mockGetEdgeFunctionErrorStatus.mockReturnValue(404);

    await expect(fetchHistoricalDailyRate("2026-10-10")).rejects.toMatchObject({
      name: "MetalHistoricalRateFetchError",
      code: METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.DATE_UNAVAILABLE,
    });
  });

  it("rejects malformed or different-date response records", async () => {
    mockInvokeAuthenticatedEdgeFunction.mockResolvedValue({
      data: {
        success: true,
        record: { ...record(), rateDate: "2026-10-09" },
      },
      error: null,
    });

    await expect(fetchHistoricalDailyRate("2026-10-10")).rejects.toMatchObject({
      code: METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.INVALID_RESPONSE,
    });
  });
});
