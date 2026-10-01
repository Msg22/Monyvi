export interface DeleteHoldingActionDescriptor {
  readonly id: "delete";
  readonly labelKey: "actions.delete";
  readonly tone: "danger";
  readonly href: {
    readonly pathname: "/(private)/metals/[holdingId]/delete";
    readonly params: { readonly holdingId: string };
  };
}

export function createDeleteHoldingActionDescriptor(
  holdingId: string
): DeleteHoldingActionDescriptor {
  const normalizedHoldingId = holdingId.trim();
  if (!normalizedHoldingId) throw new Error("metal_holding_id_required");
  return Object.freeze({
    id: "delete",
    labelKey: "actions.delete",
    tone: "danger",
    href: Object.freeze({
      pathname: "/(private)/metals/[holdingId]/delete",
      params: Object.freeze({ holdingId: normalizedHoldingId }),
    }),
  });
}
