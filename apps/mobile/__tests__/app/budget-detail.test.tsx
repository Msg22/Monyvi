import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const mockReact = React;

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockShowToast = jest.fn();
const mockRetry = jest.fn();
const mockExecute = jest.fn();
let mockPendingAction: "pause" | "resume" | "delete" | null = null;
let mockDetail: Record<string, unknown>;
let mockSearchParams: { id?: string } = { id: "budget-1" };
let mockConfirmationHandler: (() => void) | null = null;

const mockReadModel = {
  identity: {
    budgetId: "budget-1",
    name: "Food & Drinks",
    type: "CATEGORY",
    lifecycle: "ACTIVE",
    period: "MONTHLY",
    periodStart: new Date(2026, 7, 1),
    periodEnd: new Date(2026, 7, 31),
    icon: { kind: "DELETED_CATEGORY" },
    availableLifecycleAction: "PAUSE",
  },
  currency: "EGP",
  metrics: {
    spent: 1750,
    limit: 5000,
    remaining: 3250,
    percentage: 35,
    dailyAverage: 135,
    status: "safe",
  },
  daysLeft: 18,
  daysElapsed: 13,
  paceState: "BELOW",
  weeklySpending: [],
  categoryBreakdown: [],
  recentTransactions: [
    {
      transactionId: "tx-1",
      label: "Carrefour",
      date: new Date(2026, 7, 8),
      amount: 450,
      currency: "EGP",
      icon: { kind: "TRANSACTION_FALLBACK" },
    },
  ],
  hasCompletedPauseExclusion: true,
};

jest.mock("expo-router", () => ({
  router: {
    push: (...args: readonly unknown[]): void => {
      mockRouterPush(...args);
    },
    back: (): void => {
      mockRouterBack();
    },
  },
  useLocalSearchParams: (): { readonly id?: string } => mockSearchParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } => ({
    top: 0,
    right: 0,
    bottom: 34,
    left: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { showToast: jest.Mock } => ({ showToast: mockShowToast }),
}));

jest.mock("@/hooks/useBudgetDetail", () => ({
  useBudgetDetail: (): Record<string, unknown> => mockDetail,
}));

jest.mock("@/hooks/useBudgetDetailActions", () => ({
  useBudgetDetailActions: (): Record<string, unknown> => ({
    pendingAction: mockPendingAction,
    errorKey: null,
    execute: (...args: readonly unknown[]): Promise<unknown> =>
      mockExecute(...args) as Promise<unknown>,
    clearError: jest.fn(),
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      title,
      rightAction,
    }: {
      readonly title: string;
      readonly rightAction?: {
        readonly label?: string;
        readonly onPress: () => void;
      };
    }): React.JSX.Element =>
      ReactModule.createElement(
        Native.View,
        { testID: "page-header" },
        ReactModule.createElement(Native.Text, null, title),
        rightAction
          ? ReactModule.createElement(
              Native.Pressable,
              {
                accessibilityRole: "button",
                accessibilityLabel: rightAction.label,
                onPress: rightAction.onPress,
              },
              ReactModule.createElement(Native.Text, null, rightAction.label)
            )
          : null
      ),
  };
});

jest.mock("@/components/budget/BudgetDetailIdentity", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    BudgetDetailIdentity: ({
      identity,
      onLifecycleAction,
    }: {
      readonly identity: {
        readonly name: string;
        readonly availableLifecycleAction: "PAUSE" | "RESUME" | null;
      };
      readonly onLifecycleAction: (action: "PAUSE" | "RESUME") => void;
    }): React.JSX.Element =>
      ReactModule.createElement(
        Native.Pressable,
        {
          testID: "budget-detail-identity",
          onPress: (): void => {
            if (identity.availableLifecycleAction) {
              onLifecycleAction(identity.availableLifecycleAction);
            }
          },
        },
        ReactModule.createElement(Native.Text, null, identity.name)
      ),
  };
});

jest.mock("@/components/budget/BudgetDetailOverview", () => ({
  BudgetDetailOverview: ({
    metrics,
    daysLeft,
  }: {
    readonly metrics: {
      readonly spent: number;
      readonly limit: number;
      readonly percentage: number;
    };
    readonly daysLeft: number;
  }): React.JSX.Element => {
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return mockReact.createElement(Native.View, {
      testID: "budget-detail-overview",
      accessibilityLabel: `spent:${metrics.spent};limit:${metrics.limit};percentage:${metrics.percentage};days:${daysLeft}`,
    });
  },
}));
jest.mock("@/components/budget/BudgetSpendingTrendChart", () => ({
  BudgetSpendingTrendChart: (): React.JSX.Element => {
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return mockReact.createElement(Native.View, {
      testID: "budget-detail-trend",
    });
  },
}));
jest.mock("@/components/budget/SubcategoryBreakdown", () => ({
  SubcategoryBreakdown: (): React.JSX.Element => {
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return mockReact.createElement(Native.View, {
      testID: "budget-detail-breakdown",
    });
  },
}));
jest.mock("@/components/budget/BudgetRecentTransactions", () => {
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    BudgetRecentTransactions: ({
      onPressTransaction,
    }: {
      readonly onPressTransaction: (id: string) => void;
    }): React.JSX.Element =>
      mockReact.createElement(Native.Pressable, {
        testID: "budget-detail-recent",
        onPress: (): void => onPressTransaction("tx-1"),
      }),
  };
});
jest.mock("@/components/budget/BudgetDetailDangerZone", () => {
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    BudgetDetailDangerZone: ({
      onDelete,
      isDisabled,
    }: {
      readonly onDelete: () => void;
      readonly isDisabled?: boolean;
    }): React.JSX.Element =>
      mockReact.createElement(Native.Pressable, {
        testID: "budget-detail-danger",
        accessibilityState: { disabled: Boolean(isDisabled) },
        onPress: onDelete,
      }),
  };
});
jest.mock("@/components/budget/BudgetDetailSkeleton", () => ({
  BudgetDetailSkeleton: (): React.JSX.Element => {
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return mockReact.createElement(Native.View, {
      testID: "budget-detail-skeleton",
    });
  },
}));
jest.mock("@/components/modals/ConfirmationModal", () => {
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ConfirmationModal: ({
      visible,
      title,
      onConfirm,
      onCancel,
      isConfirming,
    }: {
      readonly visible: boolean;
      readonly title: string;
      readonly onConfirm: () => void;
      readonly onCancel: () => void;
      readonly isConfirming?: boolean;
    }): React.JSX.Element | null => {
      mockConfirmationHandler = onConfirm;
      return visible
        ? mockReact.createElement(
            Native.View,
            { testID: "confirmation-modal" },
            mockReact.createElement(Native.Text, null, title),
            mockReact.createElement(Native.Pressable, {
              testID: "confirm-action",
              accessibilityState: { disabled: Boolean(isConfirming) },
              onPress: onConfirm,
            }),
            mockReact.createElement(Native.Pressable, {
              testID: "cancel-action",
              accessibilityState: { disabled: Boolean(isConfirming) },
              onPress: onCancel,
            })
          )
        : null;
    },
  };
});

import BudgetDetailScreen from "@/app/(private)/budget-detail";

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { id: "budget-1" };
  mockPendingAction = null;
  mockConfirmationHandler = null;
  mockExecute.mockResolvedValue({ status: "success", action: "pause" });
  mockDetail = {
    budget: { id: "budget-1" },
    readModel: mockReadModel,
    isInitialLoading: false,
    isRefreshing: false,
    isNotFound: false,
    errorKey: null,
    hasValidData: true,
    retry: mockRetry,
    isLoading: false,
  };
});

describe("BudgetDetailScreen", () => {
  it("renders approved section order and direct Edit navigation", () => {
    render(<BudgetDetailScreen />);

    const routeSource = readFileSync(
      resolve(__dirname, "../../app/(private)/budget-detail.tsx"),
      "utf8"
    );
    expect(routeSource.indexOf("<BudgetDetailIdentity")).toBeLessThan(
      routeSource.indexOf("<BudgetDetailOverview")
    );
    expect(routeSource.indexOf("<BudgetDetailOverview")).toBeLessThan(
      routeSource.indexOf("<BudgetSpendingTrendChart")
    );
    expect(routeSource.indexOf("<BudgetSpendingTrendChart")).toBeLessThan(
      routeSource.indexOf("<SubcategoryBreakdown")
    );
    expect(routeSource.indexOf("<BudgetRecentTransactions")).toBeLessThan(
      routeSource.indexOf("<BudgetDetailDangerZone")
    );

    fireEvent.press(screen.getByLabelText("detail.actions.edit"));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/create-budget",
      params: { id: "budget-1" },
    });
  });

  it("confirms Pause and writes only after confirmation", async () => {
    render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    expect(
      screen.getByText("detail.actions.pause_confirmation_title")
    ).toBeOnTheScreen();
    expect(mockExecute).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("cancel-action"));
    expect(screen.queryByTestId("confirmation-modal")).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() =>
      expect(mockExecute).toHaveBeenCalledWith("pause", "budget-1")
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("keeps detail visible and shows friendly feedback when an action fails", async () => {
    mockExecute.mockResolvedValueOnce({
      status: "error",
      action: "pause",
      errorKey: "detail.actions.pause_error",
    });
    render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    fireEvent.press(screen.getByTestId("confirm-action"));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "detail.actions.pause_error",
        })
      )
    );
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });
  it("confirms Resume and omits invalid lifecycle actions for expired budgets", async () => {
    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          lifecycle: "PAUSED",
          availableLifecycleAction: "RESUME",
        },
      },
    };
    const view = render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    expect(
      screen.getByText("detail.actions.resume_confirmation_title")
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() =>
      expect(mockExecute).toHaveBeenCalledWith("resume", "budget-1")
    );

    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          lifecycle: "EXPIRED",
          availableLifecycleAction: null,
        },
      },
    };
    view.rerender(<BudgetDetailScreen />);
    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    expect(screen.queryByTestId("confirmation-modal")).toBeNull();
  });

  it("cancels Resume without writing and keeps friendly state on failure", async () => {
    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          lifecycle: "PAUSED",
          availableLifecycleAction: "RESUME",
        },
      },
    };
    const view = render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    fireEvent.press(screen.getByTestId("cancel-action"));
    expect(mockExecute).not.toHaveBeenCalled();
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();

    mockExecute.mockResolvedValueOnce({
      status: "error",
      action: "resume",
      errorKey: "detail.actions.resume_error",
    });
    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    fireEvent.press(screen.getByTestId("confirm-action"));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "detail.actions.resume_error",
        })
      )
    );
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();
    view.unmount();
  });

  it("closes a stale Pause confirmation when observation makes the action ineligible", async () => {
    const view = render(<BudgetDetailScreen />);
    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    expect(screen.getByTestId("confirmation-modal")).toBeOnTheScreen();
    const staleConfirmationHandler = mockConfirmationHandler;

    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          lifecycle: "EXPIRED",
          availableLifecycleAction: null,
        },
      },
    };
    view.rerender(<BudgetDetailScreen />);

    expect(screen.queryByTestId("confirmation-modal")).toBeNull();
    await act(async () => {
      staleConfirmationHandler?.();
      await Promise.resolve();
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("drops an open confirmation when the route targets another budget", () => {
    const view = render(<BudgetDetailScreen />);
    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    expect(screen.getByTestId("confirmation-modal")).toBeOnTheScreen();

    mockSearchParams = { id: "budget-2" };
    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          budgetId: "budget-2",
          name: "Transport",
        },
      },
    };
    view.rerender(<BudgetDetailScreen />);

    expect(screen.queryByTestId("confirmation-modal")).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("hides a pending confirmation when the authenticated detail scope clears", () => {
    const view = render(<BudgetDetailScreen />);
    fireEvent.press(screen.getByTestId("budget-detail-identity"));
    mockPendingAction = "pause";
    mockDetail = {
      ...mockDetail,
      readModel: null,
      hasValidData: false,
      isNotFound: false,
    };
    view.rerender(<BudgetDetailScreen />);

    expect(screen.queryByTestId("confirmation-modal")).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("omits category breakdown for global budgets", () => {
    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          type: "GLOBAL",
        },
        categoryBreakdown: null,
      },
    };
    render(<BudgetDetailScreen />);
    expect(screen.queryByTestId("budget-detail-breakdown")).toBeNull();
  });

  it("navigates a recent transaction to Edit Transaction", () => {
    render(<BudgetDetailScreen />);
    fireEvent.press(screen.getByTestId("budget-detail-recent"));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/edit-transaction",
      params: { id: "tx-1" },
    });
  });

  it("confirms Delete, blocks duplicate pending controls, and exits on success", async () => {
    mockExecute.mockResolvedValueOnce({ status: "success", action: "delete" });
    const view = render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-danger"));
    expect(
      screen.getByText("detail.actions.delete_confirmation_title")
    ).toBeOnTheScreen();

    mockPendingAction = "delete";
    view.rerender(<BudgetDetailScreen />);
    expect(screen.getByTestId("confirm-action")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    expect(screen.getByTestId("cancel-action")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );

    mockPendingAction = null;
    view.rerender(<BudgetDetailScreen />);
    fireEvent.press(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(mockRouterBack).toHaveBeenCalledTimes(1));
  });

  it("cancels Delete without writing or leaving detail", () => {
    render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-danger"));
    fireEvent.press(screen.getByTestId("cancel-action"));

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();
  });

  it("keeps detail visible when Delete fails", async () => {
    mockExecute.mockResolvedValueOnce({
      status: "error",
      action: "delete",
      errorKey: "detail.actions.delete_error",
    });
    render(<BudgetDetailScreen />);

    fireEvent.press(screen.getByTestId("budget-detail-danger"));
    fireEvent.press(screen.getByTestId("confirm-action"));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "detail.actions.delete_error",
        })
      )
    );
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();
  });

  it("shows a mockup-shaped skeleton, initial Retry, and retained refresh error", () => {
    mockDetail = {
      ...mockDetail,
      readModel: null,
      hasValidData: false,
      isInitialLoading: true,
      isLoading: true,
    };
    const view = render(<BudgetDetailScreen />);
    expect(screen.getByTestId("budget-detail-skeleton")).toBeOnTheScreen();
    expect(screen.getByLabelText("detail.loading")).toBeOnTheScreen();

    mockDetail = {
      ...mockDetail,
      isInitialLoading: false,
      isLoading: false,
      errorKey: "budget_detail_load_failed",
    };
    view.rerender(<BudgetDetailScreen />);
    fireEvent.press(screen.getByText("detail.retry"));
    expect(mockRetry).toHaveBeenCalledTimes(1);

    mockDetail = {
      ...mockDetail,
      readModel: mockReadModel,
      hasValidData: true,
      errorKey: "budget_detail_refresh_failed",
    };
    view.rerender(<BudgetDetailScreen />);
    expect(screen.getByText("detail.refresh_error")).toBeOnTheScreen();
    expect(
      screen.getByLabelText("detail.refresh_error detail.retry")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("budget-detail-overview")).toBeOnTheScreen();
  });

  it("uses the actual bottom inset exactly once", () => {
    render(<BudgetDetailScreen />);
    expect(screen.getByTestId("budget-detail-scroll")).toHaveProp(
      "contentContainerStyle",
      expect.objectContaining({ paddingBottom: 58 })
    );
  });

  it("renders changed identity and metrics when returning from Edit", () => {
    const view = render(<BudgetDetailScreen />);
    fireEvent.press(screen.getByLabelText("detail.actions.edit"));

    mockDetail = {
      ...mockDetail,
      readModel: {
        ...mockReadModel,
        identity: {
          ...mockReadModel.identity,
          name: "Food plan updated",
          periodStart: new Date(2026, 8, 1),
          periodEnd: new Date(2026, 8, 30),
        },
        metrics: {
          ...mockReadModel.metrics,
          limit: 9000,
          percentage: 20,
        },
        daysLeft: 29,
      },
    };
    view.rerender(<BudgetDetailScreen />);

    expect(screen.getByText("Food plan updated")).toBeOnTheScreen();
    expect(screen.getByTestId("budget-detail-overview")).toHaveProp(
      "accessibilityLabel",
      "spent:1750;limit:9000;percentage:20;days:29"
    );
  });

  it.each(["PAUSED", "EXPIRED"] as const)(
    "preserves positive historical overview for %s budgets",
    (lifecycle) => {
      mockDetail = {
        ...mockDetail,
        readModel: {
          ...mockReadModel,
          identity: {
            ...mockReadModel.identity,
            lifecycle,
            availableLifecycleAction: lifecycle === "PAUSED" ? "RESUME" : null,
          },
          metrics: {
            ...mockReadModel.metrics,
            spent: 2400,
            percentage: 48,
          },
        },
      };

      render(<BudgetDetailScreen />);

      expect(screen.getByTestId("budget-detail-overview")).toHaveProp(
        "accessibilityLabel",
        "spent:2400;limit:5000;percentage:48;days:18"
      );
    }
  );
});
