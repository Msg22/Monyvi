import {
  database,
  type Asset,
  type AssetMetal,
  type MetalHoldingState,
  type MetalRateReference,
} from "@monyvi/db";
import { isSupportedMetal, type SupportedMetal } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";

import {
  composeHistoricalMetalDetailReference,
  type HistoricalMetalDetailCompositionInput,
} from "./metal-historical-detail-composition-service";
import type { HistoricalMetalDetailReference } from "./metal-historical-detail-facade-service";
import {
  copyValidDate,
  toRateReferenceInput,
} from "./metal-detail-read-model-shaping";
import { formatMetalLocalCalendarDate } from "./metal-financial-action-repository";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "./user-data-access";

interface ReadMetalDetailHistoricalReferenceOptions {
  readonly holdingId: string;
  readonly userId: string;
  readonly contextKey: string;
  readonly signal: AbortSignal;
}

export async function readMetalDetailPurchaseDateMarketReference(
  options: ReadMetalDetailHistoricalReferenceOptions
): Promise<HistoricalMetalDetailReference | null> {
  const context = await readHistoricalDetailContext(options);
  if (context === null || options.signal.aborted) return null;
  const reference = await composeHistoricalMetalDetailReference({
    ...context,
    allowNetwork: true,
    expectedUserId: options.userId,
    signal: options.signal,
  });
  if (options.signal.aborted) return null;
  await assertExpectedCurrentUser(options.userId);
  const currentContext = await readHistoricalDetailContext(options);
  return currentContext === null || options.signal.aborted ? null : reference;
}

async function readHistoricalDetailContext(
  options: ReadMetalDetailHistoricalReferenceOptions
): Promise<HistoricalMetalDetailCompositionInput | null> {
  if (options.signal.aborted) return null;
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== options.userId)
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  const assets = await scope
    .queryOwned(
      database.get<Asset>("assets"),
      Q.where("id", options.holdingId),
      Q.where("type", "METAL"),
      Q.where("deleted", false),
      Q.take(2)
    )
    .fetch();
  const asset = assets.length === 1 ? assets[0] : null;
  if (asset === null) return null;
  const [metals, states, references] = await Promise.all([
    scope
      .queryChildrenOfOwnedParent(
        database.get<AssetMetal>("asset_metals"),
        asset,
        "asset_id",
        Q.where("deleted", false),
        Q.take(2)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", asset.id),
        Q.where("deleted", false),
        Q.take(2)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalRateReference>("metal_rate_references"),
        Q.where("holding_id", asset.id),
        Q.where("deleted", false),
        Q.sortBy("captured_at", Q.desc)
      )
      .fetch(),
  ]);
  const metal = metals.length === 1 ? metals[0] : null;
  const state = states.length === 1 ? states[0] : null;
  if (
    metal === null ||
    state === null ||
    state.status !== "active" ||
    !state.isVisible ||
    !isSupportedMetal(metal.metalType)
  )
    return null;
  const context = createHistoricalDetailContext(
    asset,
    metal,
    metal.metalType,
    references.map(toRateReferenceInput)
  );
  await assertExpectedCurrentUser(options.userId);
  return createHistoricalContextKey(scope.userId, asset.id, context) ===
    options.contextKey
    ? context
    : null;
}

export function createHistoricalContextKey(
  userId: string,
  holdingId: string,
  context: HistoricalMetalDetailCompositionInput
): string {
  return JSON.stringify([userId, holdingId, context]);
}

export function createHistoricalDetailContext(
  asset: Pick<
    Asset,
    "acquisitionActionId" | "purchaseDate" | "purchaseCurrency"
  >,
  metal: Pick<AssetMetal, "purityCode" | "purityFactorDecimal">,
  metalType: SupportedMetal,
  rateReferences: ReadonlyArray<Readonly<Record<string, unknown>>>
): HistoricalMetalDetailCompositionInput {
  const purchaseDate = copyValidDate(asset.purchaseDate);
  return {
    acquisitionActionId: asset.acquisitionActionId,
    purchaseDate:
      purchaseDate === null ? null : formatMetalLocalCalendarDate(purchaseDate),
    metal: metalType,
    purityCode: metal.purityCode,
    purityFactorDecimal: metal.purityFactorDecimal,
    purchaseCurrency: asset.purchaseCurrency,
    rateReferences: rateReferences.filter(
      (reference): boolean =>
        asset.acquisitionActionId !== null &&
        reference["actionId"] === asset.acquisitionActionId &&
        (reference["role"] === "acquisition_metal" ||
          reference["role"] === "acquisition_purchase_currency")
    ),
  };
}
