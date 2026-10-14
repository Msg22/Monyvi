import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
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
  "actions.dispose": "No longer owned",
  "actions.edit": "Edit details",
  "actions.sell": "Sell holding",
  "detail.acquired": "Acquired",
  "detail.calculation_breakdown_unavailable":
    "Breakdown unavailable. The total is based on your recorded details.",
  "detail.calculation_disclosure": "How this value was calculated",
  "detail.currency_movement": "Currency movement",
  "detail.current_value": "Current value",
  "detail.current_value_unavailable": "Current value unavailable",
  "detail.current_value_rate_unavailable":
    "A current market rate is unavailable. Your holding details are still saved here.",
  "detail.display_rounding":
    "Displayed amounts are rounded, so the parts may differ slightly from the total.",
  "detail.fact_accessibility": "{{label}}: {{value}}",
  "detail.financial_facts": "Financial facts",
  "detail.follow_value": "Follow the value",
  "detail.gross_sale_proceeds": "Gross sale proceeds",
  "detail.holding_story": "Holding story",
  "portfolio.rates_updated":
    "Prices last updated {{date}} at {{time}}. They may have changed since then.",
  "portfolio.per_gram": "/ g",
  "detail.history": "History",
  "detail.metal_movement": "Metal movement",
  "detail.market_rate_on_purchase_date": "Market rate on purchase date",
  "detail.offline": "Offline mode",
  "detail.paid": "{{amount}} paid",
  "detail.net_proceeds": "Net proceeds",
  "detail.no_longer_active": "No longer among your gold and silver.",
  "detail.no_longer_possession": "No longer owned",
  "detail.notes": "Notes",
  "detail.physical_facts": "Physical facts",
  "detail.purchase_premium_costs": "Purchase premium and costs",
  "detail.restored": "Restored to Active",
  "detail.sale_fee": "Sale fee",
  "detail.sale_loss": "{{amount}} loss from this sale",
  "detail.sale_profit": "{{amount}} profit from this sale",
  "detail.sale_result_unavailable":
    "Profit or loss from this sale is unavailable.",
  "detail.disposal_explanation":
    "{{reason}}. This holding left your metals. No money was added to your accounts. No profit or loss from a sale.",
  "detail.what_happened": "What happened",
  "detail.reason": "Reason",
  "detail.money_from_sale": "Money from a sale",
  "detail.account_change": "Account change",
  "detail.none": "None",
  "detail.no_change": "No change",
  "detail.terminal_facts_unavailable": "Recorded details are unavailable.",
  "detail.retry": "Try again",
  "detail.retry_sync": "Try sync again",
  "portfolio.performance_unavailable":
    "Since-purchase result unavailable. Purchase cost is not available.",
  "portfolio.performance_unavailable_rate_reference":
    "Since-purchase result unavailable. A purchase-currency rate is not available.",
  "reconciliation.incomplete":
    "Changes are still being checked. The last complete state remains active.",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.timeline_current_value": "Current value",
  "detail.value_unavailable": "Value unavailable",
  "form.bar": "Bar",
  "form.coin": "Coin",
  "form.jewelry": "Jewelry",
  "form.unknown": "Other form",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "rate.missing": "Rates: current rate unavailable",
  "rate.short_stale": "Last available",
  "rate.short_unknown": "Age unknown",
  "rate.short_fresh": "Current",
  purity_gold_999: "24K · 999",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "status.active": "Active",
  "status.sold": "Sold",
  "status.disposed": "Disposed",
  "disposal.reason_destroyed_or_damaged": "Destroyed or damaged",
  "disposal.reason_donated": "Donated",
  "disposal.reason_given_away": "Given away",
  "disposal.reason_lost_or_stolen": "Lost or stolen",
  "disposal.reason_other": "Other",
  "disposal.treatment_external_transfer": "Record it as moved out",
  "disposal.treatment_write_off": "Record a loss",
  "timeline.add": "Added",
  "timeline.correct": "Details updated",
  weight: "Weight",
  purity: "Purity",
  form_optional: "Physical form (optional)",
  weight_unit: "g",
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

jest.mock("@expo/vector-icons", () => {
  const renderIcon = ({
    testID,
  }: {
    readonly testID?: string;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View testID={testID} />;
  };
  return {
    Ionicons: renderIcon,
    MaterialCommunityIcons: renderIcon,
  };
});

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
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
    currentValueRateStatus: {
      ageMs: 1_000,
      providerObservedAt: new Date(2026, 7, 25, 10, 30),
      quality: "valid",
      source: "fixture",
      state: "fresh",
    },
    id: "holding-gold-coin",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    itemForm: "coin",
    metalType: "GOLD",
    name: "Wedding coin",
    notes: null,
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.20",
    purchaseDateMarketReference: null,
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    reconciliationState: "accepted",
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
    terminalFacts: overrides.terminalFacts ?? null,
  };
}

describe("approved terminal holding-detail fidelity", () => {
  beforeEach(() => {
    mockScreenWidth = 390;
    mockFontScale = 1;
  });

  it("renders the approved Sold hierarchy from immutable terminal evidence", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          currentValueDecimal: null,
          isActiveOwnership: false,
          name: "21K bracelet",
          status: "sold",
          terminalFacts: {
            actionId: "sale-action",
            feeDecimal: "150",
            grossProceedsDecimal: "10600",
            kind: "sold",
            netProceedsDecimal: "10450",
            notes: "Sold to trusted jeweller",
            proceedsCurrency: "EGP",
            realizedResultCurrency: "EGP",
            realizedResultDecimal: "1550",
            displayRateTrust: [
              {
                currency: "USD",
                state: "stale",
                providerObservedAt: new Date("2026-08-01T12:00:00Z"),
                ageMs: 172_800_000,
              },
            ],
            displayAttribution: {
              combinedDecimal: "1550.00",
              displayedComponentSumDecimal: "1550.00",
              roundingDifferenceMinorUnits: "0",
              requiresRoundingExplanation: false,
              displayedComponents: {
                metalMovementDecimal: "1000.00",
                currencyMovementDecimal: "200.00",
                purchaseCostDecimal: "300.00",
                saleDifferenceDecimal: "200.00",
                feeDecimal: "-150.00",
              },
            },
            realizedResultUnavailableReason: null,
            terminalDate: "2026-08-22",
          },
          totalGainDecimal: null,
        })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getAllByText("Net proceeds")).toHaveLength(2);
    expect(screen.getAllByText("EGP 10,450.00")).toHaveLength(2);
    expect(screen.getByText("EGP 1,550.00 profit from this sale")).toBeTruthy();
    expect(screen.queryByTestId("metal-sold-display-rate-trust")).toBeNull();
    expect(screen.queryByText(/Last available/)).toBeNull();
    expect(screen.getByText("Holding story")).toBeTruthy();
    expect(screen.getAllByText("Sold").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("22 Aug 2026")).toBeTruthy();
    expect(screen.getByText("Financial facts")).toBeTruthy();
    expect(screen.getByText("EGP 10,600.00")).toBeTruthy();
    expect(screen.getByText("− EGP 150.00")).toBeTruthy();
    expect(screen.getByText("Sold to trusted jeweller")).toBeTruthy();
    expect(screen.queryByText(/account credited/i)).toBeNull();
    expect(screen.queryByText("sale-action")).toBeNull();
    expect(screen.queryByText("Physical facts")).toBeNull();
    expect(screen.queryByText("Current value")).toBeNull();
    expect(screen.queryByText("EGP 1,000.00")).toBeNull();
    fireEvent.press(screen.getByText("How this value was calculated"));
    expect(screen.getByText("EGP 1,000.00")).toBeTruthy();
    expect(screen.getByText("- EGP 150.00")).toBeTruthy();
    expect(screen.getByText("EGP 1,550.00 profit from this sale")).toBeTruthy();
  });

  it("renders an evidence-backed Sold loss without substituting current value", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          currentValueDecimal: null,
          isActiveOwnership: false,
          status: "sold",
          terminalFacts: {
            actionId: "sale-loss-action",
            feeDecimal: "75",
            grossProceedsDecimal: "7925",
            kind: "sold",
            netProceedsDecimal: "7850",
            notes: null,
            proceedsCurrency: "EGP",
            realizedResultCurrency: "EGP",
            realizedResultDecimal: "-650",
            realizedResultUnavailableReason: null,
            terminalDate: "2026-08-23",
          },
          totalGainDecimal: null,
        })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("EGP 650.00 loss from this sale")).toBeTruthy();
    expect(screen.queryByText("Current value")).toBeNull();
    expect(screen.queryByText("How this value was calculated")).toBeNull();
    expect(
      screen.queryByTestId("metal-detail-calculation-disclosure")
    ).toBeNull();
  });

  it("keeps exact sold proceeds visible when realized result evidence is unavailable", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          currentValueDecimal: null,
          isActiveOwnership: false,
          status: "sold",
          terminalFacts: {
            actionId: "sale-action",
            feeDecimal: "0.00",
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
          totalGainDecimal: null,
        })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getAllByText("EGP 10,450.00").length).toBeGreaterThanOrEqual(
      2
    );
    expect(
      screen.getByText("Profit or loss from this sale is unavailable.")
    ).toBeTruthy();
    expect(screen.queryByText("Sale fee")).toBeNull();
  });

  it("renders the approved Disposed hierarchy without inventing sale money", () => {
    const disposedProps = {
      actions: [],
      error: null,
      isLoading: false,
      isOffline: false,
      model: activeDetail({
        currentValueDecimal: null,
        isActiveOwnership: false,
        name: "Family coin",
        status: "disposed",
        terminalFacts: {
          actionId: "dispose-action",
          kind: "disposed",
          notes: "Given to my sister",
          reason: "given_away",
          terminalDate: "2026-08-24",
          treatment: "external_transfer",
        },
        totalGainDecimal: null,
      }),
      onRetry: jest.fn(),
    } as const;
    const { rerender } = render(
      <MetalHoldingDetailScreen {...disposedProps} />
    );

    expect(
      screen.getByText("No longer among your gold and silver.")
    ).toBeTruthy();
    expect(screen.getByText("Holding story")).toBeTruthy();
    expect(screen.getByText("No longer owned")).toBeTruthy();
    expect(screen.getByText("24 Aug 2026")).toBeTruthy();
    expect(screen.getByText("What happened")).toBeTruthy();
    expect(
      screen.getByText(
        "Given away. This holding left your metals. No money was added to your accounts. No profit or loss from a sale."
      )
    ).toBeTruthy();
    expect(screen.getByText("Given away")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.getByText("No change")).toBeTruthy();
    expect(screen.getByText("Given to my sister")).toBeTruthy();
    expect(screen.queryByText("dispose-action")).toBeNull();
    expect(screen.queryByText("Net proceeds")).toBeNull();
    expect(screen.queryByText("Physical facts")).toBeNull();
    expect(screen.getByTestId("metal-disposal-reason")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );

    mockFontScale = 2;
    rerender(<MetalHoldingDetailScreen {...disposedProps} />);
    expect(screen.getByTestId("metal-disposal-reason")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
  });

  it.each([
    ["lost_or_stolen", "write_off", "Lost or stolen"],
    ["destroyed_or_damaged", "write_off", "Destroyed or damaged"],
    ["given_away", "external_transfer", "Given away"],
    ["donated", "external_transfer", "Donated"],
    ["other", "write_off", "Other · Record a loss"],
    ["other", "external_transfer", "Other · Record it as moved out"],
  ] as const)(
    "renders the approved %s disposal reason with %s treatment",
    (reason, treatment, label) => {
      render(
        <MetalHoldingDetailScreen
          actions={[]}
          error={null}
          isLoading={false}
          isOffline={false}
          model={activeDetail({
            currentValueDecimal: null,
            isActiveOwnership: false,
            status: "disposed",
            terminalFacts: {
              actionId: `dispose-${reason}-${treatment}`,
              kind: "disposed",
              notes: null,
              reason,
              terminalDate: "2026-08-24",
              treatment,
            },
            totalGainDecimal: null,
          })}
          onRetry={jest.fn()}
        />
      );

      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("Net proceeds")).toBeNull();
    }
  );

  it("fails closed with friendly terminal copy and preserves responsive reflow", () => {
    const model = activeDetail({
      currentValueDecimal: null,
      isActiveOwnership: false,
      status: "sold",
      terminalFacts: null,
      totalGainDecimal: null,
    });
    const props = {
      actions: [],
      error: null,
      isLoading: false,
      isOffline: false,
      model,
      onRetry: jest.fn(),
    } as const;
    const { rerender } = render(<MetalHoldingDetailScreen {...props} />);

    expect(screen.getByText("Recorded details are unavailable.")).toBeTruthy();
    expect(screen.getByText("Acquired")).toBeTruthy();
    expect(screen.getByText(/151,278.20/)).toBeTruthy();
    expect(screen.queryByText("Net proceeds")).toBeNull();
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
    mockFontScale = 2;
    rerender(<MetalHoldingDetailScreen {...props} />);
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
    expect(screen.getByTestId("metal-holding-detail-name")).not.toHaveProp(
      "numberOfLines"
    );
  });
});
