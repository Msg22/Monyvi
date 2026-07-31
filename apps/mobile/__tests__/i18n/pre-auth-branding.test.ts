import arAuth from "@/locales/ar/auth.json";
import arOnboarding from "@/locales/ar/onboarding.json";
import enAuth from "@/locales/en/auth.json";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

describe("pre-auth Arabic branding", () => {
  it("uses Monyvi instead of the legacy Razky name", () => {
    const visibleCopy = collectStrings({ arAuth, arOnboarding });

    expect(visibleCopy.some((value) => value.includes("رزقي"))).toBe(false);
    expect(arAuth.welcome_title).toBe("أهلًا بك في مونيڤي");
  });

  it("preserves the approved bilingual auth copy", () => {
    expect(enAuth.create_account).toBe("Create account");
    expect(arAuth.welcome_support).toBe(
      "مصاريفك ومدخراتك وكل حركة بينهم، مرتّبين في مكان واحد."
    );
    expect(arAuth.private_by_design).toBe("خصوصيتك جزء من التصميم.");
  });
});
