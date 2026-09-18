export interface MetalPortfolioReadinessInput {
  readonly assetIdsKey: string;
  readonly assetMetalsDependencyKey: string | null;
  readonly assetsReady: boolean;
  readonly currencyReady: boolean;
  readonly historyDependencyKey: string | null;
  readonly holdingStatesKey: string;
  readonly holdingStatesReady: boolean;
  readonly ratesReady: boolean;
  readonly saleEvidenceReady: boolean;
}

export interface MetalPortfolioSectionReadiness {
  readonly holdings: boolean;
  readonly rateCurrency: boolean;
  readonly recentHistory: boolean;
  readonly realizedSale: boolean;
  readonly summary: boolean;
}

export function resolveMetalPortfolioReadiness(
  input: MetalPortfolioReadinessInput
): MetalPortfolioSectionReadiness {
  const assetMetalsReady =
    input.assetsReady && input.assetMetalsDependencyKey === input.assetIdsKey;
  const holdingFactsReady = assetMetalsReady && input.holdingStatesReady;
  // Lifecycle events stream from a separate subscription than the holding
  // states. An active holding is only effectively trusted once the lifecycle
  // event it references has been observed for the current holding-states key;
  // until then the section stays pending instead of shaping a holding whose
  // event link has not settled. This models delayed subscription readiness
  // without rewriting any financial fact to fake readiness.
  const lifecycleEventsReady =
    input.historyDependencyKey === input.holdingStatesKey;
  const lifecycleFactsReady = holdingFactsReady && lifecycleEventsReady;
  const rateCurrency = input.ratesReady && input.currencyReady;
  // Realized sale results additionally depend on the sell-group and captured
  // sale rate-reference snapshots. Active holdings and their current values
  // stay visible while these secondary streams settle; only the realized-sale
  // dependent presentation waits.
  const realizedSale = lifecycleFactsReady && input.saleEvidenceReady;

  return Object.freeze({
    holdings: lifecycleFactsReady,
    rateCurrency,
    recentHistory: lifecycleFactsReady,
    realizedSale,
    summary: lifecycleFactsReady && rateCurrency,
  });
}
