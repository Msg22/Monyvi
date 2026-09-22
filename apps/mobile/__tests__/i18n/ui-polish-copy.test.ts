import fs from "node:fs";
import path from "node:path";

import arUiPolish from "@/locales/ar/ui-polish.json";
import enUiPolish from "@/locales/en/ui-polish.json";

function flattenKeys(
  value: Record<string, unknown>,
  prefix = ""
): readonly string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const resourcePath = prefix ? `${prefix}.${key}` : key;
    return child !== null && typeof child === "object" && !Array.isArray(child)
      ? flattenKeys(child as Record<string, unknown>, resourcePath)
      : [resourcePath];
  });
}

describe("approved UI-polish localization", () => {
  it("keeps English and Arabic key parity", () => {
    expect([...flattenKeys(arUiPolish)].sort()).toEqual(
      [...flattenKeys(enUiPolish)].sort()
    );
  });

  it("stores the exact approved copy", () => {
    expect(enUiPolish.wealth_breakdown.show).toBe("See where your money is");
    expect(enUiPolish.wealth_breakdown.hide).toBe("Hide breakdown");
    expect(enUiPolish.metals_empty.title).toBe(
      "Start tracking your gold and silver"
    );
    expect(enUiPolish.metals_empty.body).toBe(
      "Add your first holding to follow its value over time."
    );
    expect(enUiPolish.metals_empty.cta).toBe("Add your first holding");

    expect(arUiPolish.wealth_breakdown.show).toBe(
      "شوف فلوسك موزّعة فين"
    );
    expect(arUiPolish.wealth_breakdown.hide).toBe("إخفاء التفاصيل");
    expect(arUiPolish.metals_empty.header).toBe("ذهبك وفضتك");
    expect(arUiPolish.metals_empty.title).toBe("ابدأ تتابع ذهبك وفضتك");
    expect(arUiPolish.metals_empty.body).toBe(
      "ضيف أول قطعة علشان تتابع قيمتها مع الوقت."
    );
    expect(arUiPolish.metals_empty.cta).toBe("ضيف أول قطعة");
  });

  it("loads UI-polish copy through the registered typed i18next namespace", () => {
    const hookSource = fs.readFileSync(
      path.resolve(__dirname, "../../hooks/useUiPolishCopy.ts"),
      "utf8"
    );
    const i18nSource = fs.readFileSync(
      path.resolve(__dirname, "../../i18n/index.ts"),
      "utf8"
    );
    const typeSource = fs.readFileSync(
      path.resolve(__dirname, "../../i18n/types.ts"),
      "utf8"
    );

    expect(hookSource).toContain('useTranslation("ui-polish")');
    expect(hookSource).not.toContain("@/locales/");
    expect(i18nSource).toContain(
      'import enUiPolish from "../locales/en/ui-polish.json";'
    );
    expect(i18nSource).toContain(
      'import arUiPolish from "../locales/ar/ui-polish.json";'
    );
    expect(i18nSource).toContain('"ui-polish": enUiPolish');
    expect(i18nSource).toContain('"ui-polish": arUiPolish');
    expect(typeSource).toContain(
      'readonly "ui-polish": UiPolishTranslations;'
    );
  });
});
