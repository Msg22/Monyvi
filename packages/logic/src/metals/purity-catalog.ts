export type SupportedMetal = "GOLD" | "SILVER";

export interface PurityCatalogEntry {
  readonly code: string;
  readonly metal: SupportedMetal;
  readonly label: string;
  readonly factorDecimal: string;
  readonly catalogVersion: "1";
}

export interface PuritySnapshot {
  readonly code: string;
  readonly catalogVersion: "1";
  readonly factorDecimal: string;
}

export type PurityResolution =
  | { readonly available: true; readonly entry: PurityCatalogEntry }
  | {
      readonly available: false;
      readonly reason:
        | "unsupported_metal"
        | "ambiguous_purity"
        | "unknown_purity";
    };

export const PURITY_CATALOG_VERSION = "1" as const;

const PURITY_CATALOG: readonly PurityCatalogEntry[] = Object.freeze([
  entry("gold-9999", "GOLD", "24K · 999.9", "0.9999"),
  entry("gold-999", "GOLD", "24K · 999", "0.999"),
  entry("gold-995", "GOLD", "995 bullion", "0.995"),
  entry("gold-97916", "GOLD", "23.5K · 979.16", "0.97916"),
  entry("gold-9167", "GOLD", "22K · 916.7", "0.9167"),
  entry("gold-875", "GOLD", "21K · 875", "0.875"),
  entry("gold-750", "GOLD", "18K · 750", "0.75"),
  entry("gold-58333", "GOLD", "14K · 583.33", "0.58333"),
  entry("gold-500", "GOLD", "12K · 500", "0.5"),
  entry("gold-375", "GOLD", "9K · 375", "0.375"),
  entry("silver-9999", "SILVER", "999.9 bullion", "0.9999"),
  entry("silver-999", "SILVER", "999 bullion", "0.999"),
  entry("silver-925", "SILVER", "925", "0.925"),
  entry("silver-900", "SILVER", "900", "0.9"),
  entry("silver-800", "SILVER", "800", "0.8"),
  entry("silver-600", "SILVER", "600", "0.6"),
]);

export function getPurityCatalog(): readonly PurityCatalogEntry[] {
  return PURITY_CATALOG;
}

export function getPurityEntry(
  metal: SupportedMetal,
  code: string
): PurityCatalogEntry {
  const catalogEntry = PURITY_CATALOG.find(
    (candidate) => candidate.metal === metal && candidate.code === code
  );

  if (catalogEntry === undefined) {
    throw new Error(`Unknown purity code for ${metal}`);
  }

  return catalogEntry;
}

export function createPuritySnapshot(
  metal: SupportedMetal,
  code: string
): PuritySnapshot {
  const catalogEntry = getPurityEntry(metal, code);
  return Object.freeze({
    code: catalogEntry.code,
    catalogVersion: catalogEntry.catalogVersion,
    factorDecimal: catalogEntry.factorDecimal,
  });
}

export function resolvePuritySelection(
  metal: string,
  label: string
): PurityResolution {
  if (!isSupportedMetal(metal)) {
    return { available: false, reason: "unsupported_metal" };
  }
  if (metal === "GOLD" && label === "24K") {
    return { available: false, reason: "ambiguous_purity" };
  }

  const catalogEntry = PURITY_CATALOG.find(
    (candidate) => candidate.metal === metal && candidate.label === label
  );
  return catalogEntry === undefined
    ? { available: false, reason: "unknown_purity" }
    : { available: true, entry: catalogEntry };
}

function entry(
  code: string,
  metal: SupportedMetal,
  label: string,
  factorDecimal: string
): PurityCatalogEntry {
  return Object.freeze({
    code,
    metal,
    label,
    factorDecimal,
    catalogVersion: PURITY_CATALOG_VERSION,
  });
}

function isSupportedMetal(metal: string): metal is SupportedMetal {
  return metal === "GOLD" || metal === "SILVER";
}
