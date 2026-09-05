import {
  calculateRealizedAttribution,
  compareDecimal,
  isSupportedMetalsIsoCurrencyCode,
  resolveMetalsCurrencyMinorUnits,
  toMinorUnits,
  type CurrencyInstrumentCode,
  type ExactRateReference,
} from "@monyvi/logic";

export interface SellMetalHoldingPreviewInput {
  readonly metalType: "GOLD" | "SILVER";
  readonly pureGramsDecimal: string;
  readonly purchaseCostDecimal: string;
  readonly purchaseCurrency: string;
  readonly saleCurrency: string;
  readonly grossProceedsDecimal: string;
  readonly feeDecimal: string;
  readonly purchaseDate: string;
  readonly saleDate: string;
  readonly cairoTodayDate: string;
  readonly acquisitionMetalRate: ExactRateReference | null;
  readonly acquisitionCurrencyRate: ExactRateReference | null;
  readonly saleMetalRate: ExactRateReference | null;
  readonly purchaseCurrencyAtSaleRate: ExactRateReference | null;
  readonly proceedsCurrencyAtSaleRate: ExactRateReference | null;
  readonly hasAcknowledgedRateRisk: boolean;
}

export interface SellMetalHoldingPreview {
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly grossProceedsMinorUnits: string | null;
  readonly feeMinorUnits: string | null;
  readonly netProceedsMinorUnits: string | null;
  readonly netProceedsDecimal: string | null;
  readonly realizedProfitLossDecimal: string | null;
  readonly requiresRateAcknowledgment: boolean;
  readonly affectedRateRoles: readonly string[];
  readonly canSubmit: boolean;
}

interface ExactAmounts {
  readonly grossMinorUnits: string;
  readonly feeMinorUnits: string;
}

function validateDate(
  saleDate: string,
  purchaseDate: string,
  cairoTodayDate: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return "invalid_date";
  if (saleDate > cairoTodayDate) return "future_date";
  if (saleDate < purchaseDate) return "before_purchase";
  return null;
}

function readExactAmounts(
  input: SellMetalHoldingPreviewInput,
  decimalPlaces: number,
  errors: Record<string, string>
): ExactAmounts | null {
  const feeDecimal = input.feeDecimal.trim() || "0";
  try {
    if (compareDecimal(input.grossProceedsDecimal, "0") <= 0) {
      errors.grossProceeds = "positive_amount_required";
    }
  } catch {
    errors.grossProceeds = "invalid_amount";
  }
  try {
    if (compareDecimal(feeDecimal, "0") < 0)
      errors.fee = "non_negative_fee_required";
    if (
      errors.grossProceeds === undefined &&
      compareDecimal(feeDecimal, input.grossProceedsDecimal) > 0
    ) {
      errors.fee = "fee_exceeds_gross";
    }
  } catch {
    errors.fee = "invalid_fee";
  }
  if (errors.grossProceeds !== undefined || errors.fee !== undefined)
    return null;
  try {
    return {
      grossMinorUnits: toMinorUnits(input.grossProceedsDecimal, decimalPlaces),
      feeMinorUnits: toMinorUnits(feeDecimal, decimalPlaces),
    };
  } catch {
    errors.grossProceeds = "unsupported_minor_units";
    return null;
  }
}

function riskyRateRoles(
  input: SellMetalHoldingPreviewInput
): readonly string[] {
  return [
    input.acquisitionMetalRate,
    input.acquisitionCurrencyRate,
    input.saleMetalRate,
    input.purchaseCurrencyAtSaleRate,
    input.proceedsCurrencyAtSaleRate,
  ]
    .filter(
      (rate): rate is ExactRateReference =>
        rate !== null && rate.capturedFreshness !== "fresh"
    )
    .map((rate) => rate.role);
}

function toCurrencyInstrumentCode(code: string): CurrencyInstrumentCode | null {
  if (!isSupportedMetalsIsoCurrencyCode(code)) return null;
  return `currency:${code}`;
}

export function buildSellMetalHoldingPreview(
  input: SellMetalHoldingPreviewInput
): SellMetalHoldingPreview {
  const errors: Record<string, string> = {};
  const saleDateError = validateDate(
    input.saleDate,
    input.purchaseDate,
    input.cairoTodayDate
  );
  if (saleDateError !== null) errors.saleDate = saleDateError;
  if (
    !isSupportedMetalsIsoCurrencyCode(input.purchaseCurrency) ||
    !isSupportedMetalsIsoCurrencyCode(input.saleCurrency)
  ) {
    errors.saleCurrency = "unsupported_currency";
  }
  const purchaseInstrument = toCurrencyInstrumentCode(input.purchaseCurrency);
  const proceedsInstrument = toCurrencyInstrumentCode(input.saleCurrency);
  const purchaseMinorUnits = purchaseInstrument
    ? resolveMetalsCurrencyMinorUnits(purchaseInstrument)
    : null;
  const proceedsMinorUnits = proceedsInstrument
    ? resolveMetalsCurrencyMinorUnits(proceedsInstrument)
    : null;
  const amounts =
    proceedsMinorUnits === null
      ? null
      : readExactAmounts(input, proceedsMinorUnits, errors);
  const affectedRateRoles = riskyRateRoles(input);
  const requiresRateAcknowledgment = affectedRateRoles.length > 0;
  if (requiresRateAcknowledgment && !input.hasAcknowledgedRateRisk) {
    errors.rateAcknowledgment = "rate_acknowledgment_required";
  }
  if (
    Object.keys(errors).length > 0 ||
    amounts === null ||
    purchaseInstrument === null ||
    proceedsInstrument === null ||
    purchaseMinorUnits === null ||
    proceedsMinorUnits === null
  ) {
    return {
      validationErrors: errors,
      grossProceedsMinorUnits: amounts?.grossMinorUnits ?? null,
      feeMinorUnits: amounts?.feeMinorUnits ?? null,
      netProceedsMinorUnits: null,
      netProceedsDecimal: null,
      realizedProfitLossDecimal: null,
      requiresRateAcknowledgment,
      affectedRateRoles,
      canSubmit: false,
    };
  }
  const attribution = calculateRealizedAttribution({
    metalInstrumentCode: `metal:${input.metalType}`,
    purchaseCurrencyInstrumentCode: purchaseInstrument,
    proceedsCurrencyInstrumentCode: proceedsInstrument,
    pureGramsDecimal: input.pureGramsDecimal,
    purchaseCostDecimal: input.purchaseCostDecimal,
    purchaseCurrencyDecimalPlaces: purchaseMinorUnits,
    grossProceedsDecimal: input.grossProceedsDecimal,
    feesDecimal: input.feeDecimal.trim() || "0",
    proceedsCurrencyDecimalPlaces: proceedsMinorUnits,
    acquisitionMetalRate: input.acquisitionMetalRate,
    acquisitionCurrencyRate: input.acquisitionCurrencyRate,
    saleMetalRate: input.saleMetalRate,
    purchaseCurrencyAtSaleRate: input.purchaseCurrencyAtSaleRate,
    proceedsCurrencyAtSaleRate: input.proceedsCurrencyAtSaleRate,
  });
  if (!attribution.available) {
    return {
      validationErrors: { rates: attribution.reason },
      grossProceedsMinorUnits: amounts.grossMinorUnits,
      feeMinorUnits: amounts.feeMinorUnits,
      netProceedsMinorUnits: null,
      netProceedsDecimal: null,
      realizedProfitLossDecimal: null,
      requiresRateAcknowledgment,
      affectedRateRoles,
      canSubmit: false,
    };
  }
  return {
    validationErrors: {},
    grossProceedsMinorUnits: amounts.grossMinorUnits,
    feeMinorUnits: amounts.feeMinorUnits,
    netProceedsMinorUnits: (
      BigInt(amounts.grossMinorUnits) - BigInt(amounts.feeMinorUnits)
    ).toString(),
    netProceedsDecimal: attribution.value.netProceedsDecimal,
    realizedProfitLossDecimal: attribution.value.combinedDecimal,
    requiresRateAcknowledgment,
    affectedRateRoles,
    canSubmit: true,
  };
}
