import { render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHistoryScreen } from "@/components/metals/MetalHistoryScreen";
import type { MetalHistoryReadModel } from "@/services/metal-history-read-model-service";

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string | number>) => string;
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
        (result, [name, value]) =>
          result.replace(`{{${name}}}`, String(value)),
        translations[key] ?? key
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const MockReact = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>(
    "react-native"
  );
  return {
    Ionicons: (): React.JSX.Element =>
      MockReact.createElement(View, { testID: "history-icon" }),
  };
});

jest.mock("@/components/metals/MetalHoldingRender", () => {
  const MockReact = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>(
    "react-native"
  );
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
});
