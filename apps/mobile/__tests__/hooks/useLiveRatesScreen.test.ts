/**
 * Live Rates localization coverage.
 *
 * Proves the Live Rates read model surfaces names from the shared currency
 * catalogue and recomputes them on locale change, and that search matches by
 * ISO code, localized name, and canonical English name.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): {
    latestRates: Record<string, never>;
    previousDayRate: null;
    isLoading: boolean;
    isConnected: boolean;
    lastUpdated: null;
    isStale: boolean;
  } => ({
    latestRates: {},
    previousDayRate: null,
    isLoading: false,
    isConnected: true,
    lastUpdated: null,
    isStale: false,
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { preferredCurrency: string } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@monyvi/logic", () => {
  const actual =
    jest.requireActual<typeof import("@monyvi/logic")>("@monyvi/logic");
  return {
    ...actual,
    convertCurrency: (): number => 1,
    getMetalPrice: (): number => 0,
    getGoldPurityPrice: (): number => 0,
    calculateTrendPercent: (): number => 0,
    formatRate: (value: number): string => String(value),
  };
});

async function prepareI18n(language: "en" | "ar"): Promise<void> {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      resources: {
        en: { common: enCommon },
        ar: { common: arCommon },
      },
      lng: language,
      fallbackLng: "en",
      ns: "common",
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    return;
  }
  await i18next.changeLanguage(language);
}

function nameFor(
  currencies: readonly { readonly code: string; readonly name: string }[],
  code: string
): string | undefined {
  return currencies.find((c) => c.code === code)?.name;
}

describe("useLiveRatesScreen localization", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("uses the shared localized catalogue and recomputes on locale change", async () => {
    await prepareI18n("en");
    const { result } = renderHook(() => useLiveRatesScreen());

    await waitFor(() => {
      expect(nameFor(result.current.currencies, "USD")).toBe("US Dollar");
    });

    await act(async () => {
      await i18next.changeLanguage("ar");
    });

    await waitFor(() => {
      expect(nameFor(result.current.currencies, "USD")).toBe(
        "الدولار الأمريكي"
      );
    });
  });

  it("returns complete Arabic monetary strings for metal prices", async () => {
    await prepareI18n("ar");
    const { result } = renderHook(() => useLiveRatesScreen());

    await waitFor(() => {
      expect(result.current.metals.price24k).toBe("٠ جنيه مصري");
      expect(result.current.metals.silverPrice).toBe("٠ جنيه مصري");
      expect(result.current.metals.platinumPrice).toBe("٠ جنيه مصري");
      expect(result.current.metals).not.toHaveProperty("currencySymbol");
    });
  });

  it("preserves legacy English code-prefix placement for metal prices", async () => {
    await prepareI18n("en");
    const { result } = renderHook(() => useLiveRatesScreen());

    await waitFor(() => {
      expect(result.current.metals.price24k).toBe("EGP 0");
      expect(result.current.metals.silverPrice).toBe("EGP 0");
      expect(result.current.metals.platinumPrice).toBe("EGP 0");
    });
  });

  it("finds a currency by localized name, English name, and ISO code", async () => {
    await prepareI18n("ar");
    const { result } = renderHook(() => useLiveRatesScreen());

    await waitFor(() => {
      expect(result.current.currencies.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.onSearchChange("الريال السعودي");
    });
    await waitFor(() => {
      expect(result.current.currencies.map((c) => c.code)).toContain("SAR");
    });

    act(() => {
      result.current.onSearchChange("Saudi Riyal");
    });
    await waitFor(() => {
      expect(result.current.currencies.map((c) => c.code)).toContain("SAR");
    });

    act(() => {
      result.current.onSearchChange("sar");
    });
    await waitFor(() => {
      expect(result.current.currencies.map((c) => c.code)).toContain("SAR");
    });
  });
});
