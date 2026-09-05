import { getMetalRenderEntry } from "@/assets/images/metals/manifest";
import type { MetalPortfolioHoldingInput } from "@/services/metal-portfolio-read-model-service";
import { resolvePuritySelection } from "@monyvi/logic";

export interface MetalHoldingPresentation {
  readonly formKey: "form.bar" | "form.coin" | "form.jewelry" | "form.unknown";
  readonly metalKey: "metal.gold" | "metal.silver";
  readonly purityLabel: string | null;
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
    purityLabel:
      purity?.available === true
        ? formatPurityCode(purity.entry.code, holding.metalType)
        : null,
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

function formatPurityCode(
  code: string,
  metal: "GOLD" | "SILVER"
): string | null {
  const fineness = code.replace(`${metal.toLowerCase()}-`, "");
  if (!/^\d+$/.test(fineness)) {
    return null;
  }
  if (metal === "SILVER") {
    return fineness;
  }

  const karatByFineness: Readonly<Record<string, string>> = {
    "375": "9K",
    "500": "12K",
    "58333": "14K",
    "750": "18K",
    "875": "21K",
    "9167": "22K",
    "97916": "23.5K",
    "995": "24K",
    "999": "24K",
    "9999": "24K",
  };
  const karat = karatByFineness[fineness];
  return karat === undefined ? null : `${karat} · ${fineness}`;
}
