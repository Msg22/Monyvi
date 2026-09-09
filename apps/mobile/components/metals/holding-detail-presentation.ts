export type HoldingDetailStatus = "active" | "sold" | "disposed";
export type HoldingDetailPhysicalForm = "bar" | "coin" | "jewelry" | null;
export type PhysicalFactKind = "weight" | "purity" | "form";

export interface PhysicalFactIcon {
  readonly library: "Ionicons" | "MaterialCommunityIcons";
  readonly name: string;
}

export function getHoldingDetailTitleKey(
  status: HoldingDetailStatus | null | undefined
): "detail.title" | "detail.sold_title" | "detail.disposed_title" {
  if (status === "sold") return "detail.sold_title";
  if (status === "disposed") return "detail.disposed_title";
  return "detail.title";
}

export function getPhysicalFactIcon(
  kind: PhysicalFactKind,
  form: HoldingDetailPhysicalForm
): PhysicalFactIcon {
  if (kind === "weight") {
    return { library: "MaterialCommunityIcons", name: "weight-gram" };
  }
  if (kind === "purity") {
    return { library: "Ionicons", name: "shield-checkmark-outline" };
  }
  if (form === "bar") {
    return { library: "MaterialCommunityIcons", name: "gold" };
  }
  if (form === "jewelry") {
    return { library: "Ionicons", name: "diamond-outline" };
  }
  return { library: "Ionicons", name: "ellipse-outline" };
}
