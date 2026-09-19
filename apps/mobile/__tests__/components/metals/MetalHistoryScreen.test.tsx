import { render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHistoryScreen } from "@/components/metals/MetalHistoryScreen";
import type { MetalHistoryReadModel } from "@/services/metal-history-read-model-service";

let mockScreenWidth = 390;
let mockFontScale = 1;
let mockLanguage = "en";
let mockBottomInset = 0;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({
    fontScale: mockFontScale,
    height: 844,
    scale: 1,
    width: mockScreenWidth,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (
      key: string,
      values?: Record<string, string | number>
    ) => string;
  } => ({
    i18n: { resolvedLanguage: mockLanguage },
    t: (key: string, values?: Record<string, string | number>): string => {
      const translations: Record<string, string> = {
        "form.coin": "Coin",
        "history.all": "All",
        "history.disposed": "Disposed",
        "history.empty": "No holdings here yet.",
        "history.filter_accessibility": "{{label}} {{count}}",
        "history.load_error": "History unavailable.",
        "history.net_proceeds": "Net proceeds",
        "history.no_sale_proceeds": "No sale proceeds",
        "history.terminal_facts_unavailable": "Recorded details unavailable",
        "history.offline": "Offline",
        "history.retry": "Try again",
        "history.sold": "Sold",
        "history.subtitle": "Sales and holdings no longer in your possession.",
        "metal.gold": "Gold",
        "metal.silver": "Silver",
        purity_gold_999: "24K · 999",
        purity_silver_999: "999",
        "status.sold": "Sold",
        "status.disposed": "Disposed",
        "disposal.reason_given_away": "Given away",
        "disposal.reason_other": "Other",
        "disposal.treatment_external_transfer": "Record it as moved out",
        "disposal.treatment_write_off": "Record a loss",
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
    Ionicons: ({ testID }: { readonly testID?: string }): React.JSX.Element =>
      MockReact.createElement(View, { testID: testID ?? "history-icon" }),
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
  } => ({ bottom: mockBottomInset }),
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
  beforeEach(() => {
    mockScreenWidth = 390;
    mockFontScale = 1;
    mockLanguage = "en";
    mockBottomInset = 0;
  });

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

  it("renders exact Sold proceeds and Disposed meaning from terminal evidence", () => {
    const terminalHistory: MetalHistoryReadModel = {
      counts: { all: 2, disposed: 1, sold: 1 },
      filter: "all",
      hasMore: false,
      items: [
        {
          ...history.items[0]!,
          terminalFacts: {
            actionId: "sale-action",
            feeDecimal: "150",
            grossProceedsDecimal: "10600",
            kind: "sold",
            netProceedsDecimal: "10450",
            notes: null,
            proceedsCurrency: "EGP",
            realizedResultCurrency: "EGP",
            realizedResultDecimal: "1550",
            realizedResultUnavailableReason: null,
            terminalDate: "2026-08-22",
          },
        },
        {
          holdingId: "disposed-silver-bar",
          itemForm: "bar",
          metalType: "SILVER",
          name: "Silver keepsake",
          occurredAt: new Date("2026-08-24T12:00:00.000Z"),
          purityCatalogVersion: "1",
          purityCode: "silver-999",
          purityFactorDecimal: "0.999",
          renderKey: "silver:bar",
          status: "disposed",
          terminalFacts: {
            actionId: "dispose-action",
            kind: "disposed",
            notes: null,
            reason: "given_away",
            terminalDate: "2026-08-24",
            treatment: "external_transfer",
          },
        },
      ],
    };

    render(
      <MetalHistoryScreen
        error={null}
        history={terminalHistory}
        isLoading={false}
        isOffline={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("Net proceeds")).toBeTruthy();
    expect(screen.getByText("EGP 10,450.00")).toHaveStyle({
      writingDirection: "ltr",
    });
    expect(screen.getByText("Given away")).toBeTruthy();
    expect(screen.getByText("No sale proceeds")).toBeTruthy();
    expect(screen.getByTestId("metal-history-status-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-nileGreen")
    );
    expect(
      screen.getByLabelText(/Sold.*Net proceeds.*EGP 10,450.00/)
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/Disposed.*Given away.*No sale proceeds/)
    ).toBeTruthy();
  });

  it("formats absolute terminal dates and exact currency values for Arabic", () => {
    mockLanguage = "ar";
    render(
      <MetalHistoryScreen
        error={null}
        history={{
          ...history,
          items: [
            {
              ...history.items[0]!,
              terminalFacts: {
                actionId: "sale-action",
                feeDecimal: "0",
                grossProceedsDecimal: "10450",
                kind: "sold",
                netProceedsDecimal: "10450",
                notes: null,
                proceedsCurrency: "EGP",
                realizedResultCurrency: null,
                realizedResultDecimal: null,
                realizedResultUnavailableReason: "invalid_sale_evidence",
                terminalDate: "2026-08-22",
              },
            },
          ],
        }}
        isLoading={false}
        isOffline={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText(/أغسطس/)).toBeTruthy();
    expect(screen.getByTestId("metal-history-item-sold")).toHaveProp(
      "accessibilityLabel",
      expect.stringContaining("أغسطس")
    );
    expect(screen.getByText("EGP 10,450.00")).toBeTruthy();
  });

  it("keeps History content above the bottom safe area", () => {
    mockBottomInset = 24;
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

    expect(screen.getByTestId("metal-history-root")).toHaveProp(
      "contentContainerStyle",
      { paddingBottom: 64 }
    );
  });

  it("fails closed for missing terminal evidence and reflows compact rows", () => {
    const { rerender } = render(
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

    expect(screen.getByText("Recorded details unavailable")).toBeTruthy();
    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );

    mockScreenWidth = 320;
    rerender(
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
    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );

    mockScreenWidth = 390;
    mockFontScale = 2;
    rerender(
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
    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
  });
});
