import { resolveMetalPortfolioReadiness } from "@/hooks/metal-portfolio-readiness";

describe("metal portfolio section readiness", () => {
  it("does not treat an old empty child subscription as ready after assets arrive", () => {
    expect(
      resolveMetalPortfolioReadiness({
        assetMetalsDependencyKey: "",
        assetIdsKey: "holding-1",
        assetsReady: true,
        currencyReady: true,
        historyDependencyKey: "",
        holdingStatesKey: "holding-1:active",
        holdingStatesReady: true,
        ratesReady: true,
      })
    ).toMatchObject({
      holdings: false,
      summary: false,
    });
  });

  it("keeps recent history independent from rate and currency readiness", () => {
    expect(
      resolveMetalPortfolioReadiness({
        assetMetalsDependencyKey: "holding-1",
        assetIdsKey: "holding-1",
        assetsReady: true,
        currencyReady: false,
        historyDependencyKey: "holding-1:active",
        holdingStatesKey: "holding-1:active",
        holdingStatesReady: true,
        ratesReady: false,
      })
    ).toEqual({
      holdings: false,
      rateCurrency: false,
      recentHistory: true,
      summary: false,
    });
  });

  it("keeps rate/currency readiness independent from recent-history readiness", () => {
    expect(
      resolveMetalPortfolioReadiness({
        assetMetalsDependencyKey: "holding-1",
        assetIdsKey: "holding-1",
        assetsReady: true,
        currencyReady: true,
        historyDependencyKey: null,
        holdingStatesKey: "holding-1:active",
        holdingStatesReady: true,
        ratesReady: true,
      })
    ).toEqual({
      holdings: true,
      rateCurrency: true,
      recentHistory: false,
      summary: true,
    });
  });
});
