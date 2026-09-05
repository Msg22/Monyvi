import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      title,
      showBackButton,
      onBack,
      backAccessibilityLabel,
    }: {
      readonly title: string;
      readonly showBackButton?: boolean;
      readonly onBack?: () => void;
      readonly backAccessibilityLabel?: string;
    }) => (
      <View>
        <Text>{title}</Text>
        {showBackButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            testID="header-back"
            onPress={onBack}
          />
        ) : null}
      </View>
    ),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: () => 0,
}));

interface SellMetalHoldingValues {
  readonly saleDate: string;
  readonly grossProceedsDecimal: string;
  readonly saleCurrency: string;
  readonly feeDecimal: string;
  readonly notes: string;
}

type SellMetalHoldingField = keyof SellMetalHoldingValues;

interface SellMetalHoldingScreenCopy {
  readonly title: string;
  readonly back: string;
  readonly wholeHoldingTitle: string;
  readonly wholeHoldingBody: string;
  readonly saleDate: string;
  readonly grossProceeds: string;
  readonly grossProceedsHint: string;
  readonly saleCurrency: string;
  readonly fee: string;
  readonly feeHint: string;
  readonly notes: string;
  readonly notesHint: string;
  readonly netProceeds: string;
  readonly accountCredit: string;
  readonly accountCreditUnavailable: string;
  readonly whatHappensTitle: string;
  readonly soldBullet: string;
  readonly noAccountBullet: string;
  readonly resultBullet: string;
  readonly historyBullet: string;
  readonly recordSale: string;
  readonly recordingSale: string;
  readonly cancel: string;
  readonly retry: string;
  readonly offline: string;
  readonly rateWarning: string;
  readonly acknowledgeRateRisk: string;
}

interface SellMetalHoldingScreenProps {
  readonly holding: {
    readonly name: string;
    readonly description: string;
    readonly weightLabel: string;
  };
  readonly values: SellMetalHoldingValues;
  readonly preview: {
    readonly netProceedsLabel: string | null;
    readonly realizedResultLabel: string | null;
    readonly validationErrors: Readonly<Record<string, string>>;
    readonly requiresRateAcknowledgment: boolean;
    readonly canSubmit: boolean;
  };
  readonly copy: SellMetalHoldingScreenCopy;
  readonly currencyOptions: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
  }>;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly isRtl: boolean;
  readonly isOffline: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onChange: (field: SellMetalHoldingField, value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onRequestExit: () => void;
  readonly onAcknowledgeRateRisk: () => void;
}

interface SellMetalHoldingScreenModule {
  readonly SellMetalHoldingScreen: React.ComponentType<SellMetalHoldingScreenProps>;
}

interface SellActionModule {
  readonly createSellHoldingActionDescriptor: (holdingId: string) => {
    readonly id: "sell";
    readonly labelKey: "actions.sell";
    readonly tone: "primary";
    readonly href: {
      readonly pathname: "/(private)/metals/[holdingId]/sell";
      readonly params: { readonly holdingId: string };
    };
  };
}

const copy: SellMetalHoldingScreenCopy = {
  title: "Sell holding",
  back: "Back",
  wholeHoldingTitle: "Selling the whole holding",
  wholeHoldingBody:
    "This records a sale for the full holding. Partial sales are not available yet.",
  saleDate: "Sale date",
  grossProceeds: "Sale amount before fee",
  grossProceedsHint: "Enter the total amount you received before any sale fee.",
  saleCurrency: "Sale currency",
  fee: "Sale fee (optional)",
  feeHint: "Leave this empty if there was no fee.",
  notes: "Notes (optional)",
  notesHint: "Add anything you want to remember about this sale.",
  netProceeds: "Net proceeds",
  accountCredit: "Add proceeds to an account",
  accountCreditUnavailable: "Coming in a later update",
  whatHappensTitle: "What will happen",
  soldBullet: "This holding moves to Sold.",
  noAccountBullet: "No account balance or income entry will be created.",
  resultBullet: "The realized result is saved with the sale.",
  historyBullet: "The sale remains available in History.",
  recordSale: "Record sale",
  recordingSale: "Recording sale…",
  cancel: "Cancel",
  retry: "Try again",
  offline: "Saved locally first",
  rateWarning: "One or more sale rates may be stale.",
  acknowledgeRateRisk: "Use these rates anyway",
};

const values: SellMetalHoldingValues = {
  saleDate: "2026-08-27",
  grossProceedsDecimal: "170000",
  saleCurrency: "EGP",
  feeDecimal: "500",
  notes: "Sold to trusted jeweller",
};

function loadScreen(): SellMetalHoldingScreenModule {
  return jest.requireActual<SellMetalHoldingScreenModule>(
    "../../components/metals/SellMetalHoldingScreen"
  );
}

function loadAction(): SellActionModule {
  return jest.requireActual<SellActionModule>(
    "../../components/metals/holding-actions/sell-action"
  );
}

function renderScreen(
  overrides: Partial<SellMetalHoldingScreenProps> = {}
): SellMetalHoldingScreenProps {
  const props: SellMetalHoldingScreenProps = {
    holding: {
      name: "Wedding coin",
      description: "Gold · 24K · Coin",
      weightLabel: "31.125 g",
    },
    values,
    preview: {
      netProceedsLabel: "EGP 169,500.00",
      realizedResultLabel: "+ EGP 18,221.80 profit",
      validationErrors: {},
      requiresRateAcknowledgment: false,
      canSubmit: true,
    },
    copy,
    currencyOptions: [{ label: "EGP", value: "EGP" }],
    width: 390,
    fontScale: 1,
    bottomInset: 24,
    isRtl: false,
    isOffline: true,
    isSubmitting: false,
    submitError: null,
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onRetry: jest.fn(),
    onRequestExit: jest.fn(),
    onAcknowledgeRateRisk: jest.fn(),
    ...overrides,
  };
  const SellMetalHoldingScreen = loadScreen().SellMetalHoldingScreen;
  render(<SellMetalHoldingScreen {...props} />);
  return props;
}

describe("SellMetalHoldingScreen approved direct-sale experience", () => {
  it("renders whole-holding-only inputs, exact live result, disabled credit, and local-first consequences", () => {
    renderScreen();

    expect(screen.getByTestId("metal-holding-sell-screen")).toBeTruthy();
    expect(screen.getByText("Wedding coin")).toBeTruthy();
    expect(screen.getByText("Gold · 24K · Coin")).toBeTruthy();
    expect(screen.getByText("31.125 g")).toBeTruthy();
    expect(screen.getByText(copy.wholeHoldingBody)).toBeTruthy();
    expect(
      screen.queryByTestId("metal-holding-sell-quantity-field")
    ).toBeNull();
    expect(screen.getByLabelText(copy.saleDate)).toBeTruthy();
    expect(screen.getByLabelText(copy.grossProceeds)).toBeTruthy();
    expect(screen.getByLabelText(copy.fee)).toBeTruthy();
    expect(screen.getByText("EGP 169,500.00")).toBeTruthy();
    expect(screen.getByText("+ EGP 18,221.80 profit")).toBeTruthy();
    expect(screen.getByText(copy.noAccountBullet)).toBeTruthy();
    expect(screen.getByText(copy.historyBullet)).toBeTruthy();
    expect(screen.getByText(copy.offline)).toBeTruthy();

    expect(screen.getByTestId("metal-holding-sell-account-credit")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByText(copy.accountCreditUnavailable)).toBeTruthy();
  });

  it("updates the live preview inputs and records directly without a confirmation screen", () => {
    const props = renderScreen();

    fireEvent.changeText(screen.getByLabelText(copy.grossProceeds), "175000");
    fireEvent.changeText(screen.getByLabelText(copy.fee), "750");
    expect(props.onChange).toHaveBeenNthCalledWith(
      1,
      "grossProceedsDecimal",
      "175000"
    );
    expect(props.onChange).toHaveBeenNthCalledWith(2, "feeDecimal", "750");

    fireEvent.press(screen.getByRole("button", { name: copy.recordSale }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("metal-holding-sell-confirmation")).toBeNull();
  });

  it("exposes field errors, rate acknowledgment, and retry accessibly", () => {
    const props = renderScreen({
      preview: {
        netProceedsLabel: null,
        realizedResultLabel: null,
        validationErrors: {
          grossProceedsDecimal: "Enter an amount greater than 0.",
        },
        requiresRateAcknowledgment: true,
        canSubmit: false,
      },
      submitError: "The sale was not recorded. Try again.",
    });

    expect(screen.getByText("Enter an amount greater than 0.")).toHaveProp(
      "accessibilityRole",
      "alert"
    );
    expect(screen.getByText(copy.rateWarning)).toBeTruthy();
    fireEvent.press(
      screen.getByRole("checkbox", { name: copy.acknowledgeRateRisk })
    );
    expect(props.onAcknowledgeRateRisk).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: copy.recordSale })
    ).toBeDisabled();
    fireEvent.press(screen.getByRole("button", { name: copy.retry }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("locks inputs and dismissal while the direct local commit is pending", () => {
    renderScreen({ isSubmitting: true });

    expect(
      screen.getByRole("button", { name: copy.recordingSale })
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: copy.back })).toBeNull();
    expect(screen.getByLabelText(copy.grossProceeds)).toBeDisabled();
  });

  it.each([
    [390, 1, false, "flex-row"],
    [320, 1, false, "gap-3"],
    [768, 1.5, true, "gap-3"],
  ] as const)(
    "uses the shared responsive rule at %ipx/%sx RTL=%s",
    (width, fontScale, isRtl, expectedLayout) => {
      renderScreen({ width, fontScale, isRtl });
      expect(screen.getByTestId("metal-holding-sell-field-row")).toHaveProp(
        "className",
        expect.stringContaining(expectedLayout)
      );
      expect(screen.getByTestId("metal-holding-sell-content")).toHaveStyle({
        direction: isRtl ? "rtl" : "ltr",
      });
    }
  );

  it("adds the device bottom inset to the anchored action area", () => {
    renderScreen({ bottomInset: 34 });
    expect(screen.getByTestId("metal-holding-sell-actions")).toHaveStyle({
      paddingBottom: 54,
    });
  });
});

describe("Sell holding isolated action descriptor", () => {
  it("targets only the holding-scoped Sell route with the existing label key", () => {
    const descriptor =
      loadAction().createSellHoldingActionDescriptor("holding-gold-coin");
    expect(descriptor).toEqual({
      id: "sell",
      labelKey: "actions.sell",
      tone: "primary",
      href: {
        pathname: "/(private)/metals/[holdingId]/sell",
        params: { holdingId: "holding-gold-coin" },
      },
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it("rejects a missing holding identity at the route boundary", () => {
    expect(() => loadAction().createSellHoldingActionDescriptor(" ")).toThrow(
      "metal_holding_id_required"
    );
  });
});
