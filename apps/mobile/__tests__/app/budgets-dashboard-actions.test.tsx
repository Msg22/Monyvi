import * as mockReact from "react";
import {
  Pressable as MockPressable,
  Text as MockText,
  View as MockView,
} from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockShowToast = jest.fn();
const mockConfirmResume = jest.fn<
  Promise<"resumed" | "ignored" | "failed">,
  [string]
>();
const mockResetActionError = jest.fn();
const mockRefresh = jest.fn();
const mockPauseExpiredCustomBudgets = jest.fn<Promise<number>, []>();

const mockEmptyReadModel = Object.freeze({
  overallBudgets: Object.freeze([]),
  needsAttentionBudgets: Object.freeze([]),
  categoryBudgets: Object.freeze([]),
  pausedBudgets: Object.freeze([]),
  totalCount: 0,
  matchingCount: 0,
});

jest.mock("expo-router", () => ({
  useRouter: (): { readonly push: typeof mockPush } => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)): void => {
    mockReact.useEffect(callback, [callback]);
  },
}));

jest.mock("react-i18next", () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string): string =>
      namespace === "common" ? `common:${key}` : key,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({
    rightAction,
  }: {
    readonly rightAction?: {
      readonly onPress: () => void;
      readonly testID?: string;
      readonly accessibilityLabel?: string;
    };
  }): mockReact.JSX.Element => (
    <MockPressable
      testID={rightAction?.testID}
      onPress={rightAction?.onPress}
      accessibilityLabel={rightAction?.accessibilityLabel}
    >
      <MockText>header action</MockText>
    </MockPressable>
  ),
}));

jest.mock("@/components/budget/BudgetDashboard", () => ({
  BudgetDashboard: ({
    onCreateBudget,
    onBudgetPress,
    onResume,
    onRenew,
  }: {
    readonly onCreateBudget: () => void;
    readonly onBudgetPress: (id: string) => void;
    readonly onResume: (id: string) => void;
    readonly onRenew: (id: string) => void;
  }): mockReact.JSX.Element => (
    <MockView>
      <MockPressable testID="dashboard-create" onPress={onCreateBudget} />
      <MockPressable
        testID="dashboard-detail"
        onPress={() => onBudgetPress("budget-1")}
      />
      <MockPressable
        testID="dashboard-resume"
        onPress={() => onResume("paused-1")}
      />
      <MockPressable
        testID="dashboard-renew"
        onPress={() => onRenew("expired-1")}
      />
    </MockView>
  ),
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: ({
    visible,
    onConfirm,
    onCancel,
    cancelLabel,
  }: {
    readonly visible: boolean;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
    readonly cancelLabel: string;
  }): mockReact.JSX.Element | null =>
    visible ? (
      <MockView testID="resume-confirmation">
        <MockText testID="resume-cancel-label">{cancelLabel}</MockText>
        <MockPressable testID="modal-cancel" onPress={onCancel} />
        <MockPressable testID="modal-confirm" onPress={onConfirm} />
      </MockView>
    ) : null,
}));

jest.mock("@/hooks/useBudgets", () => ({
  useBudgets: () => ({
    readModel: mockEmptyReadModel,
    periodFilter: "ALL",
    isInitialLoading: false,
    isRefreshing: false,
    hasValidData: true,
    errorKey: null,
    setPeriodFilter: jest.fn(),
    retry: jest.fn(),
    refresh: mockRefresh,
    autoPauseCheckKey: "key-1",
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP", isLoading: false }),
}));

jest.mock("@/hooks/useBudgetDashboardActions", () => ({
  useBudgetDashboardActions: () => ({
    isSubmitting: false,
    errorKey: null,
    confirmResume: mockConfirmResume,
    resetError: mockResetActionError,
  }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock("@/services/budget-service", () => ({
  pauseExpiredCustomBudgets: () => mockPauseExpiredCustomBudgets(),
}));

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn() },
}));

import BudgetsScreen from "@/app/(private)/budgets";

describe("BudgetsScreen dashboard actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmResume.mockResolvedValue("resumed");
    mockPauseExpiredCustomBudgets.mockResolvedValue(0);
  });

  it("routes header and empty-state create actions without edit or renew params", () => {
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("budgets-add-button"));
    fireEvent.press(screen.getByTestId("dashboard-create"));

    expect(mockPush).toHaveBeenNthCalledWith(1, "/create-budget");
    expect(mockPush).toHaveBeenNthCalledWith(2, "/create-budget");
    expect(screen.getByLabelText("accessibility_create_budget")).toBeTruthy();
  });

  it("routes detail and Renew with distinct contracts", () => {
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("dashboard-detail"));
    fireEvent.press(screen.getByTestId("dashboard-renew"));

    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: "/budget-detail",
      params: { id: "budget-1" },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: "/create-budget",
      params: { renewFrom: "expired-1" },
    });
  });

  it("keeps the expired card visible and reports Renew navigation failure", () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("dashboard-renew"));

    expect(mockShowToast).toHaveBeenCalledWith({
      type: "error",
      title: "dashboard_action_error",
    });
  });

  it("opens Resume confirmation and cancellation performs no command", () => {
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("dashboard-resume"));
    expect(screen.getByTestId("resume-confirmation")).toBeTruthy();
    expect(screen.getByText("common:cancel")).toBeTruthy();

    fireEvent.press(screen.getByTestId("modal-cancel"));
    expect(mockConfirmResume).not.toHaveBeenCalled();
    expect(screen.queryByTestId("resume-confirmation")).toBeNull();
  });

  it("confirms Resume once and closes only after success", async () => {
    let resolveResume: ((result: "resumed") => void) | undefined;
    mockConfirmResume.mockReturnValue(
      new Promise<"resumed">((resolve) => {
        resolveResume = resolve;
      })
    );
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("dashboard-resume"));
    fireEvent.press(screen.getByTestId("modal-confirm"));
    expect(mockConfirmResume).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("resume-confirmation")).toBeTruthy();

    await act(async () => {
      resolveResume?.("resumed");
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.queryByTestId("resume-confirmation")).toBeNull()
    );
  });

  it("keeps the confirmation and shows friendly feedback after Resume failure", async () => {
    mockConfirmResume.mockResolvedValue("failed");
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("dashboard-resume"));
    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "error",
        title: "dashboard_action_error",
      })
    );
    expect(screen.getByTestId("resume-confirmation")).toBeTruthy();
    expect(mockResetActionError).toHaveBeenCalledTimes(1);
  });

  it("ignores a duplicate Resume confirmation without false failure feedback", async () => {
    mockConfirmResume.mockResolvedValue("ignored");
    const screen = render(<BudgetsScreen />);

    fireEvent.press(screen.getByTestId("dashboard-resume"));
    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() => expect(mockConfirmResume).toHaveBeenCalledTimes(1));
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(mockResetActionError).not.toHaveBeenCalled();
    expect(screen.getByTestId("resume-confirmation")).toBeTruthy();
  });

  it("refreshes only when the focus lifecycle command changes budgets", async () => {
    mockPauseExpiredCustomBudgets.mockResolvedValue(2);
    render(<BudgetsScreen />);

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });
});
