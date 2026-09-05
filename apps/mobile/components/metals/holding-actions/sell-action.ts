export interface SellHoldingActionDescriptor {
  readonly id: "sell";
  readonly labelKey: "actions.sell";
  readonly tone: "primary";
  readonly href: {
    readonly pathname: "/(private)/metals/[holdingId]/sell";
    readonly params: { readonly holdingId: string };
  };
}

export function createSellHoldingActionDescriptor(
  holdingId: string
): SellHoldingActionDescriptor {
  const normalizedHoldingId = holdingId.trim();
  if (!normalizedHoldingId) throw new Error("metal_holding_id_required");
  return Object.freeze({
    id: "sell",
    labelKey: "actions.sell",
    tone: "primary",
    href: Object.freeze({
      pathname: "/(private)/metals/[holdingId]/sell",
      params: Object.freeze({ holdingId: normalizedHoldingId }),
    }),
  });
}
