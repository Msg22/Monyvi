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
  },
};

function mockTranslate(
  key: string,
  options?: Readonly<{ readonly dateTime?: string }>
): string {
  const template = MOCK_RATE_COPY[mockLocale][key] ?? key;
  return template.replace("{{dateTime}}", options?.dateTime ?? "{{dateTime}}");
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
      options?: Readonly<{ readonly dateTime?: string }>
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

describe("LiveRatesScreen Metals V1 trust presentation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLiveRatesScreen.mockReturnValue(screenState());
    mockLocale = "en";
  });

  it("keeps Live Rates composition while limiting metal cards to Gold and Silver and announcing independent trust", () => {
    render(<LiveRatesScreen />);

    expect(screen.getByText("gold_label")).toBeOnTheScreen();
    expect(screen.getByText("silver")).toBeOnTheScreen();
    expect(screen.queryByText("platinum")).toBeNull();
    expect(
      screen.getByText(
        "gold · Live Rates: current rate. Rates updated 1 Sep 2026, 12:00"
      )
    ).toBeOnTheScreen();
    expect(
      screen.getByText("silver · Rates: rate is older than 24 hours")
    ).toBeOnTheScreen();
    expect(
      screen.getByText("currencies · Rates: rate age is unknown")
    ).toBeOnTheScreen();
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

    expect(screen.queryByText("gold_label")).toBeNull();
    expect(screen.queryByText("rates_unavailable")).toBeNull();
  });

  it("renders missing and invalid rate copy without collapsing either into stale", () => {
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

    expect(
      screen.getByText("gold · Rates: current rate unavailable")
    ).toBeOnTheScreen();
    expect(
      screen.getByText("silver · Rates: this rate can’t be used")
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText("silver: Rates: this rate can’t be used")
    ).toBeOnTheScreen();
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

  it("renders approved Arabic freshness copy visibly and in the accessible name", () => {
    mockLocale = "ar";
    mockUseLiveRatesScreen.mockReturnValue(screenState());

    render(<LiveRatesScreen />);

    const freshCopy =
      "الأسعار المباشرة: سعر حديث. تم تحديث الأسعار في 1 Sep 2026, 12:00";
    expect(screen.getByText("gold · " + freshCopy)).toBeOnTheScreen();
    expect(screen.getByLabelText("gold: " + freshCopy)).toBeOnTheScreen();
  });
});
