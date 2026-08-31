import {
  compareDecimal,
  fromMinorUnits,
  parseCanonicalDecimal,
  roundDecimal,
  serializeDecimal,
  toMinorUnits,
  type ExactDecimalValue,
} from "./decimal";
import {
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type CurrencyRateRole,
  type ExactRateReference,
  type MetalInstrumentCode,
  type MetalRateRole,
  type RateReferenceExpectation,
  type RateInstrumentCode,
} from "./rate-reference";
import type { Availability } from "./valuation";

export interface UnrealizedAttributionInput {
  readonly metalInstrumentCode: MetalInstrumentCode;
  readonly purchaseCurrencyInstrumentCode: CurrencyInstrumentCode;
  readonly pureGramsDecimal: string;
  readonly purchaseCostDecimal: string | null;
  readonly purchaseCurrencyDecimalPlaces: number;
  readonly acquisitionMetalRate: ExactRateReference | null;
  readonly acquisitionCurrencyRate: ExactRateReference | null;
  readonly valuationMetalRate: ExactRateReference | null;
  readonly valuationCurrencyRate: ExactRateReference | null;
}

export interface RealizedAttributionInput {
  readonly metalInstrumentCode: MetalInstrumentCode;
  readonly purchaseCurrencyInstrumentCode: CurrencyInstrumentCode;
  readonly proceedsCurrencyInstrumentCode: CurrencyInstrumentCode;
  readonly pureGramsDecimal: string;
  readonly purchaseCostDecimal: string | null;
  readonly purchaseCurrencyDecimalPlaces: number;
  readonly grossProceedsDecimal: string;
  readonly feesDecimal: string;
  readonly proceedsCurrencyDecimalPlaces: number;
  readonly acquisitionMetalRate: ExactRateReference | null;
  readonly acquisitionCurrencyRate: ExactRateReference | null;
  readonly saleMetalRate: ExactRateReference | null;
  readonly purchaseCurrencyAtSaleRate: ExactRateReference | null;
  readonly proceedsCurrencyAtSaleRate: ExactRateReference | null;
}

export interface UnrealizedAttribution {
  readonly combinedDecimal: string;
  readonly consumedRateReferences: readonly ExactRateReference[];
  readonly breakdown: Availability<{
    readonly components: {
      readonly metalMovementDecimal: string;
      readonly currencyMovementDecimal: string;
      readonly purchaseCostDecimal: string;
    };
    readonly rateReferences: readonly ExactRateReference[];
  }> | { readonly available: false; readonly reasons: readonly string[] };
}

export interface RealizedAttribution {
  readonly combinedDecimal: string;
  readonly consumedRateReferences: readonly ExactRateReference[];
  readonly canonicalGrossProceedsDecimal: string;
  readonly canonicalFeesDecimal: string;
  readonly netProceedsDecimal: string;
  readonly breakdown: Availability<{
    readonly components: {
      readonly metalMovementDecimal: string;
      readonly currencyMovementDecimal: string;
      readonly purchaseCostDecimal: string;
      readonly saleDifferenceDecimal: string;
      readonly feeDecimal: string;
    };
    readonly rateReferences: readonly ExactRateReference[];
  }> | { readonly available: false; readonly reasons: readonly string[] };
}

export interface RoundedAttribution {
  readonly combinedDecimal: string;
  readonly displayedComponents: Readonly<Record<string, string>>;
  readonly displayedComponentSumDecimal: string;
  readonly roundingDifferenceMinorUnits: string;
  readonly requiresRoundingExplanation: boolean;
}

export interface DisplayAttributionSource {
  readonly combinedDecimal: string;
  readonly components: Readonly<Record<string, string>>;
}

export interface DisplayAttributionInput {
  readonly canonicalCurrencyInstrumentCode: CurrencyInstrumentCode;
  readonly preferredCurrencyInstrumentCode: CurrencyInstrumentCode;
  readonly attribution: Availability<DisplayAttributionSource>;
  readonly canonicalCurrencyAtDisplayRate: ExactRateReference | null;
  readonly preferredCurrencyAtDisplayRate: ExactRateReference | null;
  readonly decimalPlaces: number;
}

interface RequiredRate {
  readonly decimal: ExactDecimalValue;
  readonly reference: ExactRateReference;
}

export function calculateUnrealizedAttribution(
  input: UnrealizedAttributionInput
): Availability<UnrealizedAttribution> {
  const pureGrams = readPositiveDecimal(
    input.pureGramsDecimal,
    "pure_grams_unavailable"
  );
  if (!pureGrams.available) {
    return pureGrams;
  }
  const purchaseCost = readPositiveDecimal(
    input.purchaseCostDecimal,
    "purchase_cost_unavailable"
  );
  if (!purchaseCost.available) {
    return purchaseCost;
  }
  if (
    !isMinorUnitCompatible(
      input.purchaseCostDecimal as string,
      input.purchaseCurrencyDecimalPlaces
    )
  ) {
    return { available: false, reason: "purchase_cost_unavailable" };
  }
  const valuationMetal = readRate(
    input.valuationMetalRate,
    "valuation_metal_rate_unavailable",
    "current_metal",
    input.metalInstrumentCode
  );
  if (!valuationMetal.available) {
    return valuationMetal;
  }
  const valuationCurrency = readRate(
    input.valuationCurrencyRate,
    "valuation_currency_rate_unavailable",
    "current_purchase_currency",
    input.purchaseCurrencyInstrumentCode
  );
  if (!valuationCurrency.available) {
    return valuationCurrency;
  }

  const combined = pureGrams.value
    .times(valuationMetal.value.decimal)
    .dividedBy(valuationCurrency.value.decimal)
    .minus(purchaseCost.value);
  const acquisitionMetal = readRate(
    input.acquisitionMetalRate,
    "acquisition_metal_rate_unavailable",
    "acquisition_metal",
    input.metalInstrumentCode
  );
  const acquisitionCurrency = readRate(
    input.acquisitionCurrencyRate,
    "acquisition_currency_rate_unavailable",
    "acquisition_purchase_currency",
    input.purchaseCurrencyInstrumentCode
  );
  const breakdownReasons = unavailableReasons([
    acquisitionMetal,
    acquisitionCurrency,
  ]);
  const consumedRateReferences = snapshotAvailableRateReferences([
    acquisitionMetal,
    acquisitionCurrency,
    valuationMetal,
    valuationCurrency,
  ]);
  if (breakdownReasons.length > 0) {
    return {
      available: true,
      value: {
        combinedDecimal: serializeDecimal(combined),
        consumedRateReferences,
        breakdown: { available: false, reasons: breakdownReasons },
      },
    };
  }
  if (!acquisitionMetal.available || !acquisitionCurrency.available) {
    throw new Error("Breakdown availability invariant violated");
  }

  const components = calculateCoreComponents({
    pureGrams: pureGrams.value,
    purchaseCost: purchaseCost.value,
    acquisitionMetal: acquisitionMetal.value.decimal,
    acquisitionCurrency: acquisitionCurrency.value.decimal,
    valuationMetal: valuationMetal.value.decimal,
    valuationCurrency: valuationCurrency.value.decimal,
  });
  const serializedComponents = {
    metalMovementDecimal: serializeDecimal(components.metalMovement),
    currencyMovementDecimal: serializeDecimal(components.currencyMovement),
    purchaseCostDecimal: serializeDecimal(components.purchaseCost),
  };

  return {
    available: true,
    value: {
      combinedDecimal: sumDecimalStrings(Object.values(serializedComponents)),
      consumedRateReferences,
      breakdown: {
        available: true,
        value: {
          components: serializedComponents,
          rateReferences: consumedRateReferences,
        },
      },
    },
  };
}

export function calculateRealizedAttribution(
  input: RealizedAttributionInput
): Availability<RealizedAttribution> {
  const purchaseCost = readPositiveDecimal(
    input.purchaseCostDecimal,
    "purchase_cost_unavailable"
  );
  if (!purchaseCost.available) {
    return purchaseCost;
  }
  if (
    !isMinorUnitCompatible(
      input.purchaseCostDecimal as string,
      input.purchaseCurrencyDecimalPlaces
    )
  ) {
    return { available: false, reason: "purchase_cost_unavailable" };
  }
  const purchaseCurrencyAtSale = readRate(
    input.purchaseCurrencyAtSaleRate,
    "purchase_currency_at_sale_rate_unavailable",
    "terminal_purchase_currency",
    input.purchaseCurrencyInstrumentCode
  );
  if (!purchaseCurrencyAtSale.available) {
    return purchaseCurrencyAtSale;
  }
  const proceedsCurrencyAtSale = readRate(
    input.proceedsCurrencyAtSaleRate,
    "proceeds_currency_at_sale_rate_unavailable",
    "terminal_proceeds_currency",
    input.proceedsCurrencyInstrumentCode
  );
  if (!proceedsCurrencyAtSale.available) {
    return proceedsCurrencyAtSale;
  }
  const grossProceeds = readPositiveDecimal(
    input.grossProceedsDecimal,
    "gross_proceeds_unavailable"
  );
  if (
    !grossProceeds.available ||
    !isMinorUnitCompatible(
      input.grossProceedsDecimal,
      input.proceedsCurrencyDecimalPlaces
    )
  ) {
    return { available: false, reason: "gross_proceeds_unavailable" };
  }
  const fees = readNonNegativeDecimal(input.feesDecimal, "fees_unavailable");
  if (
    !fees.available ||
    !isMinorUnitCompatible(input.feesDecimal, input.proceedsCurrencyDecimalPlaces) ||
    fees.value.greaterThan(grossProceeds.value)
  ) {
    return { available: false, reason: "fees_unavailable" };
  }

  const saleConversion = proceedsCurrencyAtSale.value.decimal.dividedBy(
    purchaseCurrencyAtSale.value.decimal
  );
  const canonicalGrossProceeds = grossProceeds.value.times(saleConversion);
  const canonicalFees = fees.value.times(saleConversion);
  const combined = canonicalGrossProceeds
    .minus(canonicalFees)
    .minus(purchaseCost.value);
  const baseResult = {
    combinedDecimal: serializeDecimal(combined),
    consumedRateReferences: snapshotAvailableRateReferences([
      purchaseCurrencyAtSale,
      proceedsCurrencyAtSale,
    ]),
    canonicalGrossProceedsDecimal: serializeDecimal(canonicalGrossProceeds),
    canonicalFeesDecimal: serializeDecimal(canonicalFees),
    netProceedsDecimal: serializeDecimal(grossProceeds.value.minus(fees.value)),
  };

  const pureGrams = readPositiveDecimal(
    input.pureGramsDecimal,
    "pure_grams_unavailable"
  );
  const acquisitionMetal = readRate(
    input.acquisitionMetalRate,
    "acquisition_metal_rate_unavailable",
    "acquisition_metal",
    input.metalInstrumentCode
  );
  const acquisitionCurrency = readRate(
    input.acquisitionCurrencyRate,
    "acquisition_currency_rate_unavailable",
    "acquisition_purchase_currency",
    input.purchaseCurrencyInstrumentCode
  );
  const saleMetal = readRate(
    input.saleMetalRate,
    "sale_metal_rate_unavailable",
    "terminal_metal",
    input.metalInstrumentCode
  );
  const breakdownReasons = unavailableReasons([
    pureGrams,
    acquisitionMetal,
    acquisitionCurrency,
    saleMetal,
  ]);
  const consumedRateReferences = snapshotAvailableRateReferences([
    acquisitionMetal,
    acquisitionCurrency,
    saleMetal,
    purchaseCurrencyAtSale,
    proceedsCurrencyAtSale,
  ]);
  if (breakdownReasons.length > 0) {
    return {
      available: true,
      value: {
        ...baseResult,
        consumedRateReferences,
        breakdown: { available: false, reasons: breakdownReasons },
      },
    };
  }
  if (
    !pureGrams.available ||
    !acquisitionMetal.available ||
    !acquisitionCurrency.available ||
    !saleMetal.available
  ) {
    throw new Error("Breakdown availability invariant violated");
  }

  const components = calculateCoreComponents({
    pureGrams: pureGrams.value,
    purchaseCost: purchaseCost.value,
    acquisitionMetal: acquisitionMetal.value.decimal,
    acquisitionCurrency: acquisitionCurrency.value.decimal,
    valuationMetal: saleMetal.value.decimal,
    valuationCurrency: purchaseCurrencyAtSale.value.decimal,
  });
  const terminalReference = pureGrams.value
    .times(saleMetal.value.decimal)
    .dividedBy(purchaseCurrencyAtSale.value.decimal);
  const saleDifference = canonicalGrossProceeds.minus(terminalReference);
  const feeComponent = canonicalFees.negated();
  const serializedComponents = {
    metalMovementDecimal: serializeDecimal(components.metalMovement),
    currencyMovementDecimal: serializeDecimal(components.currencyMovement),
    purchaseCostDecimal: serializeDecimal(components.purchaseCost),
    saleDifferenceDecimal: serializeDecimal(saleDifference),
    feeDecimal: serializeDecimal(feeComponent),
  };

  return {
    available: true,
    value: {
      ...baseResult,
      combinedDecimal: sumDecimalStrings(Object.values(serializedComponents)),
      consumedRateReferences,
      breakdown: {
        available: true,
        value: {
          components: serializedComponents,
          rateReferences: consumedRateReferences,
        },
      },
    },
  };
}

export function roundAttributionForDisplay(input: {
  readonly combinedDecimal: string;
  readonly components: Readonly<Record<string, string>>;
  readonly decimalPlaces: number;
}): Availability<RoundedAttribution> {
  if (!hasExactComponentSum(input)) {
    return { available: false, reason: "attribution_components_mismatch" };
  }

  return roundReconciledAttributionForDisplay(input);
}

function roundReconciledAttributionForDisplay(input: {
  readonly combinedDecimal: string;
  readonly components: Readonly<Record<string, string>>;
  readonly decimalPlaces: number;
}): Availability<RoundedAttribution> {
  const combinedDecimal = roundDecimal(
    input.combinedDecimal,
    input.decimalPlaces
  );
  const displayedComponents = Object.entries(input.components).reduce<
    Readonly<Record<string, string>>
  >(
    (current, [key, value]) => ({
      ...current,
      [key]: roundDecimal(value, input.decimalPlaces),
    }),
    {}
  );
  const displayedComponentSum = Object.values(displayedComponents).reduce(
    (sum, value) => sum.plus(value),
    parseCanonicalDecimal("0")
  );
  const displayedComponentSumDecimal = roundDecimal(
    displayedComponentSum,
    input.decimalPlaces
  );
  const difference = parseCanonicalDecimal(combinedDecimal)
    .minus(displayedComponentSumDecimal)
    .absoluteValue();
  const roundingDifferenceMinorUnits = toMinorUnits(
    difference,
    input.decimalPlaces
  );
  if (compareDecimal(roundingDifferenceMinorUnits, "2") > 0) {
    return { available: false, reason: "attribution_components_mismatch" };
  }

  return {
    available: true,
    value: {
      combinedDecimal,
      displayedComponents,
      displayedComponentSumDecimal,
      roundingDifferenceMinorUnits,
      requiresRoundingExplanation: !difference.isZero(),
    },
  };
}

function hasExactComponentSum(input: DisplayAttributionSource): boolean {
  try {
    return compareDecimal(
      input.combinedDecimal,
      sumDecimalStrings(Object.values(input.components))
    ) === 0;
  } catch {
    return false;
  }
}

function sumDecimalStrings(values: readonly string[]): string {
  return serializeDecimal(
    values.reduce(
      (sum, value) => sum.plus(value),
      parseCanonicalDecimal("0")
    )
  );
}

export function convertAttributionForDisplay(
  input: DisplayAttributionInput
): Availability<RoundedAttribution> {
  if (!input.attribution.available) {
    return input.attribution;
  }
  const canonicalCurrency = readRate(
    input.canonicalCurrencyAtDisplayRate,
    "canonical_currency_display_rate_unavailable",
    "display_purchase_currency",
    input.canonicalCurrencyInstrumentCode
  );
  if (!canonicalCurrency.available) {
    return canonicalCurrency;
  }
  const preferredCurrency = readRate(
    input.preferredCurrencyAtDisplayRate,
    "preferred_currency_display_rate_unavailable",
    "display_preferred_currency",
    input.preferredCurrencyInstrumentCode
  );
  if (!preferredCurrency.available) {
    return preferredCurrency;
  }
  if (!hasExactComponentSum(input.attribution.value)) {
    return { available: false, reason: "attribution_components_mismatch" };
  }

  const displayFactor = canonicalCurrency.value.decimal.dividedBy(
    preferredCurrency.value.decimal
  );
  const convertedComponents = Object.entries(
    input.attribution.value.components
  ).reduce<Readonly<Record<string, string>>>(
    (current, [key, value]) => ({
      ...current,
      [key]: serializeDecimal(parseCanonicalDecimal(value).times(displayFactor)),
    }),
    {}
  );
  return roundReconciledAttributionForDisplay({
    combinedDecimal: serializeDecimal(
      parseCanonicalDecimal(input.attribution.value.combinedDecimal).times(
        displayFactor
      )
    ),
    components: convertedComponents,
    decimalPlaces: input.decimalPlaces,
  });
}

function calculateCoreComponents(input: {
  readonly pureGrams: ExactDecimalValue;
  readonly purchaseCost: ExactDecimalValue;
  readonly acquisitionMetal: ExactDecimalValue;
  readonly acquisitionCurrency: ExactDecimalValue;
  readonly valuationMetal: ExactDecimalValue;
  readonly valuationCurrency: ExactDecimalValue;
}): {
  readonly metalMovement: ExactDecimalValue;
  readonly currencyMovement: ExactDecimalValue;
  readonly purchaseCost: ExactDecimalValue;
} {
  const acquisitionReference = input.pureGrams
    .times(input.acquisitionMetal)
    .dividedBy(input.acquisitionCurrency);
  return {
    metalMovement: input.pureGrams
      .times(input.valuationMetal.minus(input.acquisitionMetal))
      .dividedBy(input.acquisitionCurrency),
    currencyMovement: input.pureGrams.times(input.valuationMetal).times(
      parseCanonicalDecimal("1")
        .dividedBy(input.valuationCurrency)
        .minus(parseCanonicalDecimal("1").dividedBy(input.acquisitionCurrency))
    ),
    purchaseCost: acquisitionReference.minus(input.purchaseCost),
  };
}

function readRate(
  reference: ExactRateReference | null,
  unavailableReason: string,
  expectedRole: MetalRateRole | CurrencyRateRole,
  expectedInstrumentCode: RateInstrumentCode
): Availability<RequiredRate> {
  if (reference === null) {
    return { available: false, reason: unavailableReason };
  }
  const expectation = createRateExpectation(
    expectedRole,
    expectedInstrumentCode
  );
  if (expectation === null) {
    return { available: false, reason: unavailableReason };
  }
  const normalized = validateAndNormalizeRateReference(reference, expectation);
  if (!normalized.available) {
    return { available: false, reason: unavailableReason };
  }
  const {
    normalizedUsdPerBaseDecimal,
    ...validatedReference
  } = normalized.value;

  return {
    available: true,
    value: {
      decimal: parseCanonicalDecimal(
        normalizedUsdPerBaseDecimal
      ),
      reference: Object.freeze(validatedReference),
    },
  };
}

function createRateExpectation(
  role: MetalRateRole | CurrencyRateRole,
  instrumentCode: RateInstrumentCode
): RateReferenceExpectation | null {
  if (isMetalRateRole(role) && isMetalInstrumentCode(instrumentCode)) {
    return { role, instrumentCode };
  }
  if (!isMetalRateRole(role) && !isMetalInstrumentCode(instrumentCode)) {
    return { role, instrumentCode };
  }
  return null;
}

function isMetalRateRole(
  role: MetalRateRole | CurrencyRateRole
): role is MetalRateRole {
  return role === "acquisition_metal" ||
    role === "current_metal" ||
    role === "terminal_metal";
}

function isMetalInstrumentCode(
  instrumentCode: RateInstrumentCode
): instrumentCode is MetalInstrumentCode {
  return instrumentCode === "metal:GOLD" || instrumentCode === "metal:SILVER";
}

function readPositiveDecimal(
  value: string | null,
  unavailableReason: string
): Availability<ExactDecimalValue> {
  if (value === null) {
    return { available: false, reason: unavailableReason };
  }
  try {
    const decimal = parseCanonicalDecimal(value);
    return decimal.greaterThan("0")
      ? { available: true, value: decimal }
      : { available: false, reason: unavailableReason };
  } catch {
    return { available: false, reason: unavailableReason };
  }
}

function readNonNegativeDecimal(
  value: string,
  unavailableReason: string
): Availability<ExactDecimalValue> {
  try {
    const decimal = parseCanonicalDecimal(value);
    return decimal.greaterThanOrEqualTo("0")
      ? { available: true, value: decimal }
      : { available: false, reason: unavailableReason };
  } catch {
    return { available: false, reason: unavailableReason };
  }
}

function isMinorUnitCompatible(value: string, decimalPlaces: number): boolean {
  try {
    const minorUnits = toMinorUnits(value, decimalPlaces);
    return compareDecimal(value, fromMinorUnits(minorUnits, decimalPlaces)) === 0;
  } catch {
    return false;
  }
}

function unavailableReasons(
  values: readonly Availability<unknown>[]
): readonly string[] {
  return values.flatMap((value) =>
    value.available ? [] : [value.reason]
  );
}

function snapshotRateReferences(
  references: readonly ExactRateReference[]
): readonly ExactRateReference[] {
  const uniqueReferences = references.reduce<readonly ExactRateReference[]>(
    (current, reference) =>
      current.some((candidate) => sameRateReference(candidate, reference))
        ? current
        : [...current, Object.freeze({ ...reference })],
    []
  );
  return Object.freeze(uniqueReferences);
}

function snapshotAvailableRateReferences(
  rates: readonly Availability<RequiredRate>[]
): readonly ExactRateReference[] {
  return snapshotRateReferences(
    rates.flatMap((rate) => rate.available ? [rate.value.reference] : [])
  );
}

function sameRateReference(
  left: ExactRateReference,
  right: ExactRateReference
): boolean {
  return (
    left.role === right.role &&
    left.kind === right.kind &&
    left.instrumentCode === right.instrumentCode &&
    left.valueDecimal === right.valueDecimal &&
    left.unit === right.unit &&
    left.orientation === right.orientation &&
    left.providerObservedAt === right.providerObservedAt &&
    left.source === right.source &&
    left.quality === right.quality &&
    left.capturedAt === right.capturedAt &&
    left.capturedFreshness === right.capturedFreshness
  );
}
