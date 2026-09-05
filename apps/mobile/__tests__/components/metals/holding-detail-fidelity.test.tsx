import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { getHoldingActionDescriptors } from "@/components/metals/holding-actions/registry";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

let mockScreenWidth = 390;
let mockFontScale = 1;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({
    width: mockScreenWidth,
    height: 844,
    scale: 1,
    fontScale: mockFontScale,
  }),
}));

const translations: Readonly<Record<string, string>> = {
  "actions.delete": "Delete holding",
  "actions.dispose": "No longer in my possession",
  "actions.edit": "Edit details",
  "actions.sell": "Sell holding",
  "detail.acquired": "Acquired",
  "detail.calculation_disclosure": "How this value was calculated",
  "detail.current_value": "Current value",
  "detail.current_value_unavailable": "Current value unavailable",
  "detail.fact_accessibility": "{{label}}: {{value}}",
  "detail.follow_value": "Follow the value",
  "detail.history": "History",
  "detail.offline": "Offline mode",
  "detail.paid": "{{amount}} paid",
  "detail.physical_facts": "Physical facts",
  "detail.rate_updated": "Rates updated {{date}}",
  "detail.restored": "Restored to Active",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.timeline_current_value": "Current value",
  "form.bar": "Bar",
  "form.coin": "Coin",
  "form.jewelry": "Jewelry",
  "form.unknown": "Other form",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "portfolio.rates_updated": "Rates updated {{when}}",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "status.active": "Active",
  "timeline.add": "Added",
  "timeline.correct": "Details updated",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Readonly<Record<string, string>>): string => {
      const template = translations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (value, [name, replacement]) =>
          value.replace(`{{${name}}}`, replacement),
        template
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ testID }: { readonly testID?: string }): React.JSX.Element => {
    const { View } = jest.requireActual(
      "react-native"
    ) as typeof import("react-native");
    return <View testID={testID} />;
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 0 }),
}));

function activeDetail(
  overrides: Partial<MetalDetailReadModel> = {}
): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueCurrency: "EGP",
    currentValueDecimal: "162317.87",
    currentValueObservedAt: new Date(2026, 7, 25, 10, 30),
    id: "holding-gold-coin",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    itemForm: "coin",
    metalType: "GOLD",
    name: "Wedding coin",
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.20",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    renderKey: "gold:coin",
    requiresCompleteMaterialCorrection: false,
    status: "active",
    timeline: [
      {
        id: "corrected",
        kind: "correct",
        occurredAt: new Date("2025-06-02T00:00:00.000Z"),
      },
      {
        id: "created",
        kind: "add",
        occurredAt: new Date("2024-03-14T00:00:00.000Z"),
      },
    ],
    totalGainDecimal: "11039.67",
    unavailableExactFacts: [],
    weightGramsDecimal: "31.125",
    ...overrides,
  };
}

describe("approved active holding-detail fidelity", () => {
  beforeEach(() => {
    mockScreenWidth = 390;
    mockFontScale = 1;
  });

  it("renders the approved open composition without the duplicate route title or ERP card", () => {
    const model = activeDetail();

    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(model)}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onAction={jest.fn()}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );

    expect(screen.queryByText("Holding details")).toBeNull();
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.not.stringContaining("border")
    );
    expect(screen.getByText("Wedding coin")).toBeTruthy();
    expect(screen.getByText("Gold · 24K · 999 · Coin")).toBeTruthy();
    expect(screen.getByText("EGP 162,317.87")).toBeTruthy();
    expect(screen.getByText("+ EGP 11,039.67 since purchase")).toBeTruthy();
    expect(screen.getByText("Follow the value")).toBeTruthy();
    expect(screen.getByText("EGP 151,278.20 paid")).toBeTruthy();
    expect(
      screen.getByText("Rates updated 25 Aug 2026, 10:30 AM")
    ).toBeTruthy();
    expect(screen.getByText("Physical facts")).toBeTruthy();
    expect(screen.getByText("31.125 g")).toBeTruthy();
    expect(screen.getByText("Coin")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText(/Details updated/)).toBeTruthy();
  });

  it("preserves action callbacks, safe-area spacing, and the approved action hierarchy", () => {
    const model = activeDetail();
    const onAction = jest.fn();

    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(model)}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onAction={onAction}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );

    expect(screen.getByTestId("metal-holding-detail-actions")).toHaveStyle({
      paddingBottom: 40,
    });
    expect(screen.getByTestId("metal-holding-action-delete")).toHaveProp(
      "className",
      expect.not.stringContaining("border")
    );

    fireEvent.press(screen.getByText("Sell holding"));
    fireEvent.press(screen.getByText("Edit details"));
    fireEvent.press(screen.getByText("No longer in my possession"));
    fireEvent.press(screen.getByText("Delete holding"));

    expect(onAction).toHaveBeenNthCalledWith(1, "sell");
    expect(onAction).toHaveBeenNthCalledWith(2, "edit");
    expect(onAction).toHaveBeenNthCalledWith(3, "dispose");
    expect(onAction).toHaveBeenNthCalledWith(4, "delete");
  });

  it("keeps text legible in dark mode and uses a loss color for negative performance", () => {
    const model = activeDetail({ totalGainDecimal: "-11039.67" });

    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(model)}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onAction={jest.fn()}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );

    expect(screen.getByText("Wedding coin")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-primary-dark")
    );
    expect(screen.getByText("- EGP 11,039.67 since purchase")).toHaveProp(
      "className",
      expect.stringContaining("text-red-600")
    );
  });

  it("keeps the ordinary hero row and reflows only for compact or enlarged-text layouts", () => {
    const model = activeDetail();
    const props = {
      actions: getHoldingActionDescriptors(model),
      error: null,
      isLoading: false,
      isOffline: false,
      model,
      onAction: jest.fn(),
      onRetry: jest.fn(),
      onViewHistory: jest.fn(),
    } as const;
    const { rerender } = render(<MetalHoldingDetailScreen {...props} />);

    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );

    mockScreenWidth = 320;
    rerender(<MetalHoldingDetailScreen {...props} />);
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );

    mockScreenWidth = 390;
    mockFontScale = 1.5;
    rerender(<MetalHoldingDetailScreen {...props} />);
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
  });
});
