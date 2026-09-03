import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("dead charts route cleanup", () => {
  it("does not ship or register the placeholder charts route", () => {
    const chartsRoute = resolve(__dirname, "../../app/(private)/charts.tsx");
    const privateLayout = read("../../app/(private)/_layout.tsx");

    expect(existsSync(chartsRoute)).toBe(false);
    expect(privateLayout).not.toContain('<Stack.Screen name="charts" />');
  });
});
