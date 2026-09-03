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

  it("removes the charts-only translation key from resources and schema", () => {
    const enCommon = read("../../locales/en/common.json");
    const arCommon = read("../../locales/ar/common.json");
    const translationSchema = read("../../i18n/translation-schema.ts");

    expect(enCommon).not.toContain('"charts_subtitle"');
    expect(arCommon).not.toContain('"charts_subtitle"');
    expect(translationSchema).not.toContain("readonly charts_subtitle: string;");
  });
});
