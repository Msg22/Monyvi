export type SupportedMetal = "GOLD" | "SILVER";
export type PurityLabelKey = `purity_${Lowercase<SupportedMetal>}_${string}`;

export interface PurityCatalogEntry {
  readonly code: string;
  readonly metal: SupportedMetal;
  readonly labelKey: PurityLabelKey;
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
        | "unknown_purity";
    };

export const PURITY_CATALOG_VERSION = "1" as const;

const PURITY_CATALOG: readonly PurityCatalogEntry[] = Object.freeze([
  entry("gold-9999", "GOLD", "purity_gold_9999", "0.9999"),
  entry("gold-999", "GOLD", "purity_gold_999", "0.999"),
  entry("gold-995", "GOLD", "purity_gold_995", "0.995"),
  entry("gold-97916", "GOLD", "purity_gold_97916", "0.97916"),
  entry("gold-9167", "GOLD", "purity_gold_9167", "0.9167"),
  entry("gold-875", "GOLD", "purity_gold_875", "0.875"),
  entry("gold-750", "GOLD", "purity_gold_750", "0.75"),
  entry("gold-58333", "GOLD", "purity_gold_58333", "0.58333"),
  entry("gold-500", "GOLD", "purity_gold_500", "0.5"),
  entry("gold-375", "GOLD", "purity_gold_375", "0.375"),
  entry("silver-9999", "SILVER", "purity_silver_9999", "0.9999"),
  entry("silver-999", "SILVER", "purity_silver_999", "0.999"),
  entry("silver-925", "SILVER", "purity_silver_925", "0.925"),
  entry("silver-900", "SILVER", "purity_silver_900", "0.9"),
  entry("silver-800", "SILVER", "purity_silver_800", "0.8"),
  entry("silver-600", "SILVER", "purity_silver_600", "0.6"),
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
  code: string
): PurityResolution {
  if (!isSupportedMetal(metal)) {
    return { available: false, reason: "unsupported_metal" };
  }
  const catalogEntry = PURITY_CATALOG.find(
    (candidate) => candidate.metal === metal && candidate.code === code
  );
  return catalogEntry === undefined
    ? { available: false, reason: "unknown_purity" }
    : { available: true, entry: catalogEntry };
}

function entry(
  code: string,
  metal: SupportedMetal,
  labelKey: PurityLabelKey,
  factorDecimal: string
): PurityCatalogEntry {
  return Object.freeze({
    code,
    metal,
    labelKey,
    factorDecimal,
    catalogVersion: PURITY_CATALOG_VERSION,
  });
}

function isSupportedMetal(metal: string): metal is SupportedMetal {
  return metal === "GOLD" || metal === "SILVER";
}
