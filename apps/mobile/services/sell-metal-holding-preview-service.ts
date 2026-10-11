import {
  calculateRealizedAttribution,
  compareDecimal,
  fromMinorUnits,
  getFinancialActionUtf8ByteLength,
  hasCanonicalDecimalPrecision,
  isSupportedMetalsIsoCurrencyCode,
  MAX_ACTION_NOTES_UTF8_BYTES,
  resolveMetalsCurrencyMinorUnits,
  serializeDecimal,
  toMinorUnits,
  type ExactRateReference,
  type AttributionUnavailableReason,
} from "@monyvi/logic";

export interface SellMetalHoldingPreviewInput {
  readonly metalType: "GOLD" | "SILVER";
  readonly pureGramsDecimal: string | null;
  readonly purchaseCostDecimal: string | null;
  readonly purchaseCurrency: string;
  readonly saleCurrency: string;
  readonly grossProceedsDecimal: string;
  readonly feeDecimal: string;
  readonly purchaseDate: string;
  readonly saleDate: string;
  readonly latestAllowedCalendarDate: string;
  readonly acquisitionMetalRate: ExactRateReference | null;
  readonly acquisitionCurrencyRate: ExactRateReference | null;
  readonly saleMetalRate: ExactRateReference | null;
  readonly purchaseCurrencyAtSaleRate: ExactRateReference | null;
  readonly proceedsCurrencyAtSaleRate: ExactRateReference | null;
  readonly hasAcknowledgedRateRisk: boolean;
  readonly notes?: string;
}

export interface SellMetalHoldingPreview {
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly grossProceedsMinorUnits: string | null;
  readonly feeMinorUnits: string | null;
  readonly netProceedsMinorUnits: string | null;
  readonly netProceedsDecimal: string | null;
  readonly realizedProfitLossDecimal: string | null;
  readonly reportingUnavailableReason: AttributionUnavailableReason | null;
  readonly requiresRateAcknowledgment: boolean;
  readonly affectedRateRoles: readonly string[];
  readonly canSubmit: boolean;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function readAmount(
  value: string,
  places: number,
  isGross: boolean
): string | null {
  if (
    !hasCanonicalDecimalPrecision(value) ||
    (value.split(".")[1]?.length ?? 0) > places
  )
    return null;
  if (compareDecimal(value, "0") < (isGross ? 1 : 0)) return null;
  return toMinorUnits(serializeDecimal(value), places);
}

export function buildSellMetalHoldingPreview(
  input: SellMetalHoldingPreviewInput
): SellMetalHoldingPreview {
  const errors: Record<string, string> = {};
  if (
    !isCalendarDate(input.saleDate) ||
    !isCalendarDate(input.latestAllowedCalendarDate) ||
    input.saleDate > input.latestAllowedCalendarDate
  )
    errors.saleDate = "invalid_date";
  else if (
    !isCalendarDate(input.purchaseDate) ||
    input.saleDate < input.purchaseDate
  )
    errors.saleDate = "before_purchase";
  const saleCurrency = isSupportedMetalsIsoCurrencyCode(input.saleCurrency)
    ? input.saleCurrency
    : null;
  const purchaseCurrency = isSupportedMetalsIsoCurrencyCode(
    input.purchaseCurrency
  )
    ? input.purchaseCurrency
    : null;
  if (!saleCurrency || !purchaseCurrency)
    errors.saleCurrency = "unsupported_currency";
  else if (saleCurrency !== purchaseCurrency)
    errors.saleCurrency = "metal_sale_currency_mismatch";
  const places = saleCurrency
    ? resolveMetalsCurrencyMinorUnits(`currency:${saleCurrency}`)
    : null;
  const purchasePlaces = purchaseCurrency
    ? resolveMetalsCurrencyMinorUnits(`currency:${purchaseCurrency}`)
    : null;
  const gross =
    places === null
      ? null
      : readAmount(input.grossProceedsDecimal, places, true);
  const fee =
    places === null
      ? null
      : readAmount(
          input.feeDecimal === "" ? "0" : input.feeDecimal,
          places,
          false
        );
  if (gross === null) errors.grossProceedsDecimal = "positive_amount_required";
  if (fee === null) errors.feeDecimal = "invalid_fee";
  else if (gross !== null && BigInt(fee) > BigInt(gross))
    errors.feeDecimal = "fee_exceeds_gross";
  if (
    getFinancialActionUtf8ByteLength(input.notes ?? "") >
    MAX_ACTION_NOTES_UTF8_BYTES
  )
    errors.notes = "notes_too_long";
  const net =
    gross !== null && fee !== null && BigInt(fee) <= BigInt(gross)
      ? (BigInt(gross) - BigInt(fee)).toString()
      : null;
  const netDecimal =
    net !== null && places !== null ? fromMinorUnits(net, places) : null;
  let realized: string | null = null;
  let unavailable: AttributionUnavailableReason | null = null;
  if (
    gross !== null &&
    fee !== null &&
    net !== null &&
    places !== null &&
    purchasePlaces !== null &&
    purchaseCurrency !== null &&
    saleCurrency === purchaseCurrency
  ) {
    const result = calculateRealizedAttribution({
      metalInstrumentCode: `metal:${input.metalType}`,
      purchaseCurrencyInstrumentCode: `currency:${purchaseCurrency}`,
      proceedsCurrencyInstrumentCode: `currency:${saleCurrency}`,
      pureGramsDecimal: input.pureGramsDecimal,
      purchaseCostDecimal: input.purchaseCostDecimal,
      purchaseCurrencyDecimalPlaces: purchasePlaces,
      grossProceedsDecimal: fromMinorUnits(gross, places),
      feesDecimal: fromMinorUnits(fee, places),
      proceedsCurrencyDecimalPlaces: places,
      acquisitionMetalRate: input.acquisitionMetalRate,
      acquisitionCurrencyRate: input.acquisitionCurrencyRate,
      saleMetalRate: input.saleMetalRate,
      purchaseCurrencyAtSaleRate: input.purchaseCurrencyAtSaleRate,
      proceedsCurrencyAtSaleRate: input.proceedsCurrencyAtSaleRate,
    });
    if (result.available) {
      realized = result.value.combinedDecimal;
    } else unavailable = result.reason;
  }
  return Object.freeze({
    validationErrors: Object.freeze(errors),
    grossProceedsMinorUnits: gross,
    feeMinorUnits: fee,
    netProceedsMinorUnits: net,
    netProceedsDecimal: netDecimal,
    realizedProfitLossDecimal: realized,
    reportingUnavailableReason: unavailable,
    requiresRateAcknowledgment: false,
    affectedRateRoles: Object.freeze([]),
    canSubmit: Object.keys(errors).length === 0 && net !== null,
  });
}
