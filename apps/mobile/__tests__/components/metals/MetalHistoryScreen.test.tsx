import { render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import React from "react";
import { I18nManager } from "react-native";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { MetalHistoryScreen } from "@/components/metals/MetalHistoryScreen";
import type {
  MetalHistoryItem,
  MetalHistoryReadModel,
} from "@/services/metal-history-read-model-service";

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
        "disposal.reason_destroyed_or_damaged": "Destroyed or damaged",
        "disposal.reason_donated": "Donated",
        "disposal.reason_given_away": "Given away",
        "disposal.reason_lost_or_stolen": "Lost or stolen",
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
    Ionicons: ({
      name,
      testID,
    }: {
      readonly name?: string;
      readonly testID?: string;
    }): React.JSX.Element =>
      MockReact.createElement(View, {
        accessibilityLabel: name,
        testID: testID ?? "history-icon",
      }),
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

const baseSoldHistoryItem: MetalHistoryItem = {
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
};

const baseDisposedHistoryItem: MetalHistoryItem = {
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
};

const history: MetalHistoryReadModel = {
  counts: { all: 1, disposed: 0, sold: 1 },
  filter: "all",
  hasMore: false,
  items: [baseSoldHistoryItem],
};

const terminalHistoryFixture: MetalHistoryReadModel = {
  counts: { all: 2, disposed: 1, sold: 1 },
  filter: "all",
  hasMore: false,
  items: [
    {
      ...baseSoldHistoryItem,
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
    baseDisposedHistoryItem,
  ],
};

beforeAll(async () => {
  await i18next.init({
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    lng: "en",
    fallbackLng: "en",
    ns: "common",
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
});

describe("MetalHistoryScreen", () => {
  beforeEach(() => {
    mockScreenWidth = 390;
    mockFontScale = 1;
    mockLanguage = "en";
    mockBottomInset = 0;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: false,
    });
  });

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
        isReplacingRows={false}
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
        isReplacingRows={false}
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
    expect(screen.getByText("١٠٬٤٥٠٫٠٠ جنيه مصري")).toBeTruthy();
  });

  it("keeps History content above the bottom safe area", () => {
    mockBottomInset = 24;
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
        isReplacingRows={false}
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
        isReplacingRows={false}
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
        isReplacingRows={false}
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

  it("reflows Sold and Disposed cards on the failing 360px Android layout and 320px compact screens", () => {
    mockScreenWidth = 360;
    mockFontScale = 1;
    render(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    // Stacks Sold and Disposed rows
    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
    expect(
      screen.getByTestId("metal-history-item-content-disposed")
    ).toHaveProp("className", expect.stringContaining("flex-col"));
    // Terminal summary container aligns to start in stacked mode
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("items-start"));
    // In LTR stacked mode, text aligns to the left (same start edge as title/metadata)
    expect(screen.getByTestId("metal-history-terminal-label-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-left")
    );
    expect(screen.getByTestId("metal-history-terminal-value-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-left")
    );
    // Chevrons remain present
    expect(
      screen.getByTestId("metal-history-chevron-sold", {
        includeHiddenElements: true,
      })
    ).toHaveProp("accessibilityLabel", "chevron-forward");
  });

  it("preserves horizontal 3-part card composition on 390px ordinary phones and tablet viewports", () => {
    mockScreenWidth = 390;
    mockFontScale = 1;
    const { rerender } = render(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    // 3-part horizontal layout: holding image, identity/date, summary, chevron
    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("items-end"));
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("shrink-0"));
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).not.toHaveProp("className", expect.stringContaining("max-w-[40%]"));
    // In LTR horizontal mode, both label and value align to the trailing edge (text-right)
    expect(screen.getByTestId("metal-history-terminal-label-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-right")
    );
    expect(screen.getByTestId("metal-history-terminal-value-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-right")
    );

    // Tablet width
    mockScreenWidth = 768;
    rerender(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("items-end"));
  });

  it("reflows rows into stacked layout when font scale is enlarged to 2.0 or higher", () => {
    mockScreenWidth = 390;
    mockFontScale = 2.0;
    const { rerender } = render(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
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
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("items-start"));

    // Enlarged font scale on tablet also reflows dense rows
    mockScreenWidth = 768;
    mockFontScale = 2.0;
    rerender(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
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

  it("aligns summary label and value consistently to the trailing edge in Arabic RTL", () => {
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });
    mockLanguage = "ar";
    mockScreenWidth = 390;
    mockFontScale = 1;

    const { rerender } = render(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    // In RTL horizontal layout: end-aligned is text-left (trailing edge)
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("items-end"));
    expect(screen.getByTestId("metal-history-terminal-label-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-left")
    );
    expect(screen.getByTestId("metal-history-terminal-value-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-left")
    );
    expect(
      screen.getByTestId("metal-history-chevron-sold", {
        includeHiddenElements: true,
      })
    ).toHaveProp("accessibilityLabel", "chevron-back");

    // In RTL stacked layout on 360px: start-aligned is text-right (leading edge)
    mockScreenWidth = 360;
    rerender(
      <MetalHistoryScreen
        error={null}
        history={terminalHistoryFixture}
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
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("items-start"));
    expect(screen.getByTestId("metal-history-terminal-label-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-right")
    );
    expect(screen.getByTestId("metal-history-terminal-value-sold")).toHaveProp(
      "className",
      expect.stringContaining("text-right")
    );
  });

  it("gives predictable space to terminal summary without splitting currency and amount when holding name is long", () => {
    mockScreenWidth = 390;
    mockFontScale = 1;
    const longNameHistory: MetalHistoryReadModel = {
      counts: { all: 1, disposed: 0, sold: 1 },
      filter: "all",
      hasMore: false,
      items: [
        {
          ...baseSoldHistoryItem,
          name: "QA Sold Gold Coin With Extended Commemorative Inscription",
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
      ],
    };

    render(
      <MetalHistoryScreen
        error={null}
        history={longNameHistory}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByTestId("metal-history-item-content-sold")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(
      screen.getByTestId("metal-history-terminal-summary-sold")
    ).toHaveProp("className", expect.stringContaining("shrink-0"));
    expect(screen.getByText("EGP 10,450.00")).toBeTruthy();
  });

  it("handles long disposal reasons and long currency values without truncation", () => {
    mockScreenWidth = 390;
    mockFontScale = 1;
    const longReasonHistory: MetalHistoryReadModel = {
      counts: { all: 2, disposed: 1, sold: 1 },
      filter: "all",
      hasMore: false,
      items: [
        {
          ...baseSoldHistoryItem,
          terminalFacts: {
            actionId: "sale-action",
            feeDecimal: "150",
            grossProceedsDecimal: "1250000.5",
            kind: "sold",
            netProceedsDecimal: "1250000.5",
            notes: null,
            proceedsCurrency: "KWD",
            realizedResultCurrency: "KWD",
            realizedResultDecimal: "1550",
            realizedResultUnavailableReason: null,
            terminalDate: "2026-08-22",
          },
        },
        {
          ...baseDisposedHistoryItem,
          terminalFacts: {
            actionId: "dispose-action",
            kind: "disposed",
            notes: null,
            reason: "destroyed_or_damaged",
            terminalDate: "2026-08-24",
            treatment: "write_off",
          },
        },
      ],
    };

    render(
      <MetalHistoryScreen
        error={null}
        history={longReasonHistory}
        isLoading={false}
        isOffline={false}
        isReplacingRows={false}
        loadMore={jest.fn()}
        onFilterChange={jest.fn()}
        onOpenHolding={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("Destroyed or damaged")).toBeTruthy();
    expect(screen.getByText("KWD 1,250,000.500")).toBeTruthy();
  });
});
