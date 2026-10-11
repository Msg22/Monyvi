import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import MetalHoldingDetailRoute from "@/app/(private)/metals/[id]";
import type {
  HoldingActionDescriptor,
  HoldingActionId,
} from "@/components/metals/holding-actions/registry";
import type { UseUndoMetalHoldingResult } from "@/hooks/useUndoMetalHolding";

let mockModel: Record<string, unknown> = {
  id: "holding-1",
  name: "21K bracelet",
  metalType: "GOLD",
  itemForm: "jewelry",
  purityCatalogVersion: "1",
  purityCode: "gold-875",
  purityFactorDecimal: "0.875",
  status: "disposed",
  isActiveOwnership: false,
  isFinancialActionLocked: false,
  timeline: [],
};
let mockUserId: string | null = "user-1";
let mockContext: Record<string, unknown> | null = {
  holdingId: "holding-1",
  userId: "user-1",
  terminalKind: "dispose",
  terminalEventId: "dispose-1",
  expectedFinancialRevision: "1",
};
let mockContextError: Error | null = null;
const mockSubmit = jest.fn<Promise<boolean>, []>();
const mockRetry = jest.fn<Promise<boolean>, []>();
const mockToast = jest.fn();
const mockDismissTo = jest.fn();
const mockUseSubmission = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    dismissTo: (...args: unknown[]): unknown => mockDismissTo(...args),
  },
  useLocalSearchParams: () => ({ id: "holding-1" }),
  useFocusEffect: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { holdingName?: string }): string =>
      options?.holdingName ? `${key}:${options.holdingName}` : key,
    i18n: { resolvedLanguage: "en", dir: (): string => "ltr" },
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useMetalHoldingDetail", () => ({
  useMetalHoldingDetail: () => ({
    model: mockModel,
    isLoading: false,
    isOffline: true,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock("@/hooks/useUndoMetalHoldingContext", () => ({
  useUndoMetalHoldingContext: () => ({
    context: mockContext,
    userId: mockUserId,
    isResolvingUser: false,
    isLoading: false,
    error: mockContextError,
    retry: jest.fn(),
  }),
}));
jest.mock("@/hooks/useRestoreMetalHolding", () => ({
  useRestoreMetalHolding: (context: unknown): UseUndoMetalHoldingResult => {
    mockUseSubmission(context);
    return {
      submit: mockSubmit,
      retry: mockRetry,
      isSubmitting: false,
      isCompleted: false,
      error: null,
    };
  },
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      title,
      onBack,
    }: {
      readonly title: string;
      readonly onBack?: () => void;
    }): React.JSX.Element => (
      <Pressable testID={`header-${title}`} onPress={onBack}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/metals/MetalHoldingRender", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingRender: (): React.JSX.Element => (
      <View testID="real-holding-visual" />
    ),
  };
});
jest.mock("@/components/metals/RestoreMetalHoldingSheet", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    RestoreMetalHoldingSheet: (props: {
      readonly summary: { readonly body: string };
      readonly holdingVisual: React.ReactNode;
      readonly bottomInset: number;
      readonly onConfirm: () => void;
      readonly onRetry: () => void;
      readonly onCancel: () => void;
    }): React.JSX.Element => (
      <View testID="restore-holding-modal">
        <Text>{props.summary.body}</Text>
        {props.holdingVisual}
        <Text>{`bottom:${props.bottomInset}`}</Text>
        <Pressable testID="restore-holding-confirm" onPress={props.onConfirm} />
        <Pressable testID="restore-holding-retry" onPress={props.onRetry} />
        <Pressable testID="restore-holding-cancel" onPress={props.onCancel} />
      </View>
    ),
  };
});
jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: ({
      actions,
      onAction,
    }: {
      readonly actions: readonly HoldingActionDescriptor[];
      readonly onAction?: (id: HoldingActionId) => void;
    }): React.JSX.Element => (
      <View>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            testID={`detail-action-${action.id}`}
            onPress={(): void => onAction?.(action.id)}
          />
        ))}
      </View>
    ),
  };
});

beforeEach((): void => {
  jest.clearAllMocks();
  mockUserId = "user-1";
  mockContext = {
    holdingId: "holding-1",
    userId: "user-1",
    terminalKind: "dispose",
    terminalEventId: "dispose-1",
    expectedFinancialRevision: "1",
  };
  mockContextError = null;
  mockModel = {
    ...mockModel,
    status: "disposed",
    isActiveOwnership: false,
    isFinancialActionLocked: false,
  };
  mockSubmit.mockResolvedValue(true);
  mockRetry.mockResolvedValue(true);
});

describe("reachable Details Restore", (): void => {
  it.each(["sell", "dispose"] as const)(
    "opens %s Restore composition with owned current token and safe inset",
    (terminalKind): void => {
      mockContext = { ...mockContext, terminalKind };
      mockModel = {
        ...mockModel,
        status: terminalKind === "sell" ? "sold" : "disposed",
      };
      render(<MetalHoldingDetailRoute />);
      fireEvent.press(screen.getByTestId("detail-action-undo"));
      expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();
      expect(screen.getByTestId("real-holding-visual")).toBeTruthy();
      expect(screen.getByText("bottom:34")).toBeTruthy();
      expect(
        screen.getByText(
          terminalKind === "sell"
            ? "restore.sale_body"
            : "restore.disposal_body"
        )
      ).toBeTruthy();
      expect(mockUseSubmission).toHaveBeenCalledWith(mockContext);
      fireEvent.press(screen.getByTestId("restore-holding-cancel"));
      expect(mockSubmit).not.toHaveBeenCalled();
      expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    }
  );

  it("completes in the existing Details route without pushing a duplicate and Back returns My Metals", async (): Promise<void> => {
    render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("restore-holding-confirm"));
      await Promise.resolve();
    });
    expect(mockToast).toHaveBeenCalledWith({
      type: "success",
      title: "restore.success",
    });
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    fireEvent.press(screen.getByTestId("header-detail.disposed_title"));
    expect(mockDismissTo).toHaveBeenCalledWith("/metals");
  });

  it("preserves confirmation after failure and calls retry", async (): Promise<void> => {
    mockSubmit.mockResolvedValue(false);
    render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("restore-holding-confirm"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();
    await act(async (): Promise<void> => {
      fireEvent.press(screen.getByTestId("restore-holding-retry"));
      await Promise.resolve();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("does not offer Restore for credited/incomplete or unscoped terminal data", (): void => {
    mockContext = null;
    mockContextError = new Error("metal_undo_credited_sale_blocked");
    render(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("detail-action-undo")).toBeNull();
  });

  it("closes stale private confirmation after user identity changes", (): void => {
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    mockUserId = "user-2";
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
