import arAuth from "@/locales/ar/auth.json";
import arOnboarding from "@/locales/ar/onboarding.json";

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
});
