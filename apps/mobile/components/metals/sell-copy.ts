export interface SellMetalHoldingCopy {
  readonly title: string;
  readonly back: string;
  readonly wholeHolding: string;
  readonly saleDate: string;
  readonly saleCurrency: string;
  readonly gross: string;
  readonly fee: string;
  readonly notes: string;
  readonly net: string;
  readonly profit: string;
  readonly loss: string;
  readonly even: string;
  readonly unavailable: string;
  readonly consequences: string;
  readonly sold: string;
  readonly leavesActive: string;
  readonly history: string;
  readonly record: string;
  readonly recording: string;
  readonly cancel: string;
  readonly retry: string;
  readonly failed: string;
  readonly conflict: string;
  readonly loadError: string;
  readonly invalidDate: string;
  readonly beforePurchase: string;
  readonly invalidAmount: string;
  readonly invalidFee: string;
  readonly feeExceedsGross: string;
  readonly notesTooLong: string;
  readonly success: string;
  readonly exitTitle: string;
  readonly exitBody: string;
  readonly keepEditing: string;
  readonly discard: string;
}

export function createSellMetalHoldingCopy(
  translate: (key: string) => string
): SellMetalHoldingCopy {
  return Object.freeze({
    title: translate("sell.title"),
    back: translate("sell.back"),
    wholeHolding: translate("sell.wholeHolding"),
    saleDate: translate("sell.saleDate"),
    saleCurrency: translate("sell.saleCurrency"),
    gross: translate("sell.gross"),
    fee: translate("sell.fee"),
    notes: translate("sell.notes"),
    net: translate("sell.net"),
    profit: translate("sell.profit"),
    loss: translate("sell.loss"),
    even: translate("sell.even"),
    unavailable: translate("sell.unavailable"),
    consequences: translate("sell.consequences"),
    sold: translate("sell.sold"),
    leavesActive: translate("sell.leavesActive"),
    history: translate("sell.history"),
    record: translate("sell.record"),
    recording: translate("sell.recording"),
    cancel: translate("sell.cancel"),
    retry: translate("sell.retry"),
    failed: translate("sell.failed"),
    conflict: translate("sell.conflict"),
    loadError: translate("sell.loadError"),
    invalidDate: translate("sell.invalidDate"),
    beforePurchase: translate("sell.beforePurchase"),
    invalidAmount: translate("sell.invalidAmount"),
    invalidFee: translate("sell.invalidFee"),
    feeExceedsGross: translate("sell.feeExceedsGross"),
    notesTooLong: translate("sell.notesTooLong"),
    success: translate("sell.success"),
    exitTitle: translate("sell.exitTitle"),
    exitBody: translate("sell.exitBody"),
    keepEditing: translate("sell.keepEditing"),
    discard: translate("sell.discard"),
  });
}

export function mapSellMetalHoldingErrors(
  errors: Readonly<Record<string, string>>,
  copy: SellMetalHoldingCopy
): Readonly<Record<string, string>> {
  const messages: Readonly<Record<string, string>> = {
    invalid_date: copy.invalidDate,
    before_purchase: copy.beforePurchase,
    positive_amount_required: copy.invalidAmount,
    invalid_fee: copy.invalidFee,
    fee_exceeds_gross: copy.feeExceedsGross,
    notes_too_long: copy.notesTooLong,
    unsupported_currency: copy.invalidAmount,
    metal_sale_currency_mismatch: copy.invalidAmount,
  };
  return Object.fromEntries(
    Object.entries(errors).map(([field, code]) => [
      field,
      messages[code] ?? copy.failed,
    ])
  );
}
