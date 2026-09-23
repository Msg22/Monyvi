/**
 * Accounts tab layout tests.
 *
 * The custom bottom tab bar is absolutely positioned, so long account lists
 * must reserve bottom content padding or the final card can sit under the tab
 * bar and become impossible to scroll fully into view.
 */

import React from "react";
import { FlatList } from "react-native";
import { TAB_BAR_HEIGHT } from "../../constants/ui";

interface ReactTestRendererInstance {
  readonly root: {
    findByType: (type: unknown) => { props: Record<string, unknown> };
  };
}

interface ReactTestRendererModule {
  readonly create: (element: React.ReactElement) => ReactTestRendererInstance;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const RTR: ReactTestRendererModule = require("react-test-renderer");

const SAFE_AREA_BOTTOM = 34;
const mockRouterPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: (): { push: jest.Mock } => ({ push: mockRouterPush }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { bottom: number } => ({ bottom: SAFE_AREA_BOTTOM }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("@/components/accounts", () => ({
  AccountCard: (): null => null,
  AccountTypeTabs: (): null => null,
}));

jest.mock("@/components/accounts/skeletons/AccountListSkeleton", () => ({
  AccountListSkeleton: (): null => null,
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/components/ui/Button", () => ({
  Button: (): null => null,
}));

jest.mock("@/utils/account-display", () => ({
  buildAccountDisplayNames: (): Map<string, string> => new Map(),
}));

jest.mock("@/hooks", () => ({
  useAccounts: (): unknown => ({
    accounts: Array.from({ length: 17 }, (_, index) => ({
      id: `account-${index + 1}`,
      name: `Account ${index + 1}`,
      type: "CASH",
      currency: "EGP",
    })),
    totalAccountsBalance: 1700,
    convertedSubtitlesByAccountId: new Map<string, string>(),
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { latestRates: null } => ({ latestRates: null }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@monyvi/logic", () => ({
  formatCurrency: (): string => "EGP 1,700",
}));

// Import AFTER mocks
// eslint-disable-next-line import/first
import Accounts from "../../app/(private)/(tabs)/accounts";

describe("Accounts tab", () => {
  it("reserves bottom space so the last account card scrolls above the tab bar", () => {
    const renderer = RTR.create(React.createElement(Accounts));
    const list = renderer.root.findByType(FlatList);
    const contentContainerStyle = list.props.contentContainerStyle as
      | { paddingBottom?: number; flexGrow?: number }
      | undefined;

    expect(contentContainerStyle?.flexGrow).toBe(1);
    expect(contentContainerStyle?.paddingBottom).toBeGreaterThanOrEqual(
      TAB_BAR_HEIGHT + SAFE_AREA_BOTTOM
    );
  });
});
