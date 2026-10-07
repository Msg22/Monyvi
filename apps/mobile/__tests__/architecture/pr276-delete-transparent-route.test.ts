import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("PR #337 Delete confirmation route composition", () => {
  it("uses one transparent native-stack route and no nested React Native Modal", () => {
    const layout = read("../../app/(private)/_layout.tsx");
    const sheet = read("../../components/metals/DeleteMetalHoldingSheet.tsx");

    const routeStart = layout.indexOf('name="metals/[holdingId]/delete"');
    expect(routeStart).toBeGreaterThanOrEqual(0);
    const routeSource = layout.slice(routeStart, routeStart + 420);
    expect(routeSource).toContain('presentation: "transparentModal"');
    expect(routeSource).toContain('backgroundColor: "transparent"');

    expect(sheet).not.toContain("Modal,");
    expect(sheet).not.toContain("<Modal");
    expect(sheet).toContain("BackHandler.addEventListener");
    expect(sheet).toContain("hardwareBackPress");
  });

  it("always renders the real same-holding Detail beneath the sheet", () => {
    const route = read("../../app/(private)/metals/[holdingId]/delete.tsx");

    expect(route).toContain("metal-holding-delete-direct-detail");
    expect(route).toContain("<MetalHoldingDetailScreen");
    expect(route).toContain("actions={[]}");
    expect(route).not.toContain("currentValueLabel");
    expect(route).not.toContain("performanceLabel");
    expect(route).not.toContain("getDeleteHoldingRateWarnings");
  });
});
