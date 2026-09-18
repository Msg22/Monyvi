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
        saleEvidenceReady: true,
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
        saleEvidenceReady: true,
      })
    ).toEqual({
      holdings: true,
      rateCurrency: false,
      recentHistory: true,
      realizedSale: true,
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
        saleEvidenceReady: true,
      })
    ).toEqual({
      holdings: false,
      rateCurrency: true,
      recentHistory: false,
      realizedSale: false,
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
      saleEvidenceReady: true,
    });
    expect(pending).toEqual({
      holdings: false,
      rateCurrency: true,
      recentHistory: false,
      realizedSale: false,
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
      saleEvidenceReady: true,
    });
    expect(settled).toEqual({
      holdings: true,
      rateCurrency: true,
      recentHistory: true,
      realizedSale: true,
      summary: true,
    });
  });

  it("keeps active holdings, summary, and history visible while realized-sale evidence is still pending", () => {
    const pending = resolveMetalPortfolioReadiness({
      assetMetalsDependencyKey: "holding-1",
      assetIdsKey: "holding-1",
      assetsReady: true,
      currencyReady: true,
      historyDependencyKey: "holding-1:active",
      holdingStatesKey: "holding-1:active",
      holdingStatesReady: true,
      ratesReady: true,
      saleEvidenceReady: false,
    });
    // Only the realized-sale section is held back; the rest is already usable.
    expect(pending).toEqual({
      holdings: true,
      rateCurrency: true,
      recentHistory: true,
      realizedSale: false,
      summary: true,
    });

    const ready = resolveMetalPortfolioReadiness({
      assetMetalsDependencyKey: "holding-1",
      assetIdsKey: "holding-1",
      assetsReady: true,
      currencyReady: true,
      historyDependencyKey: "holding-1:active",
      holdingStatesKey: "holding-1:active",
      holdingStatesReady: true,
      ratesReady: true,
      saleEvidenceReady: true,
    });
    expect(ready.realizedSale).toBe(true);
  });
});
