export interface EditableMetalHoldingFacts {
  readonly name: string;
  readonly notes: string | null;
  readonly metal: "GOLD" | "SILVER";
  readonly weightGramsDecimal: string;
  readonly purityCode: string;
  readonly purityCatalogVersion: "1";
  readonly purityFactorDecimal: string;
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
}

export type MetalHoldingStatus = "active" | "sold" | "disposed";
export type MetalHoldingAffectedField =
  | "weight"
  | "purity"
  | "purchasePrice"
  | "purchaseCurrency"
  | "purchaseDate"
  | "physicalForm";

export interface MetalHoldingEditComparison {
  readonly hasMetadataChanges: boolean;
  readonly hasMaterialChanges: boolean;
  readonly hasFinancialConsequences: boolean;
  readonly isMaterialEditAllowed: boolean;
  readonly requiresCorrectionReason: boolean;
  readonly affectedFields: readonly MetalHoldingAffectedField[];
}

const MATERIAL_FIELDS: ReadonlyArray<{
  readonly field: MetalHoldingAffectedField;
  readonly read: (facts: EditableMetalHoldingFacts) => string | null;
  readonly isFinancial: boolean;
}> = [
  {
    field: "weight",
    read: (facts) => facts.weightGramsDecimal,
    isFinancial: true,
  },
  {
    field: "purity",
    read: (facts) =>
      `${facts.purityCode}:${facts.purityCatalogVersion}:${facts.purityFactorDecimal}`,
    isFinancial: true,
  },
  {
    field: "purchasePrice",
    read: (facts) => facts.purchasePriceDecimal,
    isFinancial: true,
  },
  {
    field: "purchaseCurrency",
    read: (facts) => facts.purchaseCurrency,
    isFinancial: true,
  },
  {
    field: "purchaseDate",
    read: (facts) => facts.purchaseDate,
    isFinancial: true,
  },
  {
    field: "physicalForm",
    read: (facts) => facts.physicalForm,
    isFinancial: false,
  },
];

export function compareMetalHoldingEdit(input: {
  readonly original: EditableMetalHoldingFacts;
  readonly current: EditableMetalHoldingFacts;
  readonly holdingStatus: MetalHoldingStatus;
}): MetalHoldingEditComparison {
  const affected = MATERIAL_FIELDS.filter(
    ({ read }) => read(input.original) !== read(input.current)
  );
  const hasMaterialChanges = affected.length > 0;
  return {
    hasMetadataChanges:
      input.original.name !== input.current.name ||
      input.original.notes !== input.current.notes,
    hasMaterialChanges,
    hasFinancialConsequences: affected.some(({ isFinancial }) => isFinancial),
    isMaterialEditAllowed: input.holdingStatus === "active",
    requiresCorrectionReason: hasMaterialChanges,
    affectedFields: Object.freeze(affected.map(({ field }) => field)),
  };
}
