import type { CurrencyType } from "@monyvi/db";
import {
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  serializeDecimal,
  type MetalsIsoCurrencyCode,
  type SupportedMetal,
} from "@monyvi/logic";

import type {
  LiveRatesTrustReadModel,
  LiveRatesTrustValue,
} from "./live-rates-trust-read-model-service";
import type {
  MetalSellGroupSnapshot,
  MetalSellHoldingSnapshot,
} from "./metal-realized-sale-read-model-service";

interface PortfolioSaleAssetSnapshot {
  readonly acquisitionActionId?: string | null;
  readonly id: string;
  readonly userId: string;
}

interface PortfolioSaleHoldingStateSnapshot {
  readonly effectiveEventId: string | null;
  readonly isVisible: boolean;
  readonly reconciliationState: string;
}

interface PortfolioSaleExactFacts {
  readonly purityFactorDecimal: string | null;
  readonly purchaseCurrency: MetalsIsoCurrencyCode | null;
  readonly purchasePriceDecimal: string | null;
  readonly weightGramsDecimal: string | null;
}

export function toPortfolioSaleGroup(
  event: { readonly actionId?: string | null } | undefined,
  groupsByActionId: ReadonlyMap<string, MetalSellGroupSnapshot>
): MetalSellGroupSnapshot | null {
  const actionId = event?.actionId;
  return typeof actionId === "string"
    ? (groupsByActionId.get(actionId) ?? null)
    : null;
}

export function toPortfolioSaleHolding(
  asset: PortfolioSaleAssetSnapshot,
  metalType: SupportedMetal,
  state: PortfolioSaleHoldingStateSnapshot,
  facts: PortfolioSaleExactFacts,
  status: "active" | "sold" | "disposed"
): MetalSellHoldingSnapshot {
  return {
    acquisitionActionId: asset.acquisitionActionId ?? null,
    effectiveEventId: state.effectiveEventId,
    holdingId: asset.id,
    isVisible: state.isVisible,
    metalType,
    purityFactorDecimal: facts.purityFactorDecimal,
    purchaseCurrency: facts.purchaseCurrency,
    purchasePriceDecimal: facts.purchasePriceDecimal,
    reconciliationState: state.reconciliationState,
    status,
    userId: asset.userId,
    weightGramsDecimal: facts.weightGramsDecimal,
  };
}

export function convertSoldAmountForPreferredDisplay(input: {
  readonly amountCurrency: MetalsIsoCurrencyCode;
  readonly amountDecimal: string;
  readonly currentRates: LiveRatesTrustReadModel;
  readonly preferredCurrency: CurrencyType;
}): string | null {
  if (!isSupportedMetalsIsoCurrencyCode(input.preferredCurrency)) {
    return null;
  }
  if (input.preferredCurrency === input.amountCurrency) {
    return serializeDecimal(parseCanonicalDecimal(input.amountDecimal));
  }
  const amountRate = readCurrentCurrencyRate(
    input.currentRates,
    input.amountCurrency
  );
  const preferredRate = readCurrentCurrencyRate(
    input.currentRates,
    input.preferredCurrency
  );
  if (amountRate === null || preferredRate === null) {
    return null;
  }
  try {
    return serializeDecimal(
      parseCanonicalDecimal(input.amountDecimal)
        .times(amountRate)
        .dividedBy(preferredRate)
    );
  } catch {
    return null;
  }
}

function readCurrentCurrencyRate(
  currentRates: LiveRatesTrustReadModel,
  currency: MetalsIsoCurrencyCode
): string | null {
  return currency === "USD"
    ? "1"
    : readAvailableRate(currentRates.currencies.get(currency));
}

function readAvailableRate(
  rate: LiveRatesTrustValue | undefined
): string | null {
  return rate !== undefined &&
    rate.state !== "missing" &&
    rate.state !== "invalid" &&
    typeof rate.valueDecimal === "string"
    ? rate.valueDecimal
    : null;
}
