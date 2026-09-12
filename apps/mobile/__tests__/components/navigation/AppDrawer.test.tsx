import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Animated, Dimensions } from "react-native";

const mockAnimatedStart = jest.fn<void, []>();
const mockAnimation: Animated.CompositeAnimation = {
  start: mockAnimatedStart,
  stop: jest.fn(),
  reset: jest.fn(),
};
const mockAnimatedTiming = jest
  .spyOn(Animated, "timing")
  .mockImplementation(() => mockAnimation);
let mockIsRTL = false;

jest.spyOn(Dimensions, "get").mockReturnValue({
  width: 400,
  height: 800,
  scale: 2,
  fontScale: 1,
});

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ isRTL: mockIsRTL }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false, toggleTheme: jest.fn() }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock("@/hooks/useLogoutFlow", () => ({
  useLogoutFlow: () => ({
    isLoggingOut: false,
    showSyncWarning: false,
    requestLogout: jest.fn(),
    forceLogout: jest.fn(),
    dismissSyncWarning: jest.fn(),
  }),
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: () => 0,
}));

jest.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: null, isLoading: false }),
}));

jest.mock("@/utils/profile-helpers", () => ({
  getProfileDisplayName: () => "User",
  getProfileAvatarUrl: () => null,
  getProfileInitials: () => "U",
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { readonly children?: React.ReactNode }) => {
    const { View: MockView } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockView>{children}</MockView>;
  },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: () => null,
}));

jest.mock("@/components/navigation/DrawerMenuSection", () => ({
  DrawerMenuSection: () => null,
}));

describe("AppDrawer direction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRTL = false;
  });

  it.each([
    { languageDirection: "LTR", isRTL: false, hiddenOffset: -320 },
    { languageDirection: "RTL", isRTL: true, hiddenOffset: 320 },
  ])(
    "anchors at the $languageDirection start edge and mirrors repeated motion",
    ({ isRTL, hiddenOffset }) => {
      const { AppDrawer } = jest.requireActual<
        typeof import("@/components/navigation/AppDrawer")
      >("@/components/navigation/AppDrawer");
      mockIsRTL = isRTL;
      const onClose = jest.fn();
      const { rerender } = render(
        <AppDrawer visible={false} onClose={onClose} />
      );

      expect(mockAnimatedTiming).toHaveBeenLastCalledWith(expect.any(Object), {
        toValue: hiddenOffset,
        duration: 250,
        useNativeDriver: true,
      });

      rerender(<AppDrawer visible onClose={onClose} />);
      expect(mockAnimatedTiming).toHaveBeenLastCalledWith(expect.any(Object), {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      });

      expect(screen.getByTestId("app-drawer-panel")).toHaveStyle({
        position: "absolute",
        start: 0,
      });
      expect(screen.getByTestId("app-drawer-panel")).not.toHaveStyle({
        left: 0,
        right: 0,
      });
      expect(screen.getByTestId("app-drawer-panel")).toHaveStyle({
        transform: [{ translateX: hiddenOffset }],
      });

      rerender(<AppDrawer visible={false} onClose={onClose} />);
      expect(mockAnimatedTiming).toHaveBeenLastCalledWith(expect.any(Object), {
        toValue: hiddenOffset,
        duration: 250,
        useNativeDriver: true,
      });
    }
  );
});
