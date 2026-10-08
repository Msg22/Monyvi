export interface DisposeHoldingActionDescriptor {
  readonly id: "dispose";
  readonly labelKey: "actions.dispose";
  readonly tone: "secondary";
  readonly href: {
    readonly pathname: "/(private)/metals/[holdingId]/dispose";
    readonly params: { readonly holdingId: string };
  };
}

export function createDisposeHoldingActionDescriptor(
  holdingId: string
): DisposeHoldingActionDescriptor {
  const normalizedHoldingId = holdingId.trim();
  if (!normalizedHoldingId) throw new Error("metal_holding_id_required");
  return Object.freeze({
    id: "dispose",
    labelKey: "actions.dispose",
    tone: "secondary",
    href: Object.freeze({
      pathname: "/(private)/metals/[holdingId]/dispose",
      params: Object.freeze({ holdingId: normalizedHoldingId }),
    }),
  });
}
