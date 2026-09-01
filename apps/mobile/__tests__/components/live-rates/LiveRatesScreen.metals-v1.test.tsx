import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

const mockUseLiveRatesScreen = jest.fn();
const mockOnRefresh = jest.fn();

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
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
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
      gold: "fresh",
      silver: "stale",
      currencies: "unknown",
    },
    refreshError: null,
    ...overrides,
  };
}

describe("LiveRatesScreen Metals V1 trust presentation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLiveRatesScreen.mockReturnValue(screenState());
  });

  it("keeps Live Rates composition while limiting metal cards to Gold and Silver and announcing independent trust", () => {
    render(<LiveRatesScreen />);

    expect(screen.getByText("gold_label")).toBeOnTheScreen();
    expect(screen.getByText("silver")).toBeOnTheScreen();
    expect(screen.queryByText("platinum")).toBeNull();
    expect(screen.getByText("gold · rate.fresh")).toBeOnTheScreen();
    expect(screen.getByText("silver · rate.stale")).toBeOnTheScreen();
    expect(screen.getByText("currencies · rate.unknown")).toBeOnTheScreen();
  });

  it("retains cached values while honestly showing offline mode and keeps currency search focus reachable", () => {
    mockUseLiveRatesScreen.mockReturnValue(
      screenState({
        isConnected: false,
        rateTrust: {
          gold: "fresh",
          silver: "fresh",
          currencies: "fresh",
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
});
