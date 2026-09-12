import {
  getHoldingDetailTitleKey,
  getPhysicalFactIcon,
} from "@/components/metals/holding-detail-presentation";

describe("holding detail QA presentation", () => {
  it.each([
    ["active", "detail.title"],
    ["sold", "detail.sold_title"],
    ["disposed", "detail.disposed_title"],
  ] as const)("uses the correct %s route title", (status, expected) => {
    expect(getHoldingDetailTitleKey(status)).toBe(expected);
  });

  it("uses approved weight and gold-bar icons while retaining existing mappings", () => {
    expect(getPhysicalFactIcon("weight", null)).toEqual({
      library: "MaterialCommunityIcons",
      name: "weight-gram",
    });
    expect(getPhysicalFactIcon("form", "bar")).toEqual({
      library: "MaterialCommunityIcons",
      name: "gold",
    });
    expect(getPhysicalFactIcon("form", "coin")).toEqual({
      library: "Ionicons",
      name: "ellipse-outline",
    });
    expect(getPhysicalFactIcon("form", "jewelry")).toEqual({
      library: "Ionicons",
      name: "diamond-outline",
    });
    expect(getPhysicalFactIcon("purity", null)).toEqual({
      library: "Ionicons",
      name: "shield-checkmark-outline",
    });
  });
});
