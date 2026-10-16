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
let mockContextIsLoading = false;
const mockDetailRetry = jest.fn();
const mockRecoveryAfterSync = jest.fn();
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
    retry: mockDetailRetry,
  }),
}));
jest.mock("@/hooks/useUndoMetalHoldingContext", () => ({
  useUndoMetalHoldingContext: () => ({
    context: mockContext,
    userId: mockUserId,
    isResolvingUser: false,
    isLoading: mockContextIsLoading,
    error: mockContextError,
    retry: jest.fn(),
    retryAfterSync: mockRecoveryAfterSync,
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
      readonly visible: boolean;
      readonly isPending: boolean;
      readonly onConfirm: () => void;
      readonly onRetry: () => void;
      readonly onCancel: () => void;
    }): React.JSX.Element | null =>
      props.visible ? (
        <View testID="restore-holding-modal">
          <Text>{props.summary.body}</Text>
          {props.holdingVisual}
          <Text>{`bottom:${props.bottomInset}`}</Text>
          <Pressable
            testID="restore-holding-confirm"
            accessibilityRole="button"
            accessibilityState={{
              disabled: props.isPending,
              busy: props.isPending,
            }}
            disabled={props.isPending}
            onPress={props.isPending ? undefined : props.onConfirm}
          />
          <Pressable
            testID="restore-holding-retry"
            accessibilityRole="button"
            accessibilityState={{ disabled: props.isPending }}
            disabled={props.isPending}
            onPress={props.isPending ? undefined : props.onRetry}
          />
          <Pressable
            testID="restore-holding-cancel"
            accessibilityRole="button"
            accessibilityState={{ disabled: props.isPending }}
            disabled={props.isPending}
            onPress={props.isPending ? undefined : props.onCancel}
          />
        </View>
      ) : null,
  };
});
jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const { Pressable, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: ({
      actions,
      isActionLoading,
      onAction,
    }: {
      readonly actions: readonly HoldingActionDescriptor[];
      readonly isActionLoading?: boolean;
      readonly onAction?: (id: HoldingActionId) => void;
    }): React.JSX.Element => (
      <View testID="loaded-detail-content">
        {isActionLoading ? <View testID="restore-action-loading" /> : null}
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

function expectRestorePendingActionsBlocked(): void {
  expect(screen.getByTestId("restore-holding-confirm")).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ disabled: true, busy: true })
  );

  for (const testID of [
    "restore-holding-confirm",
    "restore-holding-retry",
    "restore-holding-cancel",
  ]) {
    expect(screen.getByTestId(testID)).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(screen.getByTestId(testID));
  }

  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(mockRetry).not.toHaveBeenCalled();
  expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();
}

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
  mockContextIsLoading = false;
  mockModel = {
    ...mockModel,
    status: "disposed",
    isActiveOwnership: false,
    isFinancialActionLocked: false,
    timeline: [],
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

  it("invalidates an open Restore when Detail terminal identity changes before eligibility rereads", (): void => {
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();

    mockModel = {
      ...mockModel,
      timeline: [{ id: "dispose-2", kind: "dispose" }],
    };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();

    mockModel = { ...mockModel, timeline: [] };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
  });

  it("revokes an open Restore when the same holding gets another terminal action and never resurrects it", (): void => {
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();
    const originalContext = mockContext;

    mockContext = {
      ...mockContext,
      terminalEventId: "dispose-2",
      expectedFinancialRevision: "2",
    };
    mockModel = {
      ...mockModel,
      timeline: [{ id: "dispose-2", kind: "dispose" }],
    };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();

    mockContext = originalContext;
    mockModel = { ...mockModel, timeline: [] };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("revokes a same-terminal Restore when its financial revision changes, without reopening on a reverted token", (): void => {
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();
    const originalContext = mockContext;

    mockContext = { ...mockContext, expectedFinancialRevision: "2" };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();

    mockContext = originalContext;
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("closes the old Restore after reconciliation locks actions, without reopening on unlock", (): void => {
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();

    mockModel = { ...mockModel, isFinancialActionLocked: true };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();

    mockModel = { ...mockModel, isFinancialActionLocked: false };
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(screen.getByTestId("detail-action-undo")).toBeTruthy();
  });

  it("keeps an already submitted Restore pending through local Active projection until its success toast", async (): Promise<void> => {
    let resolveSubmit: (succeeded: boolean) => void = (): void => {
      throw new Error("missing_submit_resolver");
    };
    mockSubmit.mockImplementationOnce(
      (): Promise<boolean> =>
        new Promise<boolean>((resolve): void => {
          resolveSubmit = resolve;
        })
    );
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    fireEvent.press(screen.getByTestId("restore-holding-confirm"));
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    mockModel = { ...mockModel, status: "active", isActiveOwnership: true };
    mockContext = null;
    rerender(<MetalHoldingDetailRoute />);
    expect(screen.getByTestId("restore-holding-modal")).toBeTruthy();
    expectRestorePendingActionsBlocked();

    await act(async (): Promise<void> => {
      resolveSubmit(true);
      await Promise.resolve();
    });
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      type: "success",
      title: "restore.success",
    });
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
  });

  it("does not reactivate a stale pending Restore even if its terminal token returns after failure", async (): Promise<void> => {
    let resolveSubmit: (succeeded: boolean) => void = (): void => {
      throw new Error("missing_submit_resolver");
    };
    mockSubmit.mockImplementationOnce(
      (): Promise<boolean> =>
        new Promise<boolean>((resolve): void => {
          resolveSubmit = resolve;
        })
    );
    const { rerender } = render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByTestId("detail-action-undo"));
    fireEvent.press(screen.getByTestId("restore-holding-confirm"));
    const originalContext = mockContext;
    mockContext = {
      ...mockContext,
      terminalEventId: "dispose-2",
      expectedFinancialRevision: "2",
    };
    mockModel = {
      ...mockModel,
      timeline: [{ id: "dispose-2", kind: "dispose" }],
    };
    rerender(<MetalHoldingDetailRoute />);
    expectRestorePendingActionsBlocked();

    mockContext = originalContext;
    mockModel = { ...mockModel, timeline: [] };
    rerender(<MetalHoldingDetailRoute />);
    expectRestorePendingActionsBlocked();

    await act(async (): Promise<void> => {
      resolveSubmit(false);
      await Promise.resolve();
    });
    expect(screen.queryByTestId("restore-holding-modal")).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it("reserves Restore action space while terminal eligibility loads without hiding loaded Details", (): void => {
    mockContext = null;
    mockContextIsLoading = true;
    render(<MetalHoldingDetailRoute />);

    expect(screen.getByTestId("loaded-detail-content")).toBeTruthy();
    expect(screen.getByTestId("restore-action-loading")).toBeTruthy();
    expect(screen.queryByTestId("detail-action-undo")).toBeNull();
  });

  it("requests existing Detail synchronization before waiting to reread missing Restore evidence", (): void => {
    mockContext = null;
    mockContextError = new Error("missing_terminal_evidence");
    render(<MetalHoldingDetailRoute />);
    fireEvent.press(screen.getByText("detail.retry"));

    expect(mockDetailRetry).toHaveBeenCalledTimes(1);
    expect(mockRecoveryAfterSync).toHaveBeenCalledTimes(1);
    expect(mockDetailRetry.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecoveryAfterSync.mock.invocationCallOrder[0]
    );
  });
});
