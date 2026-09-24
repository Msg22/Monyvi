import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

import DeleteMetalHoldingRoute from "../../app/(private)/metals/[holdingId]/delete";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRefreshToken = jest.fn();
const mockExecute = jest.fn();
const mockCreateCommand = jest.fn();
const mockCreateId = jest.fn();

let mockHoldingId: string | undefined = "holding-1";
let mockModel: MetalDetailReadModel | null = null;
let mockIsLoading = false;

interface CapturedSheetProps {
  readonly holding: {
    readonly name: string;
    readonly description: string;
    readonly weightLabel: string;
    readonly currentValueLabel: string;
    readonly performanceLabel: string;
  };
  readonly copy: Record<string, string>;
  readonly visible: boolean;
  readonly isOffline: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

let lastSheetProps: CapturedSheetProps | null = null;

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly holdingId?: string } => ({
    holdingId: mockHoldingId,
  }),
  router: {
    back: (...args: unknown[]): unknown => mockBack(...args),
    replace: (...args: unknown[]): unknown => mockReplace(...args),
  },
}));

jest.mock("@/hooks/useMetalHoldingDetail", () => ({
  useMetalHoldingDetail: (): {
    readonly error: null;
    readonly isLoading: boolean;
    readonly isOffline: boolean;
    readonly model: MetalDetailReadModel | null;
    readonly retry: jest.Mock;
  } => ({
    error: null,
    isLoading: mockIsLoading,
    isOffline: true,
    model: mockModel,
    retry: jest.fn(),
  }),
}));

jest.mock("@/hooks/useDeleteHoldingCommand", () => ({
  useDeleteHoldingCommand: (): {
    readonly input: {
      readonly createCommand: jest.Mock;
      readonly execute: jest.Mock;
      readonly createId: jest.Mock;
    };
    readonly refreshToken: jest.Mock;
  } => ({
    input: {
      createCommand: mockCreateCommand,
      execute: mockExecute,
      createId: mockCreateId,
    },
    refreshToken: mockRefreshToken,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  } => ({ bottom: 24, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
}));

const mockMetalsCopy: Record<string, string> = {
  "actions.delete": "Delete holding",
  "delete.consequence":
    "Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions.",
  "delete.confirm_accessibility": "Delete holding {{holdingName}}",
  "delete.failure": "We couldn't delete this holding. Try again.",
  "delete.offline": "Saved locally first",
  "delete.pending": "Deleting holding…",
  "delete.performance": "Since purchase",
  "detail.current_value": "Current value",
  "detail.not_found": "Holding not found",
  "detail.retry": "Try again",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.value_unavailable": "Value unavailable",
  "form.coin": "Coin",
  "metal.gold": "Gold",
  "purity_gold_999": "24K · 999",
  weight_unit: "g",
};

jest.mock("react-i18next", () => ({
  useTranslation: (
    namespace?: string
  ): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, options?: Record<string, string>) => string;
  } => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, options?: Record<string, string>): string => {
      const template =
        namespace === "common"
          ? ({ cancel: "Cancel" })[key] ?? key
          : (mockMetalsCopy[key] ?? key);
      if (!options) return template;
      return Object.entries(options).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, value),
        template
      );
    },
  }),
}));

jest.mock("@/components/metals/DeleteMetalHoldingSheet", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable: MockPressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DeleteMetalHoldingSheet: (
      props: CapturedSheetProps
    ): React.JSX.Element | null => {
      lastSheetProps = props;
      if (!props.visible) return null;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(MockPressable, {
          testID: "sheet-confirm",
          onPress: props.onConfirm,
        }),
        React.createElement(MockPressable, {
          testID: "sheet-cancel",
          onPress: props.onCancel,
        }),
        React.createElement(MockPressable, {
          testID: "sheet-retry",
          onPress: props.onRetry,
        })
      );
    },
  };
});

function activeModel(): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueCurrency: "EGP",
    currentValueDecimal: "162317.87",
    currentValueObservedAt: new Date(2026, 7, 25, 10, 30),
    currentValueRateStatus: null,
    id: "holding-1",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    itemForm: "coin",
    metalType: "GOLD",
    name: "Wedding coin",
    notes: null,
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.20",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    reconciliationState: "accepted",
    renderKey: "gold:coin",
    requiresCompleteMaterialCorrection: false,
    status: "active",
    terminalFacts: null,
    timeline: [],
    totalGainDecimal: "11039.67",
    unavailableExactFacts: [],
    weightGramsDecimal: "31.125",
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("delete holding route journey", () => {
  beforeEach((): void => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockRefreshToken.mockReset();
    mockRefreshToken.mockResolvedValue(undefined);
    mockExecute.mockReset();
    mockExecute.mockResolvedValue(undefined);
    mockCreateCommand.mockReset();
    mockCreateCommand.mockImplementation((ids: unknown) => ({ ids }));
    mockCreateId.mockReset();
    mockCreateId.mockReturnValue("test-uuid");
    mockHoldingId = "holding-1";
    mockModel = activeModel();
    mockIsLoading = false;
    lastSheetProps = null;
  });

  it("renders the focused Screen 14 confirmation with exact holding facts", () => {
    render(<DeleteMetalHoldingRoute />);

    expect(lastSheetProps?.visible).toBe(true);
    expect(lastSheetProps?.holding).toEqual({
      name: "Wedding coin",
      description: "Gold · 24K · 999 · Coin",
      weightLabel: "31.125 g",
      currentValueLabel: "EGP 162,317.87",
      performanceLabel: "+ EGP 11,039.67 since purchase",
    });
    expect(lastSheetProps?.copy.title).toBe("Delete holding");
    expect(lastSheetProps?.copy.consequence).toBe(
      "Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions."
    );
    expect(lastSheetProps?.copy.accessibilityLabel).toBe(
      "Delete holding Wedding coin"
    );
    expect(lastSheetProps?.isOffline).toBe(true);
    expect(lastSheetProps?.copy.offline).toBe("Saved locally first");
  });

  it("confirms once and returns to the portfolio on local success", async () => {
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/metals"));
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockCreateCommand).toHaveBeenCalledTimes(1);
  });

  it("locks the confirmation while the local action is pending", async () => {
    const pending = deferred<void>();
    mockExecute.mockReturnValue(pending.promise);
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));

    await waitFor(() => expect(lastSheetProps?.isSubmitting).toBe(true));
    expect(mockReplace).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/metals"));
  });

  it("keeps exact facts visible on failure and retries the same command", async () => {
    mockExecute.mockRejectedValueOnce(new Error("local_write_failed"));
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));
    await waitFor(() => expect(lastSheetProps?.submitError).not.toBeNull());
    expect(lastSheetProps?.holding.name).toBe("Wedding coin");
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("sheet-retry"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/metals"));
    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const executeCalls = mockExecute.mock.calls as Array<
      readonly [Record<string, unknown>]
    >;
    expect(executeCalls[1][0]).toBe(executeCalls[0][0]);
  });

  it("returns to the holding detail without writing when cancelled", () => {
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-cancel"));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("shows the approved not-found state when the holding is gone", () => {
    mockModel = null;

    render(<DeleteMetalHoldingRoute />);

    expect(screen.getByText("Holding not found")).toBeTruthy();
    expect(lastSheetProps).toBeNull();
  });

  it("renders nothing without a holding identity", () => {
    mockHoldingId = undefined;

    const { toJSON } = render(<DeleteMetalHoldingRoute />);

    expect(toJSON()).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
