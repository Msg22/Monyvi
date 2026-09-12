import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  METAL_RENDER_MANIFEST,
  getMetalRenderEntry,
} from "../../../assets/images/metals/manifest";

const ASSET_ROOT = resolve(__dirname, "../../../assets/images/metals");
const expectedHashes = {
  "gold-bar.png": "7061bc041ea0d39cb9d117f5303d7173a179fbf21df9c5139adc63154ce44889",
  "gold-coin.png": "e842f37296abc38a96f9fe0646f3a07e5d5b38910c6b385291e0bd48599d2457",
  "gold-jewelry.png": "4925134a9ca2c46a0d14b96bc23db56ed2f97577d7fc60887088521782c20466",
  "silver-bar.png": "96b993e8ef32a1bd0d6320b3581c1e503d5f8b6f4c3eb57ceeabfcdab9b48633",
  "silver-coin.png": "9081e7e0dc2e79af4185ce549b6a5359155d72576aa38b50f402c7f36bccd8eb",
} as const;

describe("FR-103 production Metal render manifest", () => {
  it("maps every Gold/Silver form deterministically with neutral missing-key fallback", () => {
    for (const metal of ["gold", "silver"] as const) {
      for (const form of ["bar", "coin", "jewelry"] as const) {
        const first = getMetalRenderEntry(metal, form);
        expect(getMetalRenderEntry(metal, form)).toBe(first);
        expect(first.metalLabelKey).toBe(`metal.${metal}`);
        expect(first.formLabelKey).toBe(`form.${form}`);
      }
    }
    expect(getMetalRenderEntry("silver", "jewelry")).toMatchObject({
      kind: "neutral",
      source: null,
      accessibilityLabelKey: "render.neutralFallback",
    });
    expect(getMetalRenderEntry("gold", "Ring")).toMatchObject({
      kind: "neutral",
      metalLabelKey: "metal.gold",
      formLabelKey: "form.unknown",
      accessibilityLabelKey: "render.neutralFallback",
    });
    expect(getMetalRenderEntry("silver", null)).toMatchObject({
      kind: "neutral",
      metalLabelKey: "metal.silver",
      formLabelKey: "form.unknown",
      accessibilityLabelKey: "render.neutralFallback",
    });
    expect(getMetalRenderEntry("unsupported", "bar")).toMatchObject({
      kind: "neutral",
      metalLabelKey: "metal.unknown",
      formLabelKey: "form.unknown",
    });
  });

  it("contains the approved immutable object bytes and provenance hashes", () => {
    for (const [file, expectedHash] of Object.entries(expectedHashes)) {
      const hash = createHash("sha256").update(readFileSync(resolve(ASSET_ROOT, file))).digest("hex");
      expect(hash).toBe(expectedHash);
      expect(JSON.stringify(METAL_RENDER_MANIFEST)).toContain(expectedHash);
    }
  });

  it("exposes non-color text identity for every exact and fallback entry", () => {
    for (const entry of Object.values(METAL_RENDER_MANIFEST)) {
      expect(entry.metalLabelKey).toMatch(/^metal\./);
      expect(entry.formLabelKey).toMatch(/^form\./);
      expect(entry.accessibilityLabelKey).toMatch(/^render\./);
    }
  });
});
