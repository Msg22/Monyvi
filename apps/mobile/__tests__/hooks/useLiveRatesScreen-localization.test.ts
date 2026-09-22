/**
 * Live Rates localization coverage.
 *
 * Proves the Live Rates read model surfaces names from the shared currency
 * catalogue and recomputes them on locale change, and that search matches by
 * ISO code, localized name, and canonical English name.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import i18next, { changeLanguage, use as registerPlugin } from "i18next";
import { initReactI18next } from "react-i18next";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { completeFixtureA } from "../fixtures/market-rate-snapshot";
import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";

jest.mock("@/hooks/useMarketRates", (): unknown => ({
  useMarketRates: (): unknown => ({
    selectedSnapshot: mockSelectedSnapshot,
    previousDayRate: null,
    isCurrentLoading: false,
    currentError: null,
    isConnected: true,
    lastUpdated: null,
    refreshSelectedSnapshot: mockRefreshSelectedSnapshot,
  }),
}));

const mockRefreshSelectedSnapshot = jest.fn();
const fixture = completeFixtureA();
const mockSelectedSnapshot = selectMarketRateSnapshot(
  fixture.roots,
  fixture.observations,
  Date.parse("2026-09-09T11:00:00Z")
);
jest.mock("@monyvi/db", (): unknown => ({ database: { get: jest.fn() } }));
jest.mock("@/providers/DatabaseProvider", (): unknown => ({
  useDatabase: (): unknown => ({}),
}));
jest.mock("@/services/live-rates-refresh-service", (): unknown => ({
  refreshLiveMarketRates: jest.fn(),
}));

jest.mock("@/hooks/usePreferredCurrency", (): unknown => ({
  usePreferredCurrency: (): { preferredCurrency: string } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@monyvi/logic", (): unknown => {
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
    await registerPlugin(initReactI18next).init({
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
  await changeLanguage(language);
}

function nameFor(
  currencies: ReadonlyArray<{ readonly code: string; readonly name: string }>,
  code: string
): string | undefined {
  return currencies.find((c): boolean => c.code === code)?.name;
}

describe("useLiveRatesScreen localization", (): void => {
  afterEach(async (): Promise<void> => {
    await act(async (): Promise<void> => {
      await changeLanguage("en");
    });
  });

  it("uses the shared localized catalogue and recomputes on locale change", async (): Promise<void> => {
    await prepareI18n("en");
    const { result } = renderHook(
      (): ReturnType<typeof useLiveRatesScreen> => useLiveRatesScreen()
    );

    await waitFor((): void => {
      expect(nameFor(result.current.currencies, "USD")).toBe("US Dollar");
    });

    await act(async (): Promise<void> => {
      await changeLanguage("ar");
    });

    await waitFor((): void => {
      expect(nameFor(result.current.currencies, "USD")).toBe(
        "الدولار الأمريكي"
      );
    });
  });

  it("finds a currency by localized name, English name, and ISO code", async (): Promise<void> => {
    await prepareI18n("ar");
    const { result } = renderHook(
      (): ReturnType<typeof useLiveRatesScreen> => useLiveRatesScreen()
    );

    await waitFor((): void => {
      expect(result.current.currencies.length).toBeGreaterThan(0);
    });

    act((): void => {
      result.current.onSearchChange("الريال السعودي");
    });
    await waitFor((): void => {
      expect(result.current.currencies.map((c): string => c.code)).toContain(
        "SAR"
      );
    });

    act((): void => {
      result.current.onSearchChange("Saudi Riyal");
    });
    await waitFor((): void => {
      expect(result.current.currencies.map((c): string => c.code)).toContain(
        "SAR"
      );
    });

    act((): void => {
      result.current.onSearchChange("sar");
    });
    await waitFor((): void => {
      expect(result.current.currencies.map((c): string => c.code)).toContain(
        "SAR"
      );
    });
  });
});
