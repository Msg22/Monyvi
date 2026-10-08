import { createDisposeHoldingActionDescriptor } from "@/components/metals/holding-actions/dispose-action";

describe("Dispose holding action descriptor", () => {
  it("builds a stable secondary dispose descriptor for the production route", (): void => {
    const descriptor = createDisposeHoldingActionDescriptor("holding-1");
    expect(descriptor).toEqual({
      id: "dispose",
      labelKey: "actions.dispose",
      tone: "secondary",
      href: {
        pathname: "/(private)/metals/[holdingId]/dispose",
        params: { holdingId: "holding-1" },
      },
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it("trims the holding id and never falls back to an empty id", (): void => {
    expect(
      createDisposeHoldingActionDescriptor("  holding-1  ").href.params
        .holdingId
    ).toBe("holding-1");
    expect(() => createDisposeHoldingActionDescriptor("")).toThrow(
      "metal_holding_id_required"
    );
    expect(() => createDisposeHoldingActionDescriptor("   ")).toThrow(
      "metal_holding_id_required"
    );
  });
});
