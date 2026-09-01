import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

export type HoldingActionId = "sell" | "edit" | "dispose" | "delete" | "undo";

export interface HoldingActionDescriptor {
  readonly id: HoldingActionId;
  readonly labelKey:
    | "actions.sell"
    | "actions.edit"
    | "actions.dispose"
    | "actions.delete"
    | "actions.undo_sale"
    | "actions.undo_disposal";
  readonly tone: "primary" | "secondary" | "danger";
}

export function getHoldingActionDescriptors(
  model: MetalDetailReadModel
): readonly HoldingActionDescriptor[] {
  if (!model.isActiveOwnership) {
    return Object.freeze([
      {
        id: "undo",
        labelKey:
          model.status === "sold"
            ? "actions.undo_sale"
            : "actions.undo_disposal",
        tone: "primary",
      },
      { id: "edit", labelKey: "actions.edit", tone: "secondary" },
    ]);
  }
  if (model.isFinancialActionLocked) {
    return Object.freeze([
      { id: "edit", labelKey: "actions.edit", tone: "secondary" },
    ]);
  }
  return Object.freeze([
    { id: "sell", labelKey: "actions.sell", tone: "primary" },
    { id: "edit", labelKey: "actions.edit", tone: "secondary" },
    { id: "dispose", labelKey: "actions.dispose", tone: "secondary" },
    { id: "delete", labelKey: "actions.delete", tone: "danger" },
  ]);
}
