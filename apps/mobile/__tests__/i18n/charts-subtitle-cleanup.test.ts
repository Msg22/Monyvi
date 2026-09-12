import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("charts subtitle translation cleanup", () => {
  it("removes the charts-only key from both locale resources", () => {
    const enCommon = JSON.parse(read("../../locales/en/common.json")) as Record<
      string,
      unknown
    >;
    const arCommon = JSON.parse(read("../../locales/ar/common.json")) as Record<
      string,
      unknown
    >;

    expect(enCommon).not.toHaveProperty("charts_subtitle");
    expect(arCommon).not.toHaveProperty("charts_subtitle");
  });

  it("removes the charts-only key from the translation schema", () => {
    const schema = read("../../i18n/translation-schema.ts");

    expect(schema).not.toContain("readonly charts_subtitle: string;");
  });
});
