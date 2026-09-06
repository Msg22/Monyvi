import { getMetalRenderEntry } from "@/assets/images/metals/manifest";
import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";
import { resolvePuritySelection } from "@monyvi/logic";

export interface MetalHoldingPresentation {
  readonly formKey:
    | "form.bar"
    | "form.coin"
    | "form.jewelry"
    | "form.unknown";
  readonly metalKey: "metal.gold" | "metal.silver";
  readonly purityLabelKey: string | null;
  readonly render: ReturnType<typeof getMetalRenderEntry>;
}

export function getMetalHoldingPresentation(
  holding: MetalPortfolioHoldingInput
): MetalHoldingPresentation {
  const form = normalizeForm(holding.physicalForm);
  const render = getMetalRenderEntry(
    holding.metalType.toLowerCase(),
    form ?? "unknown"
  );
  const purity =
    holding.purityCatalogVersion === "1" && holding.purityCode !== null
      ? resolvePuritySelection(holding.metalType, holding.purityCode)
      : null;

  return {
    formKey: render.formLabelKey,
    metalKey: holding.metalType === "GOLD" ? "metal.gold" : "metal.silver",
    purityLabelKey:
      purity?.available === true ? purity.entry.labelKey : null,
    render,
  };
}

function normalizeForm(
  value: string | null
): "bar" | "coin" | "jewelry" | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "bar" ||
    normalized === "coin" ||
    normalized === "jewelry"
    ? normalized
    : null;
}
