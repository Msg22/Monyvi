import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

const mockUseLiveRatesScreen = jest.fn();
const mockOnRefresh = jest.fn();
let mockLocale: "en" | "ar" = "en";

const MOCK_RATE_COPY: Readonly<
  Record<"en" | "ar", Readonly<Record<string, string>>>
> = {
  en: {
    "rate.fresh": "Live Rates: current rate. Rates updated {{dateTime}}",
    "rate.stale": "Rates: rate is older than 24 hours",
    "rate.unknown": "Rates: rate age is unknown",
    "rate.missing": "Rates: current rate unavailable",
    "rate.invalid": "Rates: this rate can’t be used",
    "rate.refresh_failed_with_cache":
      "Rates: couldn’t refresh. Showing the last available rate.",
    "rate.retry_refresh": "Retry refresh",
    "rate.short_stale": "Older than 24h",
    "rate.source": "Source: {{source}}",
    "rate.quality": "Quality: {{quality}}",
    live_rates: "Live Rates",
    rates: "Rates",
    live_badge: "Live",
  },
  ar: {
    "rate.fresh":
      "الأسعار المباشرة: سعر حديث. تم تحديث الأسعار في {{dateTime}}",
    "rate.stale": "أسعار السوق: مرّ أكثر من 24 ساعة على السعر",
    "rate.unknown": "أسعار السوق: عمر السعر غير معروف",
    "rate.missing": "أسعار السوق: السعر الحالي غير متاح",
    "rate.invalid": "أسعار السوق: لا يمكن استخدام هذا السعر",
    "rate.refresh_failed_with_cache":
      "أسعار السوق: تعذر التحديث. نعرض آخر سعر متاح.",
    "rate.retry_refresh": "أعد محاولة التحديث",
    "rate.short_stale": "أقدم من 24 ساعة",
    "rate.source": "المصدر: {{source}}",
    "rate.quality": "الجودة: {{quality}}",
    live_rates: "الأسعار المباشرة",
    rates: "أسعار السوق",
    live_badge: "مباشر",
  },
};

function mockTranslate(
  key: string,
  options?: Readonly<Record<string, string>>
): string {
  const template = MOCK_RATE_COPY[mockLocale][key] ?? key;
  return Object.entries(options ?? {}).reduce(
    (copy, [name, value]) => copy.replace(`{{${name}}}`, value),
    template
  );
}

jest.mock("@/hooks/useLiveRatesScreen", () => ({
  useLiveRatesScreen: (): unknown => mockUseLiveRatesScreen(),
}));

jest.mock("@expo/vector-icons", () => ({
  FontAwesome5: (): null => null,
  Ionicons: (): null => null,
  MaterialIcons: (): null => null,
}));

jest.mock("expo-router", () => ({
  useRouter: (): { readonly back: jest.Mock } => ({ back: jest.fn() }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly top: number; readonly bottom: number } => ({
    top: 0,
    bottom: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (
      key: string,
      options?: Readonly<Record<string, string>>
    ) => string;
  } => ({
    t: mockTranslate,
  }),
}));

import { LiveRatesScreen } from "@/components/live-rates/LiveRatesScreen";

function screenState(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    isLoading: false,
    isConnected: true,
    isLive: false,
    isStale: false,
    hasData: true,
    metals: {
      price24k: "3,100",
      price21k: "2,712",
      price18k: "2,325",
      goldTrendPercent: 1.2,
      silverPrice: "40",
      silverTrendPercent: -0.2,
      platinumPrice: "999",
      platinumTrendPercent: 0.5,
      currencySymbol: "E£",
    },
    currencies: [
      {
        code: "USD",
        name: "US Dollar",
        flag: "🇺🇸",
        rate: "50 E£",
        changePercent: 0,
        trust: {
          quality: "valid",
          source: "provider-cache",
          state: "stale",
        },
      },
    ],
    isExpanded: false,
    onToggleExpand: jest.fn(),
    showSeeAll: false,
    preferredCurrencyLabel: "EGP",
    searchQuery: "",
    onSearchChange: jest.fn(),
    lastUpdatedText: "Updated just now",
    isRefreshing: false,
    onRefresh: mockOnRefresh,
    rateTrust: {
      gold: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
      silver: { state: "stale", dateTime: null },
      currencies: { state: "unknown", dateTime: null },
    },
    refreshError: null,
    ...overrides,
  };
}

describe("LiveRatesScreen Metals V1 production presentation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLiveRatesScreen.mockReturnValue(screenState());
    mockLocale = "en";
  });

  it("keeps the production composition without exposing internal trust metadata", () => {
    render(<LiveRatesScreen />);

    expect(screen.getByText("gold_label")).toBeOnTheScreen();
    expect(screen.getByText("silver")).toBeOnTheScreen();
    expect(screen.queryByText("platinum")).toBeNull();
    expect(screen.getByTestId("live-rates-gold-card")).toBeOnTheScreen();
    expect(screen.getByTestId("live-rates-silver-card")).toBeOnTheScreen();
    expect(screen.getByTestId("live-rates-currency-section")).toBeOnTheScreen();
    expect(screen.queryByTestId("live-rates-silver-layout-spacer")).toBeNull();
    expect(screen.queryByTestId("live-rates-trust-gold")).toBeNull();
    expect(screen.queryByTestId("live-rates-trust-silver")).toBeNull();
    expect(screen.queryByTestId("live-rates-trust-currencies")).toBeNull();
    expect(screen.getByText("US Dollar")).toBeOnTheScreen();
    expect(screen.queryByText(/Source:/)).toBeNull();
    expect(screen.queryByText(/Quality:/)).toBeNull();
    expect(screen.queryByText(/Older than 24h/)).toBeNull();
  });

  it("retains cached values while honestly showing offline mode and keeps currency search focus reachable", () => {
    mockUseLiveRatesScreen.mockReturnValue(
      screenState({
        isConnected: false,
        rateTrust: {
          gold: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
          silver: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
          currencies: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
        },
      })
    );

    render(<LiveRatesScreen />);

    expect(screen.getByText("E£ 40/g")).toBeOnTheScreen();
    expect(screen.getByText("offline_mode")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Open currency search"));
    expect(screen.getByPlaceholderText("search_currencies")).toBeOnTheScreen();
  });

  it("uses the existing Skeleton composition while local rates are still loading", () => {
    mockUseLiveRatesScreen.mockReturnValue(
      screenState({ isLoading: true, hasData: false })
    );

    render(<LiveRatesScreen />);

    expect(screen.getByTestId("live-rates-skeleton")).toBeOnTheScreen();
    expect(screen.queryByText("gold_label")).toBeNull();
    expect(screen.queryByText("rates_unavailable")).toBeNull();
  });

  it("keeps internal missing and invalid states out of the customer-facing page", () => {
    mockUseLiveRatesScreen.mockReturnValue(
      screenState({
        rateTrust: {
          gold: { state: "missing", dateTime: null },
          silver: { state: "invalid", dateTime: null },
          currencies: { state: "unknown", dateTime: null },
        },
      })
    );

    render(<LiveRatesScreen />);

    expect(screen.getByText("Rates")).toBeOnTheScreen();
    expect(screen.queryByText(/current rate unavailable/)).toBeNull();
    expect(screen.queryByText(/this rate can’t be used/)).toBeNull();
  });

  it("keeps cached rates visible after a refresh failure and exposes an accessible retry", () => {
    mockUseLiveRatesScreen.mockReturnValue(
      screenState({ refreshError: "cached_refresh_failed" })
    );

    render(<LiveRatesScreen />);

    expect(screen.getByText("E£ 40/g")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Rates: couldn’t refresh. Showing the last available rate."
      )
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Retry refresh" }));
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not expose diagnostic freshness copy in Arabic", () => {
    mockLocale = "ar";
    mockUseLiveRatesScreen.mockReturnValue(screenState());

    render(<LiveRatesScreen />);

    expect(screen.queryByText(/تم تحديث الأسعار/)).toBeNull();
    expect(screen.queryByText(/المصدر:/)).toBeNull();
    expect(screen.queryByText(/الجودة:/)).toBeNull();
  });

  it("reserves the Live Rates title and Live badge for confirmed-fresh rates", () => {
    mockUseLiveRatesScreen.mockReturnValue(
      screenState({
        isLive: true,
        rateTrust: {
          gold: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
          silver: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
          currencies: { state: "fresh", dateTime: "1 Sep 2026, 12:00" },
        },
      })
    );

    render(<LiveRatesScreen />);

    expect(screen.getByText("Live Rates")).toBeOnTheScreen();
    expect(screen.getByText("Live")).toBeOnTheScreen();
    expect(screen.queryByText("Rates")).toBeNull();
  });

  it("falls back to the neutral Rates title without a Live badge when trust is unconfirmed", () => {
    render(<LiveRatesScreen />);

    expect(screen.getByText("Rates")).toBeOnTheScreen();
    expect(screen.queryByText("Live Rates")).toBeNull();
    expect(screen.queryByText("Live")).toBeNull();
  });
});
