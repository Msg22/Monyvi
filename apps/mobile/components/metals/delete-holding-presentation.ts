import { resolvePuritySelection } from "@monyvi/logic";

import type {
  DeleteMetalHoldingSheetCopy,
  DeleteMetalHoldingSheetProps,
} from "@/components/metals/DeleteMetalHoldingSheet";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

export type DeleteSheetTranslator = (
  key: string,
  options?: Record<string, string | number>
) => string;

export type DeleteHoldingSheetHolding = DeleteMetalHoldingSheetProps["holding"];

export function getDeleteHoldingSheetHolding(
  model: MetalDetailReadModel | null,
  t: DeleteSheetTranslator
): DeleteHoldingSheetHolding | null {
  if (model === null) return null;

  return {
    name: model.name,
    metalLabel: resolveSheetMetal(model, t),
    metaLabel: resolveSheetMeta(model, t),
  };
}

export function getDeleteHoldingSheetCopy(
  tMetals: DeleteSheetTranslator,
  tCommon: DeleteSheetTranslator,
  holdingName: string
): DeleteMetalHoldingSheetCopy {
  return {
    title: tMetals("actions.delete"),
    consequence: tMetals("delete.consequence"),
    confirm: tMetals("actions.delete"),
    pending: tMetals("delete.pending"),
    cancel: tCommon("cancel"),
    retry: tMetals("detail.retry"),
    offline: tMetals("delete.offline"),
    failure: tMetals("delete.failure"),
    accessibilityLabel: tMetals("delete.confirm_accessibility", {
      holdingName,
    }),
  };
}

function resolveSheetMetal(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator
): string {
  return t(model.metalType === "GOLD" ? "metal.gold" : "metal.silver");
}

function resolveSheetMeta(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator
): string {
  const formLabel = t(
    model.itemForm === null ? "form.unknown" : `form.${model.itemForm}`
  );
  return `${resolveSheetPurity(model, t)} · ${formLabel}`;
}

function resolveSheetPurity(
  model: MetalDetailReadModel,
  t: DeleteSheetTranslator
): string {
  if (model.purityCatalogVersion !== "1" || model.purityCode === null)
    return "—";

  const purity = resolvePuritySelection(model.metalType, model.purityCode);
  if (
    !purity.available ||
    purity.entry.factorDecimal !== model.purityFactorDecimal
  ) {
    return "—";
  }

  return t(purity.entry.labelKey);
}
