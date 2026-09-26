import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

import DeleteMetalHoldingRoute from "../../app/(private)/metals/[holdingId]/delete";

const mockBack = jest.fn();
const mockDismissTo = jest.fn();
const mockEnsureToken = jest.fn();
const mockExecute = jest.fn();
const mockCreateCommand = jest.fn();
const mockCreateId = jest.fn();
const mockDetailRetry = jest.fn();
const mockShowToast = jest.fn();

let mockHoldingId: string | undefined = "holding-1";
let mockModel: MetalDetailReadModel | null = null;
let mockIsLoading = false;
let mockDetailError: Error | null = null;
let mockIdCounter = 0;
let mockTokenAvailable = true;
let mockTopInset = 0;

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
  readonly rateWarnings: readonly {
    readonly id: string;
    readonly acknowledgment: string;
  }[];
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
    dismissTo: (...args: unknown[]): unknown => mockDismissTo(...args),
  },
}));

// The route renders the real submission hook, which shares the
// revision-conflict code with the command service. Stub the native-backed
// user-data-access chain so the real service module loads without Supabase
// environment variables; the journey never executes the service itself.
jest.mock("@/services/user-data-access", () => ({
  findOwnedById: jest.fn(),
  queryChildrenOfOwnedParent: jest.fn(),
}));

jest.mock("@/hooks/useMetalHoldingDetail", () => ({
  useMetalHoldingDetail: (): {
    readonly error: Error | null;
    readonly isLoading: boolean;
    readonly isOffline: boolean;
    readonly model: MetalDetailReadModel | null;
    readonly retry: jest.Mock;
  } => ({
    error: mockDetailError,
    isLoading: mockIsLoading,
    isOffline: true,
    model: mockModel,
    retry: mockDetailRetry,
  }),
}));

jest.mock("@/hooks/useDeleteHoldingCommand", () => ({
  useDeleteHoldingCommand: (): {
    readonly input: {
      readonly createCommand: jest.Mock;
      readonly execute: jest.Mock;
      readonly createId: jest.Mock;
    };
    readonly ensureToken: jest.Mock;
  } => ({
    input: {
      createCommand: mockCreateCommand,
      execute: mockExecute,
      createId: mockCreateId,
    },
    ensureToken: mockEnsureToken,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  } => ({ bottom: 24, left: 0, right: 0, top: mockTopInset }),
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
  "delete.success": "Holding deleted.",
  "delete.checking_changes": "Checking changes",
  "delete.checking_changes_body":
    "This holding changed on another device. We’re checking the holding and account before showing the final result.",
  "delete.performance": "Since purchase",
  "delete.terminal_unavailable":
    "To correct this terminal action, undo it first.",
  "detail.current_value": "Current value",
  "detail.load_error": "We couldn't load this holding.",
  "detail.not_found": "Holding not found",
  "detail.retry": "Try again",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.value_unavailable": "Value unavailable",
  "form.coin": "Coin",
  "metal.gold": "Gold",
  purity_gold_999: "24K · 999",
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
          ? ({ cancel: "Cancel" }[key] ?? key)
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

function terminalModel(status: "sold" | "disposed"): MetalDetailReadModel {
  return {
    ...activeModel(),
    isActiveOwnership: false,
    isFinancialActionLocked: false,
    status,
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
    mockDismissTo.mockClear();
    mockEnsureToken.mockReset();
    mockTokenAvailable = true;
    mockEnsureToken.mockImplementation(() =>
      Promise.resolve(
        mockTokenAvailable
          ? {
              expectedFinancialRevision: "1",
              predecessorEventId: "event-correction",
            }
          : null
      )
    );
    mockExecute.mockReset();
    mockExecute.mockResolvedValue(undefined);
    mockCreateCommand.mockReset();
    mockCreateCommand.mockImplementation((ids: unknown) => {
      if (!mockTokenAvailable) throw new Error("metal_delete_unavailable");
      return { ids };
    });
    mockCreateId.mockReset();
    mockIdCounter = 0;
    mockCreateId.mockImplementation(() => {
      mockIdCounter += 1;
      return `test-uuid-${mockIdCounter}`;
    });
    mockDetailRetry.mockClear();
    mockShowToast.mockClear();
    mockHoldingId = "holding-1";
    mockModel = activeModel();
    mockIsLoading = false;
    mockDetailError = null;
    mockTopInset = 0;
    lastSheetProps = null;
  });

  it("keeps the loading skeleton below the top safe area", () => {
    mockIsLoading = true;
    mockModel = null;
    mockTopInset = 24;

    render(<DeleteMetalHoldingRoute />);

    expect(screen.getByTestId("metal-delete-loading")).toHaveStyle({
      paddingTop: 36,
    });
  });

  it("renders the focused Screen 14 confirmation with exact holding facts", () => {
    render(<DeleteMetalHoldingRoute />);

    expect(lastSheetProps?.visible).toBe(true);
    expect(lastSheetProps?.holding).toEqual({
      name: "Wedding coin",
      description: "Gold · 24K · 999 · Coin",
      weightLabel: "31.125 g",
      currentValueLabel: "EGP 162,317.87",
      performanceLabel: "+ EGP 11,039.67",
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

  it("passes stale and unknown input warnings into the live Delete confirmation", () => {
    mockModel = {
      ...activeModel(),
      currentValueRateInputs: [
        {
          id: "metal:GOLD",
          state: "stale",
          ageMs: 172800000,
          providerObservedAt: null,
          source: "Metal provider",
          quality: "valid",
        },
        {
          id: "currency:EGP",
          state: "unknown",
          ageMs: null,
          providerObservedAt: null,
          source: "FX provider",
          quality: null,
        },
      ],
    };

    render(<DeleteMetalHoldingRoute />);

    expect(lastSheetProps?.rateWarnings).toMatchObject([
      { id: "metal:GOLD" },
      { id: "currency:EGP" },
    ]);
  });

  it("confirms once and dismisses to the existing portfolio on local success", async () => {
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/metals"));
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockCreateCommand).toHaveBeenCalledTimes(1);
    expect(mockEnsureToken).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      type: "success",
      title: "Holding deleted.",
    });
  });

  it("locks a reconciliation-incomplete active holding and offers recovery", () => {
    mockModel = {
      ...activeModel(),
      isFinancialActionLocked: true,
      reconciliationState: "reconciliation_incomplete",
    };
    render(<DeleteMetalHoldingRoute />);

    expect(screen.getByText("Checking changes")).toBeTruthy();
    expect(lastSheetProps).toBeNull();
    fireEvent.press(screen.getByTestId("metal-holding-delete-sync-retry"));
    expect(mockDetailRetry).toHaveBeenCalledTimes(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("locks the confirmation while the local action is pending", async () => {
    const pending = deferred<void>();
    mockExecute.mockReturnValue(pending.promise);
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));

    await waitFor(() => expect(lastSheetProps?.isSubmitting).toBe(true));
    expect(mockDismissTo).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/metals"));
  });

  it("keeps exact facts visible on failure and retries the same command", async () => {
    mockExecute.mockRejectedValueOnce(new Error("local_write_failed"));
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));
    await waitFor(() => expect(lastSheetProps?.submitError).not.toBeNull());
    expect(lastSheetProps?.holding.name).toBe("Wedding coin");
    expect(mockDismissTo).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("sheet-retry"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/metals"));
    expect(mockEnsureToken).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const executeCalls = mockExecute.mock.calls as Array<
      readonly [Record<string, unknown>]
    >;
    expect(executeCalls[1][0]).toBe(executeCalls[0][0]);
  });

  it("recovers from a revision conflict with a fresh command identity", async () => {
    mockExecute.mockRejectedValueOnce(new Error("holding_revision_conflict"));
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));
    await waitFor(() => expect(lastSheetProps?.submitError).not.toBeNull());
    expect(mockDismissTo).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("sheet-retry"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/metals"));
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const executeCalls = mockExecute.mock.calls as Array<
      readonly [Record<string, unknown>]
    >;
    expect(executeCalls[1][0]).not.toBe(executeCalls[0][0]);
    expect(mockCreateCommand).toHaveBeenCalledTimes(2);
    expect(mockCreateId).toHaveBeenCalledTimes(2);
  });

  it("surfaces a token-load failure on confirm and recovers on retry", async () => {
    mockTokenAvailable = false;
    render(<DeleteMetalHoldingRoute />);

    fireEvent.press(screen.getByTestId("sheet-confirm"));
    await waitFor(() => expect(lastSheetProps?.submitError).not.toBeNull());
    expect(lastSheetProps?.holding.name).toBe("Wedding coin");
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();

    mockTokenAvailable = true;
    fireEvent.press(screen.getByTestId("sheet-retry"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/metals"));
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it.each(["sold", "disposed"] as const)(
    "gates a deep-linked %s holding with the undo-first explanation",
    (status) => {
      mockModel = terminalModel(status);

      render(<DeleteMetalHoldingRoute />);

      expect(
        screen.getByText("To correct this terminal action, undo it first.")
      ).toBeTruthy();
      expect(lastSheetProps).toBeNull();
      expect(mockExecute).not.toHaveBeenCalled();
    }
  );

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

  it("offers an explicit retry when the holding fails to load", () => {
    mockModel = null;
    mockDetailError = new Error("holding_detail_unavailable");

    render(<DeleteMetalHoldingRoute />);

    expect(screen.getByText("We couldn't load this holding.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("metal-holding-delete-load-retry"));
    expect(mockDetailRetry).toHaveBeenCalledTimes(1);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("renders nothing without a holding identity", () => {
    mockHoldingId = undefined;

    const { toJSON } = render(<DeleteMetalHoldingRoute />);

    expect(toJSON()).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
