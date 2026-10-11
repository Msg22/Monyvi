import { Q, type Database } from "@nozbe/watermelondb";
import type { Asset, AssetMetal, MetalHoldingState } from "@monyvi/db";
import {
  compareDecimal,
  formatCanonicalDecimalForDisplay,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  resolveMetalsCurrencyMinorUnits,
  serializeDecimal,
} from "@monyvi/logic";

import { loadDisposeTerminalRateSnapshots } from "./dispose-metal-holding-read-model-service";
import { formatMetalLocalCalendarDate } from "./metal-financial-action-repository";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import { createSellMetalHoldingProductionService } from "./sell-metal-holding-production-service";
import {
  buildSellMetalHoldingPreview,
  type SellMetalHoldingPreview,
} from "./sell-metal-holding-preview-service";
import type {
  SellMetalHoldingCommandInput,
  SellMetalRateSnapshot,
} from "./sell-metal-holding-command-service";
import type {
  SellMetalHoldingHookCommand,
  SellMetalHoldingValues,
} from "./sell-metal-holding-form-contract";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

export interface SellableMetalHolding {
  readonly holdingId: string;
  readonly userId: string;
  readonly name: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly purchaseCurrency: string;
  readonly purchaseCostDecimal: string | null;
  readonly purchaseDate: string;
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string | null;
  readonly weightLabel: string;
}

export interface SellMetalHoldingFormCommand extends SellMetalHoldingHookCommand {
  readonly holding: SellableMetalHolding;
  readonly latestAllowedCalendarDate: string;
}

const EFFECTIVE_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "reconciled",
]);

export async function loadSellableMetalHolding(
  database: Database,
  holdingId: string,
  locale: string
): Promise<SellableMetalHolding> {
  const scope = await getCurrentUserDataScope();
  const [assets, states] = await Promise.all([
    scope
      .queryOwned(
        database.get<Asset>("assets"),
        Q.where("id", holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
  ]);
  const asset = assets[0] ? scope.assertOwned(assets[0]) : null;
  const state = states[0] ? scope.assertOwned(states[0]) : null;
  if (!asset || !state || asset.type !== "METAL")
    throw new Error("metal_holding_not_found");
  if (state.status !== "active") throw new Error("metal_holding_not_active");
  if (!state.isVisible || !EFFECTIVE_STATES.has(state.reconciliationState))
    throw new Error("metal_sell_effective_active_holding_required");
  const [metal] = await scope
    .queryChildrenOfOwnedParent(
      database.get<AssetMetal>("asset_metals"),
      asset,
      "asset_id",
      Q.where("deleted", false),
      Q.take(1)
    )
    .fetch();
  const purchaseCurrency = asset.purchaseCurrency;
  if (
    !metal ||
    (metal.metalType !== "GOLD" && metal.metalType !== "SILVER") ||
    purchaseCurrency === null ||
    !isSupportedMetalsIsoCurrencyCode(purchaseCurrency)
  )
    throw new Error("metal_holding_not_found");
  await assertExpectedCurrentUser(scope.userId);
  return Object.freeze({
    holdingId: asset.id,
    userId: scope.userId,
    name: asset.name,
    metalType: metal.metalType,
    purchaseCurrency,
    purchaseCostDecimal: asset.purchasePriceDecimal,
    purchaseDate: formatMetalLocalCalendarDate(asset.purchaseDate),
    expectedFinancialRevision: state.financialRevision,
    predecessorEventId: state.effectiveEventId,
    weightLabel:
      metal.weightGramsDecimal === null
        ? ""
        : formatCanonicalDecimalForDisplay(metal.weightGramsDecimal, {
            locale,
            maximumFractionDigits: 3,
          }),
  });
}

export function previewSellMetalHolding(
  holding: SellableMetalHolding,
  values: SellMetalHoldingValues,
  today: string
): SellMetalHoldingPreview {
  return buildSellMetalHoldingPreview({
    ...values,
    latestAllowedCalendarDate: today,
    purchaseDate: holding.purchaseDate,
    purchaseCurrency: holding.purchaseCurrency,
    purchaseCostDecimal: holding.purchaseCostDecimal,
    metalType: holding.metalType,
    pureGramsDecimal: null,
    acquisitionMetalRate: null,
    acquisitionCurrencyRate: null,
    saleMetalRate: null,
    purchaseCurrencyAtSaleRate: null,
    proceedsCurrencyAtSaleRate: null,
  });
}

export interface SellMetalHoldingDisplayPreview {
  readonly netProceedsLabel: string | null;
  readonly resultLabel: string | null;
  readonly resultDirection: "positive" | "negative" | "zero" | "unavailable";
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly canSubmit: boolean;
}

export function formatSellMetalHoldingPreview(
  preview: SellMetalHoldingPreview,
  currency: string,
  locale: string
): SellMetalHoldingDisplayPreview {
  if (!isSupportedMetalsIsoCurrencyCode(currency))
    throw new Error("metal_sale_currency_mismatch");
  const places = resolveMetalsCurrencyMinorUnits(`currency:${currency}`);
  if (places === null) throw new Error("metal_sale_currency_mismatch");
  const format = (amount: string): string =>
    formatLocalizedMoneyAmount({
      amount,
      currency,
      language: locale.startsWith("ar") ? "ar" : "en",
      maximumFractionDigits: places,
      minimumFractionDigits: places,
      englishPresentation: "code-prefix",
    });
  const amount = preview.realizedProfitLossDecimal;
  const direction = amount === null ? null : compareDecimal(amount, "0");
  return {
    ...preview,
    netProceedsLabel:
      preview.netProceedsDecimal === null
        ? null
        : format(preview.netProceedsDecimal),
    resultLabel:
      amount === null
        ? null
        : format(
            serializeDecimal(parseCanonicalDecimal(amount).absoluteValue())
          ),
    resultDirection:
      direction === null
        ? "unavailable"
        : direction > 0
          ? "positive"
          : direction < 0
            ? "negative"
            : "zero",
  };
}

export interface SellMetalHoldingFormExecutor {
  readonly execute: (request: SellMetalHoldingFormCommand) => Promise<void>;
}

export function createSellMetalHoldingFormExecutor(
  database: Database,
  createId: () => string
): SellMetalHoldingFormExecutor {
  const service = createSellMetalHoldingProductionService(database);
  let retained: {
    readonly actionId: string;
    readonly command: SellMetalHoldingCommandInput;
  } | null = null;
  return Object.freeze({
    execute: async (request: SellMetalHoldingFormCommand): Promise<void> => {
      await assertExpectedCurrentUser(request.holding.userId);
      if (request.values.saleCurrency !== request.holding.purchaseCurrency)
        throw new Error("metal_sale_currency_mismatch");
      if (retained?.actionId !== request.ids.actionId) {
        const preview = previewSellMetalHolding(
          request.holding,
          request.values,
          request.latestAllowedCalendarDate
        );
        if (
          !preview.canSubmit ||
          preview.grossProceedsMinorUnits === null ||
          preview.feeMinorUnits === null ||
          preview.netProceedsMinorUnits === null
        )
          throw new Error("metal_sale_invalid_form");
        const drafts = await loadDisposeTerminalRateSnapshots(
          request.holding.holdingId,
          request.values.saleDate
        );
        const purchase = drafts.find(
          (draft) => draft.role === "terminal_purchase_currency"
        );
        const snapshots: readonly SellMetalRateSnapshot[] =
          purchase && drafts.length === 2
            ? [
                ...drafts.map(
                  (draft): SellMetalRateSnapshot => ({
                    ...draft,
                    referenceId: createId(),
                  })
                ),
                {
                  ...purchase,
                  role: "terminal_proceeds_currency",
                  referenceId: createId(),
                },
              ]
            : [];
        retained = {
          actionId: request.ids.actionId,
          command: {
            ...request.ids,
            holdingId: request.holding.holdingId,
            userId: request.holding.userId,
            predecessorEventId: request.holding.predecessorEventId,
            occurredAt: new Date().toISOString(),
            latestAllowedCalendarDate: request.latestAllowedCalendarDate,
            saleDate: request.values.saleDate,
            expectedFinancialRevision:
              request.holding.expectedFinancialRevision,
            metalType: request.holding.metalType,
            purchaseCurrency: request.holding.purchaseCurrency,
            saleCurrency: request.values.saleCurrency,
            grossProceedsMinorUnits: preview.grossProceedsMinorUnits,
            feeMinorUnits: preview.feeMinorUnits,
            netProceedsMinorUnits: preview.netProceedsMinorUnits,
            notes: request.values.notes === "" ? null : request.values.notes,
            rateSnapshots: snapshots,
          },
        };
      }
      await assertExpectedCurrentUser(request.holding.userId);
      await service.sell(retained.command);
    },
  });
}
