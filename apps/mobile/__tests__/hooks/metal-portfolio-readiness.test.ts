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

  it("keeps holdings and recent history independent from rate and currency readiness", () => {
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
      holdings: true,
      rateCurrency: false,
      recentHistory: true,
      summary: false,
    });
  });

  it("keeps rate/currency readiness independent from the lifecycle-events gate", () => {
    // Rates and preferred currency are settled, but the lifecycle-events
    // subscription has not emitted for the current holding-states key yet.
    // rateCurrency stays independently ready while the lifecycle-backed
    // sections remain pending.
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
      holdings: false,
      rateCurrency: true,
      recentHistory: false,
      summary: false,
    });
  });

  it("keeps holdings, summary, and history pending until the lifecycle events for the current states arrive", () => {
    const pending = resolveMetalPortfolioReadiness({
      assetMetalsDependencyKey: "holding-1",
      assetIdsKey: "holding-1",
      assetsReady: true,
      currencyReady: true,
      historyDependencyKey: "stale:revision",
      holdingStatesKey: "holding-1:active",
      holdingStatesReady: true,
      ratesReady: true,
    });
    expect(pending).toEqual({
      holdings: false,
      rateCurrency: true,
      recentHistory: false,
      summary: false,
    });

    const settled = resolveMetalPortfolioReadiness({
      assetMetalsDependencyKey: "holding-1",
      assetIdsKey: "holding-1",
      assetsReady: true,
      currencyReady: true,
      historyDependencyKey: "holding-1:active",
      holdingStatesKey: "holding-1:active",
      holdingStatesReady: true,
      ratesReady: true,
    });
    expect(settled).toEqual({
      holdings: true,
      rateCurrency: true,
      recentHistory: true,
      summary: true,
    });
  });
});
