import {
  database,
  type Asset,
  type AssetMetal,
  type FinancialActionGroup,
  type MetalActionEvidence,
  type MetalHoldingState,
  type MetalLifecycleEvent,
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
  selectCanonicalOrOnly,
  toRateReferenceInput,
} from "./metal-detail-read-model-shaping";
import {
  resolveMetalDetailPurchaseCalendar,
  type ResolvedMetalDetailPurchaseCalendar,
} from "./metal-detail-purchase-calendar-service";
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
  const [metals, states, references, events, evidence, groups] =
    await Promise.all([
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
      scope
        .queryOwned(
          database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
          Q.where("holding_id", asset.id),
          Q.where("deleted", false)
        )
        .fetch(),
      scope
        .queryOwned(
          database.get<MetalActionEvidence>("metal_action_evidence"),
          Q.where("holding_id", asset.id),
          Q.where("deleted", false)
        )
        .fetch(),
      scope
        .queryOwned(
          database.get<FinancialActionGroup>("financial_action_groups"),
          Q.where("domain", "metals"),
          Q.where("domain_reference_id", asset.id),
          Q.where("deleted", false)
        )
        .fetch(),
    ]);
  const metal = selectCanonicalOrOnly(metals, asset.id);
  const state = selectCanonicalOrOnly(states, asset.id);
  if (
    metal === null ||
    state === null ||
    state.status !== "active" ||
    !state.isVisible ||
    !isSupportedMetal(metal.metalType)
  )
    return null;
  const calendar = resolveMetalDetailPurchaseCalendar({
    asset,
    metal,
    state,
    events,
    evidence,
    groups,
  });
  const context = createHistoricalDetailContext(
    asset,
    metal,
    metal.metalType,
    references.map(toRateReferenceInput),
    calendar
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
  rateReferences: ReadonlyArray<Readonly<Record<string, unknown>>>,
  calendar: ResolvedMetalDetailPurchaseCalendar | null
): HistoricalMetalDetailCompositionInput {
  const acquisitionActionId =
    calendar !== null &&
    calendar.acquisitionActionId === asset.acquisitionActionId
      ? calendar.acquisitionActionId
      : null;
  return {
    acquisitionActionId,
    purchaseDate: calendar?.purchaseDate ?? null,
    metal: metalType,
    purityCode: metal.purityCode,
    purityFactorDecimal: metal.purityFactorDecimal,
    purchaseCurrency: asset.purchaseCurrency,
    rateReferences: rateReferences.filter(
      (reference): boolean =>
        acquisitionActionId !== null &&
        reference["actionId"] === acquisitionActionId &&
        (reference["role"] === "acquisition_metal" ||
          reference["role"] === "acquisition_purchase_currency")
    ),
  };
}
