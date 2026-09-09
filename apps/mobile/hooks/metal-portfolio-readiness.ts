export interface MetalPortfolioReadinessInput {
  readonly assetIdsKey: string;
  readonly assetMetalsDependencyKey: string | null;
  readonly assetsReady: boolean;
  readonly currencyReady: boolean;
  readonly historyDependencyKey: string | null;
  readonly holdingStatesKey: string;
  readonly holdingStatesReady: boolean;
  readonly ratesReady: boolean;
}

export interface MetalPortfolioSectionReadiness {
  readonly holdings: boolean;
  readonly rateCurrency: boolean;
  readonly recentHistory: boolean;
  readonly summary: boolean;
}

export function resolveMetalPortfolioReadiness(
  input: MetalPortfolioReadinessInput
): MetalPortfolioSectionReadiness {
  const assetMetalsReady =
    input.assetsReady && input.assetMetalsDependencyKey === input.assetIdsKey;
  const holdingFactsReady = assetMetalsReady && input.holdingStatesReady;
  const rateCurrency = input.ratesReady && input.currencyReady;
  const recentHistory =
    holdingFactsReady && input.historyDependencyKey === input.holdingStatesKey;

  return Object.freeze({
    holdings: holdingFactsReady && rateCurrency,
    rateCurrency,
    recentHistory,
    summary: holdingFactsReady && rateCurrency,
  });
}
