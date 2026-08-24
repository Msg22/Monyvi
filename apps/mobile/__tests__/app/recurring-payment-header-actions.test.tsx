import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

let mockPaymentStatus: "ACTIVE" | "PAUSED" | "COMPLETED" = "ACTIVE";
let mockFormEndDate: Date | null = null;
let mockReactivateAfterSaving = false;
let mockAccountsLoading = false;
const mockShowToast = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: (): { readonly id: string } => ({ id: "payment-1" }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({
    title,
    rightAction,
  }: {
    readonly title: string;
    readonly rightAction?: { readonly onPress: () => void };
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.View>
        <ReactNative.Text>{title}</ReactNative.Text>
        {rightAction ? (
          <ReactNative.Pressable
            testID="header-save"
            onPress={rightAction.onPress}
          >
            <ReactNative.Text>save</ReactNative.Text>
          </ReactNative.Pressable>
        ) : null}
      </ReactNative.View>
    );
  },
}));

jest.mock("@/components/recurring-payments", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");

  const RecurringPaymentForm = ReactActual.forwardRef(
    (
      props: {
        readonly status?: "ACTIVE" | "PAUSED" | "COMPLETED";
        readonly onSubmit: (values: {
          readonly name: string;
          readonly amount: string;
          readonly type: "EXPENSE";
          readonly accountId: string;
          readonly categoryId: string;
          readonly frequency: "MONTHLY";
          readonly startDate: Date;
          readonly endDate: Date | null;
          readonly reactivateAfterSaving: boolean;
          readonly action: "NOTIFY";
          readonly notes: string;
        }) => Promise<void>;
        readonly onPauseToggle?: () => Promise<void>;
        readonly onDelete?: () => Promise<void>;
      },
      ref
    ): React.JSX.Element => {
      const ReactNative =
        jest.requireActual<typeof import("react-native")>("react-native");
      const values = {
        name: "Netflix",
        amount: "250",
        type: "EXPENSE" as const,
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "MONTHLY" as const,
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: mockFormEndDate,
        reactivateAfterSaving: mockReactivateAfterSaving,
        action: "NOTIFY" as const,
        notes: "",
      };

      ReactActual.useImperativeHandle(ref, () => ({
        submit: (): void => {
          void props.onSubmit(values);
        },
      }));

      return (
        <ReactNative.View>
          <ReactNative.Pressable
            testID="form-submit"
            onPress={() => void props.onSubmit(values)}
          >
            <ReactNative.Text>submit</ReactNative.Text>
          </ReactNative.Pressable>
          {props.onPauseToggle ? (
            <ReactNative.Pressable
              testID="form-pause-toggle"
              onPress={() => void props.onPauseToggle?.()}
            >
              <ReactNative.Text>
                {props.status === "PAUSED" ? "resume" : "pause"}
              </ReactNative.Text>
            </ReactNative.Pressable>
          ) : null}
          {props.onDelete ? (
            <ReactNative.Pressable
              testID="form-delete"
              onPress={() => void props.onDelete?.()}
            >
              <ReactNative.Text>delete</ReactNative.Text>
            </ReactNative.Pressable>
          ) : null}
        </ReactNative.View>
      );
    }
  );

  return { RecurringPaymentForm };
});

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: ({
    visible,
    title,
    variant,
    icon,
    onConfirm,
    onCancel,
  }: {
    readonly visible: boolean;
    readonly title: string;
    readonly variant?: string;
    readonly icon?: string;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
  }): React.JSX.Element | null => {
    if (!visible) return null;
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.View>
        <ReactNative.Text>{title}</ReactNative.Text>
        <ReactNative.Text testID={`${title}-variant`}>
          {variant ?? "danger"}
        </ReactNative.Text>
        <ReactNative.Text testID={`${title}-icon`}>
          {icon ?? ""}
        </ReactNative.Text>
        <ReactNative.Pressable testID="modal-confirm" onPress={onConfirm}>
          <ReactNative.Text>confirm</ReactNative.Text>
        </ReactNative.Pressable>
        <ReactNative.Pressable testID="modal-cancel" onPress={onCancel}>
          <ReactNative.Text>cancel</ReactNative.Text>
        </ReactNative.Pressable>
      </ReactNative.View>
    );
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: (): {
    readonly isLoading: boolean;
    readonly accounts: readonly [
      {
        readonly id: "account-1";
        readonly name: "Cash";
        readonly currency: "EGP";
      },
    ];
  } => ({
    isLoading: mockAccountsLoading,
    accounts: [{ id: "account-1", name: "Cash", currency: "EGP" }],
  }),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: jest.fn(
    (): {
      readonly categories: readonly [];
      readonly expenseCategories: readonly [];
      readonly incomeCategories: readonly [];
    } => ({
      categories: [],
      expenseCategories: [],
      incomeCategories: [],
    })
  ),
}));

jest.mock("@/hooks/useRecurringPayment", () => ({
  useRecurringPayment: (): {
    readonly payment: {
      readonly id: "payment-1";
      readonly name: "Netflix";
      readonly amount: 250;
      readonly type: "EXPENSE";
      readonly accountId: "account-1";
      readonly categoryId: "category-1";
      readonly frequency: "MONTHLY";
      readonly startDate: Date;
      readonly endDate: Date | null;
      readonly action: "NOTIFY";
      readonly notes: "";
      readonly status: "ACTIVE" | "PAUSED" | "COMPLETED";
      readonly nextDueDate: Date;
    };
    readonly isLoading: false;
  } => ({
    payment: {
      id: "payment-1",
      name: "Netflix",
      amount: 250,
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: mockFormEndDate,
      action: "NOTIFY",
      notes: "",
      status: mockPaymentStatus,
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    },
    isLoading: false,
  }),
}));

jest.mock("@/services/recurring-payment-service", () => ({
  createRecurringPayment: jest.fn().mockResolvedValue(undefined),
  updateRecurringPayment: jest.fn().mockResolvedValue(undefined),
  pauseRecurringPayment: jest.fn().mockResolvedValue(undefined),
  resumeRecurringPayment: jest.fn().mockResolvedValue(undefined),
  deleteRecurringPayment: jest.fn().mockResolvedValue(undefined),
  RECURRING_PAYMENT_SERVICE_ERROR_CODES: {
    ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
    CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
  },
}));

import CreateRecurringPaymentScreen from "@/app/(private)/create-recurring-payment";
import EditRecurringPaymentScreen from "@/app/(private)/edit-recurring-payment";
import { router } from "expo-router";

interface RecurringPaymentServiceMocks {
  readonly createRecurringPayment: jest.Mock;
  readonly updateRecurringPayment: jest.Mock;
  readonly pauseRecurringPayment: jest.Mock;
  readonly resumeRecurringPayment: jest.Mock;
  readonly deleteRecurringPayment: jest.Mock;
}

function serviceMocks(): RecurringPaymentServiceMocks {
  return jest.requireMock<RecurringPaymentServiceMocks>(
    "@/services/recurring-payment-service"
  );
}

function categoryHookMock(): jest.MockedFunction<
  typeof import("@/hooks/useCategories").useCategories
> {
  return jest.requireMock<{
    readonly useCategories: jest.MockedFunction<
      typeof import("@/hooks/useCategories").useCategories
    >;
  }>("@/hooks/useCategories").useCategories;
}

describe("recurring payment header and destructive actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentStatus = "ACTIVE";
    mockFormEndDate = null;
    mockReactivateAfterSaving = false;
    mockAccountsLoading = false;
  });

  it("submits the add payment form from the header save action", async () => {
    render(<CreateRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(serviceMocks().createRecurringPayment).toHaveBeenCalledWith({
        name: "Netflix",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        frequency: "MONTHLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: null,
        accountId: "account-1",
        categoryId: "category-1",
        action: "NOTIFY",
        notes: undefined,
      });
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "success",
        title: "recurring_payment_created",
        message: "recurring_payment_created_message",
      });
      expect(router.back).toHaveBeenCalled();
    });
  });

  it("maps recurring create service codes to friendly toast messages", async () => {
    serviceMocks().createRecurringPayment.mockRejectedValueOnce(
      new Error("RECURRING_PAYMENT_CATEGORY_UNAVAILABLE")
    );
    render(<CreateRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "recurring_payment_category_unavailable",
        })
      );
    });
  });

  it("maps a selected End date through creation", async () => {
    mockFormEndDate = new Date("2026-08-01T00:00:00.000Z");
    render(<CreateRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(serviceMocks().createRecurringPayment).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: mockFormEndDate })
      );
    });
  });

  it("submits the edit payment form from the header save action", async () => {
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(serviceMocks().updateRecurringPayment).toHaveBeenCalledWith(
        "payment-1",
        {
          name: "Netflix",
          amount: 250,
          currency: "EGP",
          type: "EXPENSE",
          frequency: "MONTHLY",
          startDate: new Date("2026-06-01T00:00:00.000Z"),
          endDate: null,
          reactivateAfterSaving: false,
          accountId: "account-1",
          categoryId: "category-1",
          action: "NOTIFY",
          notes: undefined,
        }
      );
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "success",
        title: "recurring_payment_updated",
        message: "recurring_payment_updated_message",
      });
      expect(router.back).toHaveBeenCalled();
    });
  });

  it("includes hidden categories in the edit display lookup", () => {
    render(<EditRecurringPaymentScreen />);

    expect(categoryHookMock()).toHaveBeenCalledWith({
      topLevelOnly: false,
      includeHidden: true,
    });
  });

  it("maps recurring edit service codes to friendly toast messages", async () => {
    serviceMocks().updateRecurringPayment.mockRejectedValueOnce(
      new Error("RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE")
    );
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "recurring_payment_account_unavailable",
        })
      );
    });
  });

  it("loads and saves a selected End date when editing", async () => {
    mockFormEndDate = new Date("2026-08-01T00:00:00.000Z");
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(serviceMocks().updateRecurringPayment).toHaveBeenCalledWith(
        "payment-1",
        expect.objectContaining({ endDate: mockFormEndDate })
      );
    });
  });

  it("maps the completed edit form reactivation choice through save", async () => {
    mockPaymentStatus = "COMPLETED";
    mockReactivateAfterSaving = true;
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("header-save"));

    await waitFor(() => {
      expect(serviceMocks().updateRecurringPayment).toHaveBeenCalledWith(
        "payment-1",
        expect.objectContaining({ reactivateAfterSaving: true })
      );
    });
  });

  it("waits for linked account data before rendering edit save actions", () => {
    mockAccountsLoading = true;
    render(<EditRecurringPaymentScreen />);

    expect(screen.queryByTestId("header-save")).toBeNull();
    expect(screen.queryByTestId("form-submit")).toBeNull();
  });

  it("confirms before pausing an active payment", async () => {
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("form-pause-toggle"));

    expect(serviceMocks().pauseRecurringPayment).not.toHaveBeenCalled();
    expect(screen.getByText("pause_payment")).toBeTruthy();
    expect(screen.getByTestId("pause_payment-variant")).toHaveTextContent(
      "warning"
    );
    expect(screen.getByTestId("pause_payment-icon")).toHaveTextContent(
      "pause-circle-outline"
    );

    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() => {
      expect(serviceMocks().pauseRecurringPayment).toHaveBeenCalledWith(
        "payment-1"
      );
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "success",
        title: "recurring_payment_paused",
        message: "recurring_payment_paused_message",
      });
    });
    expect(screen.queryByText("pause_payment")).toBeNull();
  });

  it("confirms before resuming a paused payment", async () => {
    mockPaymentStatus = "PAUSED";
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("form-pause-toggle"));

    expect(serviceMocks().resumeRecurringPayment).not.toHaveBeenCalled();
    expect(screen.getByText("resume_payment")).toBeTruthy();
    expect(screen.getByTestId("resume_payment-variant")).toHaveTextContent(
      "success"
    );
    expect(screen.getByTestId("resume_payment-icon")).toHaveTextContent(
      "play-circle-outline"
    );

    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() => {
      expect(serviceMocks().resumeRecurringPayment).toHaveBeenCalledWith(
        "payment-1"
      );
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "success",
        title: "recurring_payment_resumed",
        message: "recurring_payment_resumed_message",
      });
    });
    expect(screen.queryByText("resume_payment")).toBeNull();
  });

  it("shows friendly fallback copy when pause fails with a raw service error", async () => {
    serviceMocks().pauseRecurringPayment.mockRejectedValueOnce(
      new Error("Record not found")
    );
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("form-pause-toggle"));
    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "failed_to_update_payment",
          message: "error_generic",
        })
      );
    });
  });

  it("does not render pause or resume for a completed payment", () => {
    mockPaymentStatus = "COMPLETED";
    render(<EditRecurringPaymentScreen />);

    expect(screen.queryByTestId("form-pause-toggle")).toBeNull();
    expect(screen.getByTestId("form-delete")).toBeTruthy();
  });

  it("confirms before deleting a payment", async () => {
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("form-delete"));

    expect(serviceMocks().deleteRecurringPayment).not.toHaveBeenCalled();
    expect(screen.getByText("delete_payment")).toBeTruthy();

    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() => {
      expect(serviceMocks().deleteRecurringPayment).toHaveBeenCalledWith(
        "payment-1"
      );
      expect(mockShowToast).toHaveBeenCalledWith({
        type: "success",
        title: "recurring_payment_deleted",
        message: "recurring_payment_deleted_message",
      });
      expect(router.back).toHaveBeenCalled();
    });
  });

  it("shows friendly fallback copy when delete fails with a raw service error", async () => {
    serviceMocks().deleteRecurringPayment.mockRejectedValueOnce(
      new Error("OWNERSHIP_FAILED")
    );
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("form-delete"));
    fireEvent.press(screen.getByTestId("modal-confirm"));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "failed_to_delete_payment",
          message: "error_generic",
        })
      );
    });
  });

  it("does not delete when the delete confirmation is cancelled", () => {
    render(<EditRecurringPaymentScreen />);

    fireEvent.press(screen.getByTestId("form-delete"));
    fireEvent.press(screen.getByTestId("modal-cancel"));

    expect(serviceMocks().deleteRecurringPayment).not.toHaveBeenCalled();
  });
});
