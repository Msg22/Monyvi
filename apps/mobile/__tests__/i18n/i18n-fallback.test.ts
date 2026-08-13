const mockUse = jest.fn();
const mockInit = jest.fn<Promise<void>, [unknown]>();

jest.mock("i18next", () => ({
  __esModule: true,
  default: {
    language: "en",
  },
  use: (plugin: unknown): void => {
    mockUse(plugin);
  },
  init: (options: unknown): Promise<void> => mockInit(options),
}));

jest.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

jest.mock("expo-localization", () => ({
  getLocales: (): readonly [{ readonly languageCode: "en" }] => [
    { languageCode: "en" },
  ],
}));

jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: (): Promise<null> => Promise.resolve(null),
}));

import { initI18nFallback } from "@/i18n";

describe("i18n startup fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
  });

  it("initializes English resources when primary initialization fails early", async () => {
    await initI18nFallback();

    expect(mockUse).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledTimes(1);

    const options = mockInit.mock.calls[0]?.[0];
    expect(isRecord(options)).toBe(true);
    if (!isRecord(options)) throw new Error("Expected i18n init options");
    expect(options.lng).toBe("en");
    expect(options.fallbackLng).toBe("en");
    expect(isRecord(options.resources)).toBe(true);
    if (!isRecord(options.resources)) {
      throw new Error("Expected i18n resources");
    }
    expect(isRecord(options.resources.en)).toBe(true);
    if (!isRecord(options.resources.en)) {
      throw new Error("Expected English i18n resources");
    }
    expect(options.resources.en.onboarding).toBeDefined();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
