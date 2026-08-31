import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const en = JSON.parse(readFileSync(resolve(ROOT, "apps/mobile/locales/en/metals.json"), "utf8")) as Record<string, unknown>;
const ar = JSON.parse(readFileSync(resolve(ROOT, "apps/mobile/locales/ar/metals.json"), "utf8")) as Record<string, unknown>;

function flatten(value: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((result, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string"
      ? { ...result, [path]: child }
      : { ...result, ...flatten(child as Record<string, unknown>, path) };
  }, {});
}

function interpolation(value: string): string[] {
  return [...value.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]!).sort();
}

describe("Metals EN/AR content contract", () => {
  const enFlat = flatten(en);
  const arFlat = flatten(ar);

  it("keeps exact key and interpolation parity", () => {
    expect(Object.keys(arFlat).sort()).toEqual(Object.keys(enFlat).sort());
    for (const key of Object.keys(enFlat)) {
      expect(interpolation(arFlat[key]!)).toEqual(interpolation(enFlat[key]!));
    }
  });

  it("ships approved lifecycle, freshness, provenance, and recovery copy", () => {
    for (const key of [
      "metal.gold",
      "metal.silver",
      "form.bar",
      "form.coin",
      "form.jewelry",
      "status.active",
      "status.sold",
      "status.disposed",
      "rate.fresh",
      "rate.stale",
      "rate.unknown",
      "rate.missing",
      "reconciliation.incomplete",
      "reconciliation.automatic",
      "render.neutralFallback",
    ]) {
      expect(enFlat[key]).toEqual(expect.any(String));
      expect(arFlat[key]).toEqual(expect.any(String));
    }
  });

  it("uses language-neutral keys and omits retired or unsupported user copy", () => {
    const allKeys = Object.keys(enFlat).join(" ");
    const allCopy = `${Object.values(enFlat).join(" ")} ${Object.values(arFlat).join(" ")}`;
    expect(allKeys).not.toMatch(/[\u0600-\u06ff]/);
    expect(allCopy).not.toMatch(/Platinum|Palladium|unrealized|realized\s+P\/?L|profit\s*\/\s*loss/i);
  });

  it("registers every Metals scalar key in the translation schema", () => {
    const schema = readFileSync(resolve(ROOT, "apps/mobile/i18n/translation-schemas.ts"), "utf8");
    expect(schema).toContain("metalsTranslationSchema");
    for (const key of ["metal", "form", "status", "rate", "reconciliation", "render"]) {
      expect(schema).toContain(`${key}: z.object`);
    }
  });
});
