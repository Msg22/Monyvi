import type { RawObservedRateReference, SupportedMetal } from "@monyvi/logic";

import {
  readHistoricalMetalDetailReference,
  type HistoricalMetalDetailReference,
} from "./metal-historical-detail-facade-service";

export interface HistoricalMetalDetailCompositionInput {
  readonly acquisitionActionId: string | null;
  readonly purchaseDate: string | null;
  readonly metal: SupportedMetal;
  readonly purityCode: string | null;
  readonly purityFactorDecimal: string | null;
  readonly purchaseCurrency: string | null;
  readonly rateReferences: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly allowNetwork?: boolean;
  readonly expectedUserId?: string;
  readonly signal?: AbortSignal;
}

export interface HistoricalMetalDetailCompositionDependencies {
  readonly readHistoricalReference: typeof readHistoricalMetalDetailReference;
}

const DEFAULT_DEPENDENCIES: HistoricalMetalDetailCompositionDependencies = {
  readHistoricalReference: readHistoricalMetalDetailReference,
};

export async function composeHistoricalMetalDetailReference(
  input: HistoricalMetalDetailCompositionInput,
  dependencies: HistoricalMetalDetailCompositionDependencies = DEFAULT_DEPENDENCIES
): Promise<HistoricalMetalDetailReference | null> {
  if (
    input.purchaseDate === null ||
    input.purchaseCurrency === null ||
    input.purityCode === null ||
    input.purityFactorDecimal === null
  ) {
    return null;
  }

  const acquisitionMetalReference = findActionReference(
    input.rateReferences,
    input.acquisitionActionId,
    "acquisition_metal"
  );
  const acquisitionCurrencyReference = findActionReference(
    input.rateReferences,
    input.acquisitionActionId,
    "acquisition_purchase_currency"
  );

  return dependencies.readHistoricalReference({
    purchaseDate: input.purchaseDate,
    metal: input.metal,
    purityCode: input.purityCode,
    purityFactorDecimal: input.purityFactorDecimal,
    purchaseCurrency: input.purchaseCurrency,
    acquisitionMetalReference,
    acquisitionCurrencyReference,
    allowNetwork: input.allowNetwork ?? false,
    expectedUserId: input.expectedUserId,
    signal: input.signal,
  });
}

function findActionReference(
  references: ReadonlyArray<Readonly<Record<string, unknown>>>,
  actionId: string | null,
  role: "acquisition_metal" | "acquisition_purchase_currency"
): RawObservedRateReference {
  if (actionId === null) return undefined;
  return references.find(
    (reference) =>
      reference["actionId"] === actionId && reference["role"] === role
  );
}
