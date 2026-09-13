import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const en = JSON.parse(
  readFileSync(resolve(ROOT, "apps/mobile/locales/en/metals.json"), "utf8")
) as Record<string, unknown>;
const ar = JSON.parse(
  readFileSync(resolve(ROOT, "apps/mobile/locales/ar/metals.json"), "utf8")
) as Record<string, unknown>;

function flatten(
  value: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>(
    (result, [key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof child === "string"
        ? { ...result, [path]: child }
        : { ...result, ...flatten(child as Record<string, unknown>, path) };
    },
    {}
  );
}

function interpolation(value: string): string[] {
  return [...value.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)]
    .map((match) => match[1]!)
    .sort();
}

const CLDR_PLURAL_SUFFIXES = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
] as const;

function pluralBase(key: string): string | null {
  for (const suffix of CLDR_PLURAL_SUFFIXES) {
    const marker = `_${suffix}`;
    if (key.endsWith(marker)) {
      return key.slice(0, -marker.length);
    }
  }
  return null;
}

function isPluralFormKey(key: string, enKeys: Set<string>): boolean {
  const base = pluralBase(key);
  return (
    base !== null && (enKeys.has(`${base}_one`) || enKeys.has(`${base}_other`))
  );
}

describe("Metals EN/AR content contract", () => {
  const enFlat = flatten(en);
  const arFlat = flatten(ar);

  it("keeps exact key and interpolation parity", () => {
    const enKeys = new Set(Object.keys(enFlat));
    const arKeys = new Set(Object.keys(arFlat));

    for (const key of enKeys) {
      expect(arKeys.has(key)).toBe(true);
    }
    // Arabic may only add extra CLDR plural categories for keys English
    // already pluralizes; no other AR-only keys are allowed.
    for (const key of arKeys) {
      if (enKeys.has(key)) {
        continue;
      }
      expect(isPluralFormKey(key, enKeys)).toBe(true);
    }
    for (const key of enKeys) {
      // Plural forms pass `count` implicitly; English plural copy may omit it.
      const normalize = isPluralFormKey(key, enKeys)
        ? (names: string[]): string[] => names.filter((name) => name !== "count")
        : (names: string[]): string[] => names;
      expect(normalize(interpolation(arFlat[key]!))).toEqual(
        normalize(interpolation(enFlat[key]!))
      );
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
      "rate.invalid",
      "rate.refresh_failed_with_cache",
      "rate.retry_refresh",
      "reconciliation.incomplete",
      "reconciliation.automatic",
      "render.neutralFallback",
      "detail.follow_value",
      "detail.calculation_disclosure",
      "detail.paid",
      "detail.timeline_current_value",
      "detail.fact_accessibility",
    ]) {
      expect(enFlat[key]).toEqual(expect.any(String));
      expect(arFlat[key]).toEqual(expect.any(String));
    }
  });

  it("uses exact provider-observation time copy without a customer-facing age threshold", () => {
    expect(enFlat).toMatchObject({
      "portfolio.rates_updated":
        "Prices last updated {{date}} at {{time}}. They may have changed since then.",
      "rate.stale": "Last available price",
      "rate.unknown": "Rates: rate age is unknown",
      "rate.missing": "Rates: current rate unavailable",
      "rate.invalid": "Rates: this rate can’t be used",
      "rate.refresh_failed_with_cache":
        "Rates: couldn’t refresh. Showing the last available rate.",
      "rate.retry_refresh": "Retry refresh",
    });
    expect(arFlat).toMatchObject({
      "portfolio.rates_updated":
        "آخر تحديث للأسعار: {{date}}، {{time}}. قد تكون تغيّرت بعد ذلك.",
      "rate.stale": "آخر سعر متاح",
      "rate.unknown": "أسعار السوق: عمر السعر غير معروف",
      "rate.missing": "أسعار السوق: السعر الحالي غير متاح",
      "rate.invalid": "أسعار السوق: لا يمكن استخدام هذا السعر",
      "rate.refresh_failed_with_cache":
        "أسعار السوق: تعذر التحديث. نعرض آخر سعر متاح.",
      "rate.retry_refresh": "أعد محاولة التحديث",
    });
    expect(`${Object.values(enFlat).join(" ")} ${Object.values(arFlat).join(" ")}`).not.toMatch(
      /older than 24 hours|24h|24 ساعة/iu
    );
  });

  it("retains the legacy Platinum label while Live Rates V1 excludes the card", () => {
    expect(enFlat.platinum).toBe("Platinum");
    expect(arFlat.platinum).toBe("البلاتين");
  });

  it("uses language-neutral keys and omits retired or unsupported user copy", () => {
    const allKeys = Object.keys(enFlat).join(" ");
    const allCopy = `${Object.values(enFlat).join(" ")} ${Object.values(arFlat).join(" ")}`;
    expect(allKeys).not.toMatch(/[\u0600-\u06ff]/);
    expect(allCopy).not.toMatch(
      /Palladium|unrealized|realized\s+P\/?L|profit\s*\/\s*loss/i
    );
  });

  it("registers every Metals scalar key in the translation schema", () => {
    const schema = readFileSync(
      resolve(ROOT, "apps/mobile/i18n/translation-schemas.ts"),
      "utf8"
    );
    expect(schema).toContain("metalsTranslationSchema");
    for (const key of [
      "metal",
      "form",
      "status",
      "rate",
      "reconciliation",
      "render",
      "detail",
    ]) {
      expect(schema).toMatch(new RegExp(`${key}:\\s*z\\s*\\.object`));
    }
  });
});
