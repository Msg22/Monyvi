import type { ImageSourcePropType } from "react-native";

import GoldBarImage from "./gold-bar.png";
import GoldCoinImage from "./gold-coin.png";
import GoldJewelryImage from "./gold-jewelry.png";
import SilverBarImage from "./silver-bar.png";
import SilverCoinImage from "./silver-coin.png";

export const METAL_RENDER_METALS = ["gold", "silver"] as const;
export const METAL_RENDER_FORMS = ["bar", "coin", "jewelry"] as const;

export type MetalRenderMetal = (typeof METAL_RENDER_METALS)[number];
export type MetalRenderForm = (typeof METAL_RENDER_FORMS)[number];

interface MetalRenderIdentity {
  readonly metalLabelKey: `metal.${MetalRenderMetal}` | "metal.unknown";
  readonly formLabelKey: `form.${MetalRenderForm}` | "form.unknown";
  readonly accessibilityLabelKey: "render.objectAccessibility" | "render.neutralFallback";
}

export interface MetalRenderObjectEntry extends MetalRenderIdentity {
  readonly kind: "object";
  readonly source: ImageSourcePropType;
  readonly sha256: string;
  readonly provenance: "nile-current-v1-flow/objects";
}

export interface MetalRenderNeutralEntry extends MetalRenderIdentity {
  readonly kind: "neutral";
  readonly source: null;
  readonly sha256: null;
  readonly provenance: "documented-neutral-fallback";
}

export type MetalRenderEntry = MetalRenderObjectEntry | MetalRenderNeutralEntry;
export type MetalRenderKey = `${MetalRenderMetal}:${MetalRenderForm}`;

function objectEntry(
  metal: MetalRenderMetal,
  form: MetalRenderForm,
  source: ImageSourcePropType,
  sha256: string
): MetalRenderObjectEntry {
  return Object.freeze({
    kind: "object",
    source,
    sha256,
    provenance: "nile-current-v1-flow/objects",
    metalLabelKey: `metal.${metal}`,
    formLabelKey: `form.${form}`,
    accessibilityLabelKey: "render.objectAccessibility",
  });
}

function neutralEntry(
  metal: MetalRenderMetal | "unknown",
  form: MetalRenderForm | "unknown"
): MetalRenderNeutralEntry {
  return Object.freeze({
    kind: "neutral",
    source: null,
    sha256: null,
    provenance: "documented-neutral-fallback",
    metalLabelKey: `metal.${metal}`,
    formLabelKey: `form.${form}`,
    accessibilityLabelKey: "render.neutralFallback",
  });
}

export const METAL_RENDER_MANIFEST: Readonly<Record<MetalRenderKey, MetalRenderEntry>> =
  Object.freeze({
    "gold:bar": objectEntry(
      "gold",
      "bar",
      GoldBarImage,
      "7061bc041ea0d39cb9d117f5303d7173a179fbf21df9c5139adc63154ce44889"
    ),
    "gold:coin": objectEntry(
      "gold",
      "coin",
      GoldCoinImage,
      "e842f37296abc38a96f9fe0646f3a07e5d5b38910c6b385291e0bd48599d2457"
    ),
    "gold:jewelry": objectEntry(
      "gold",
      "jewelry",
      GoldJewelryImage,
      "4925134a9ca2c46a0d14b96bc23db56ed2f97577d7fc60887088521782c20466"
    ),
    "silver:bar": objectEntry(
      "silver",
      "bar",
      SilverBarImage,
      "96b993e8ef32a1bd0d6320b3581c1e503d5f8b6f4c3eb57ceeabfcdab9b48633"
    ),
    "silver:coin": objectEntry(
      "silver",
      "coin",
      SilverCoinImage,
      "9081e7e0dc2e79af4185ce549b6a5359155d72576aa38b50f402c7f36bccd8eb"
    ),
    "silver:jewelry": neutralEntry("silver", "jewelry"),
  });

const UNKNOWN_RENDER_ENTRY = neutralEntry("unknown", "unknown");

export function getMetalRenderEntry(
  metal: MetalRenderMetal,
  form: MetalRenderForm
): MetalRenderEntry {
  const key = `${metal}:${form}` as MetalRenderKey;
  return METAL_RENDER_MANIFEST[key] ?? UNKNOWN_RENDER_ENTRY;
}
