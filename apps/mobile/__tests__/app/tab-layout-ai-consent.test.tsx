import React from "react";
import {
  Pressable as MockPressable,
  Text as MockText,
  View as MockView,
} from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockRouterPush = jest.fn();
let mockTabIndex: number | undefined = 3;
let mockLanguage: "en" | "ar" = "en";
const mockScreenOptions = new Map<
  string,
  { readonly title?: string } | undefined
>();
const mockTabTranslations = {
  en: {
    home: "Home",
    accounts: "Accounts",
    transactions: "Transactions",
    metals: "Metals",
  },
  ar: {
    home: "الرئيسية",
    accounts: "الحسابات",
    transactions: "المعاملات",
    metals: "المعادن",
  },
} as const;

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: keyof typeof mockTabTranslations.en) => string;
  } => ({
    t: (key: keyof typeof mockTabTranslations.en): string =>
      mockTabTranslations[mockLanguage][key],
  }),
}));

jest.mock("expo-router", () => {
  function Tabs({
    children,
    tabBar,
  }: {
    readonly children?: React.ReactNode;
    readonly tabBar?: (props: {
      readonly state: { readonly index: number | undefined };
    }) => React.ReactNode;
  }): React.ReactElement {
    return (
      <MockView>
        {children}
        {tabBar?.({ state: { index: mockTabIndex } })}
      </MockView>
    );
  }
  Tabs.Screen = function Screen({
    name,
    options,
  }: {
    readonly name: string;
    readonly options?: { readonly title?: string };
  }): null {
    mockScreenOptions.set(name, options);
    return null;
  };
  return {
    Tabs,
    useRouter: (): { readonly push: jest.Mock } => ({ push: mockRouterPush }),
  };
});

jest.mock("@/components/fab", () => ({ QuickActionFab: (): null => null }));
jest.mock("@/components/dashboard/upcoming-payments", () => ({
  PayNowModal: (): null => null,
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));
jest.mock("@/components/tab-bar/CustomBottomTabBar", () => ({
  CustomBottomTabBar: ({
    onMicPress,
  }: {
    readonly onMicPress: () => void;
  }): React.ReactElement => (
    <MockPressable testID="tab-mic" onPress={onMicPress}>
      <MockText>Mic</MockText>
    </MockPressable>
  ),
}));
jest.mock("@/context/MicButtonRefContext", () => ({
  MicButtonRefProvider: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }): React.ReactNode => children,
  useMicButtonRef: (): null => null,
}));
jest.mock("@/context/MicTooltipContext", () => ({
  MicTooltipProvider: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }): React.ReactNode => children,
}));
jest.mock("@/context/PayNowOverlayContext", () => ({
  PayNowOverlayProvider: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }): React.ReactNode => children,
  usePayNowOverlay: (): {
    readonly selectedPayment: null;
    readonly isPayNowVisible: boolean;
    readonly closePayNow: () => void;
  } => ({
    selectedPayment: null,
    isPayNowVisible: false,
    closePayNow: (): void => {},
  }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));
jest.mock("@/utils/localized-money-display", () => ({
  formatLocalizedMoneyAmount: (): string => "",
}));

import TabLayout from "@/app/(private)/(tabs)/_layout";

describe("TabLayout Voice navigation", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockScreenOptions.clear();
    mockTabIndex = 3;
    mockLanguage = "en";
  });

  it("opens the unified Voice route with the current origin tab", (): void => {
    render(<TabLayout />);
    fireEvent.press(screen.getByTestId("tab-mic"));
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/add-transaction",
      params: { mode: "voice", originTabIndex: "3" },
    });
  });

  it("uses the Home origin when tab state has not resolved", (): void => {
    mockTabIndex = undefined;
    render(<TabLayout />);
    fireEvent.press(screen.getByTestId("tab-mic"));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/add-transaction",
      params: { mode: "voice", originTabIndex: "0" },
    });
  });

  it("uses English and Arabic titles from the active translation state", (): void => {
    const { unmount } = render(<TabLayout />);
    expect(mockScreenOptions.get("index")?.title).toBe("Home");
    expect(mockScreenOptions.get("accounts")?.title).toBe("Accounts");
    expect(mockScreenOptions.get("transactions")?.title).toBe("Transactions");
    expect(mockScreenOptions.get("metals")?.title).toBe("Metals");
    unmount();
    mockLanguage = "ar";
    render(<TabLayout />);
    expect(mockScreenOptions.get("index")?.title).toBe("الرئيسية");
    expect(mockScreenOptions.get("accounts")?.title).toBe("الحسابات");
    expect(mockScreenOptions.get("transactions")?.title).toBe("المعاملات");
    expect(mockScreenOptions.get("metals")?.title).toBe("المعادن");
  });
});
