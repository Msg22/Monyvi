import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import { I18nManager, Platform, StatusBar, View } from "react-native";

import { LanguageSwitcherPill } from "@/components/onboarding/LanguageSwitcherPill";
import { palette } from "@/constants/colors";
import { arabicFontFamily, fontFamily } from "@/constants/typography";

const mockSetOverride = jest.fn<Promise<void>, ["en" | "ar"]>();
const mockSetPreferredLanguage = jest.fn<Promise<void>, ["en" | "ar"]>();
const mockSetIntroLocaleOverride = jest.fn<Promise<void>, ["en" | "ar"]>();
let mockLanguage = "en";
let mockIsDark = true;
let mockIsAuthenticated = false;
let mockMeasureRect = { x: 30, y: 70, width: 80, height: 36 };
let mockScreenWidth = 390;

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly language: string };
    readonly t: (key: string) => string;
  } => ({
    i18n: { language: mockLanguage },
    t: (key: string): string => key,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: mockIsDark }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: (): { readonly isAuthenticated: boolean } => ({
    isAuthenticated: mockIsAuthenticated,
  }),
}));

jest.mock("@/hooks/useIntroLocaleOverride", () => ({
  useIntroLocaleOverride: (): {
    readonly setOverride: typeof mockSetOverride;
  } => ({ setOverride: mockSetOverride }),
}));

jest.mock("@/services/intro-flag-service", () => ({
  setIntroLocaleOverride: (language: "en" | "ar"): Promise<void> =>
    mockSetIntroLocaleOverride(language),
}));

jest.mock("@/services/profile-service", () => ({
  setPreferredLanguage: (language: "en" | "ar"): Promise<void> =>
    mockSetPreferredLanguage(language),
}));

jest.mock("@/utils/logger", () => ({
  logger: { warn: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => {
  const ReactMod = jest.requireActual<typeof import("react")>("react");
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      ReactMod.createElement(
        ReactNative.Text,
        { testID: `icon-${name}` },
        name
      ),
  };
});

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({ width: mockScreenWidth, height: 844, scale: 1, fontScale: 1 }),
}));

jest.spyOn(View.prototype, "measureInWindow").mockImplementation((callback) => {
  callback(
    mockMeasureRect.x,
    mockMeasureRect.y,
    mockMeasureRect.width,
    mockMeasureRect.height
  );
});

describe("LanguageSwitcherPill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetOverride.mockResolvedValue(undefined);
    mockSetPreferredLanguage.mockResolvedValue(undefined);
    mockSetIntroLocaleOverride.mockResolvedValue(undefined);
    mockLanguage = "en";
    mockIsDark = true;
    mockIsAuthenticated = false;
    mockMeasureRect = { x: 30, y: 70, width: 80, height: 36 };
    mockScreenWidth = 390;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });
    Object.defineProperty(StatusBar, "currentHeight", {
      configurable: true,
      value: 0,
    });
  });

  it("renders approved dark picker below the pill without covering it", () => {
    render(<LanguageSwitcherPill />);

    expect(screen.getByRole("button", { name: "Language: EN" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ expanded: false })
    );
    expect(screen.getByTestId("icon-chevron-down")).toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", { name: "Language: EN" }));

    expect(screen.getByRole("button", { name: "Language: EN" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ expanded: true })
    );
    expect(screen.getByTestId("icon-chevron-up")).toBeOnTheScreen();
    expect(screen.getByTestId("language-popover")).toHaveStyle({
      left: 30,
      top: 118,
      width: 194,
      borderRadius: 17,
      padding: 6,
      backgroundColor: palette.slate[800],
    });
    expect(screen.getByTestId("language-option-en")).toHaveStyle({
      height: 50,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: `${palette.nileGreen[400]}21`,
    });
    expect(screen.getByTestId("language-option-ar")).toHaveStyle({
      height: 50,
      borderRadius: 12,
      paddingHorizontal: 12,
    });
    expect(screen.getByTestId("language-label-en")).toHaveStyle({
      fontFamily: fontFamily.semiBold,
    });
    expect(screen.getByTestId("language-label-ar")).toHaveStyle({
      fontFamily: arabicFontFamily.semiBold,
    });
    expect(screen.getByTestId("language-code-en")).toHaveTextContent("EN");
    expect(screen.getByTestId("language-code-ar")).toHaveTextContent("AR");
    expect(screen.getByTestId("language-selected-check-en")).toHaveStyle({
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: palette.nileGreen[400],
    });
  });

  it("normalizes Android modal coordinates so options stay below the trigger", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
    Object.defineProperty(StatusBar, "currentHeight", {
      configurable: true,
      value: 24,
    });

    render(<LanguageSwitcherPill />);
    fireEvent.press(screen.getByRole("button", { name: "Language: EN" }));

    expect(screen.getByTestId("language-popover")).toHaveStyle({ top: 142 });
  });

  it("mirrors and clamps the approved light picker in RTL", () => {
    mockLanguage = "ar";
    mockIsDark = false;
    mockMeasureRect = { x: 280, y: 70, width: 80, height: 36 };
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });

    render(<LanguageSwitcherPill />);
    fireEvent.press(screen.getByRole("button", { name: "Language: AR" }));

    expect(screen.getByTestId("language-popover")).toHaveStyle({
      right: 166,
      top: 118,
      backgroundColor: palette.slate[25],
    });
    expect(screen.getByTestId("language-option-ar")).toHaveStyle({
      backgroundColor: palette.nileGreen[50],
    });
    expect(screen.getByTestId("language-selected-check-ar")).toBeOnTheScreen();
  });

  it("closes on the selected language and changes a different pre-auth language", async () => {
    render(<LanguageSwitcherPill />);
    fireEvent.press(screen.getByRole("button", { name: "Language: EN" }));
    fireEvent.press(
      screen.getByRole("button", { name: "English", selected: true })
    );

    expect(screen.queryByTestId("language-popover")).not.toBeOnTheScreen();
    expect(mockSetOverride).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Language: EN" }));
    fireEvent.press(screen.getByTestId("language-option-ar"));

    await waitFor(() => {
      expect(mockSetOverride).toHaveBeenCalledWith("ar");
    });
  });
});
