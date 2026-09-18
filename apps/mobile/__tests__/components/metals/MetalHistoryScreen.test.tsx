import { render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHistoryScreen } from "@/components/metals/MetalHistoryScreen";
import type { MetalHistoryReadModel } from "@/services/metal-history-read-model-service";

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (
      key: string,
      values?: Record<string, string | number>
    ) => string;
  } => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>): string => {
      const translations: Record<string, string> = {
        "form.coin": "Coin",
        "history.all": "All",
        "history.disposed": "Disposed",
        "history.empty": "No holdings here yet.",
        "history.filter_accessibility": "{{label}} {{count}}",
        "history.load_error": "History unavailable.",
        "history.offline": "Offline",
        "history.retry": "Try again",
        "history.sold": "Sold",
        "history.subtitle": "Sales and holdings no longer in your possession.",
        "metal.gold": "Gold",
        purity_gold_999: "24K · 999",
        "status.sold": "Sold",
      };
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        translations[key] ?? key
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const MockReact = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: (): React.JSX.Element =>
      MockReact.createElement(View, { testID: "history-icon" }),
  };
});

jest.mock("@/components/metals/MetalHoldingRender", () => {
  const MockReact = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingRender: (): React.JSX.Element =>
      MockReact.createElement(View, { testID: "history-render" }),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly bottom: number;
  } => ({ bottom: 0 }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

const history: MetalHistoryReadModel = {
  counts: { all: 1, disposed: 0, sold: 1 },
  filter: "all",
  hasMore: false,
  items: [
    {
      holdingId: "sold-gold-coin",
      itemForm: "coin",
      metalType: "GOLD",
      name: "Sold gold coin",
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      purityCatalogVersion: "1",
      purityCode: "gold-999",
      purityFactorDecimal: "0.875",
      renderKey: "gold:coin",
      status: "sold",
      terminalFacts: null,
    },
  ],
};

describe("MetalHistoryScreen", () => {
  it("renders unavailable purity when a catalog code and factor do not form a valid tuple", () => {
    render(
      <MetalHistoryScreen
        error={null}
        history={history}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(
      screen.getByLabelText(/Sold\. Sold gold coin\. Gold · — · Coin/)
    ).toBeTruthy();
    expect(screen.queryByLabelText(/24K · 999/)).toBeNull();
  });

  it("keeps the shell and filter bar mounted and skeletons only the list body during a filter replacement", () => {
    render(
      <MetalHistoryScreen
        error={null}
        history={{
          counts: { all: 3, disposed: 1, sold: 2 },
          filter: "disposed",
          hasMore: false,
          items: [],
        }}
        isLoading={false}
        isOffline={false}
        isReplacingRows
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    // The shell and its controls never unmount for a filter change.
    expect(screen.queryByTestId("metal-history-loading")).toBeNull();
    expect(screen.getByTestId("metal-history-root")).toBeTruthy();
    expect(
      screen.getByText("Sales and holdings no longer in your possession.")
    ).toBeTruthy();
    expect(screen.getByTestId("metal-history-filter-all")).toBeTruthy();
    expect(screen.getByTestId("metal-history-filter-disposed")).toBeTruthy();
    // Only the list body transitions to a skeleton.
    expect(screen.getByTestId("metal-history-list-skeleton")).toBeTruthy();
    // No previous-filter row and no empty-state copy leaks through.
    expect(screen.queryByTestId("metal-history-item-sold")).toBeNull();
    expect(screen.queryByText("No holdings here yet.")).toBeNull();
    // The newly selected filter is reflected immediately and counts stay shown.
    expect(screen.getByTestId("metal-history-filter-disposed")).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
    expect(screen.getByLabelText("Disposed 1")).toBeTruthy();
    expect(screen.getByLabelText("Sold 2")).toBeTruthy();
  });
});
