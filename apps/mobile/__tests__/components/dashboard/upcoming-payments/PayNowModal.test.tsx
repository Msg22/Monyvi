import type { Account, RecurringPayment } from "@monyvi/db";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { BackHandler, Modal } from "react-native";
import { PayNowModal } from "@/components/dashboard/upcoming-payments/PayNowModal";

const mockUsePaymentSubmission = jest.fn();
const mockSubmit = jest.fn();
let mockAccounts: readonly Account[] = [];

jest.mock("@/hooks/useAccounts", () => ({
  useAccounts: (): { readonly accounts: readonly Account[] } => ({
    accounts: mockAccounts,
  }),
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 0,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 24, right: 0, bottom: 16, left: 0 }),
}));

jest.mock("@/hooks/usePaymentSubmission", () => ({
  usePaymentSubmission: (params: unknown): unknown =>
    mockUsePaymentSubmission(params),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

const payment = {
  id: "payment-1",
  accountId: "",
  amount: 250,
  currency: "EGP",
  name: "Electricity",
  daysUntilDue: 2,
  nextDueDate: new Date("2026-07-20T00:00:00.000Z"),
} as unknown as RecurringPayment;

const validPayment = {
  ...payment,
  accountId: "account-1",
} as unknown as RecurringPayment;

const account = {
  id: "account-1",
  name: "Cash",
  balance: 1000,
  currency: "EGP",
} as unknown as Account;

describe("PayNowModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccounts = [];
    mockUsePaymentSubmission.mockReturnValue({
      isSubmitting: false,
      amountError: "",
      clearAmountError: jest.fn(),
      submit: mockSubmit,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders nothing while hidden", () => {
    const screen = render(
      <PayNowModal
        payment={payment}
        visible={false}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.toJSON()).toBeNull();
  });

  it("uses a full-screen absolute overlay instead of React Native Modal", () => {
    const screen = render(
      <PayNowModal
        payment={payment}
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
    expect(screen.getByTestId("pay-now-overlay")).toHaveProp(
      "className",
      "absolute inset-0 z-[999] items-center justify-center px-5"
    );
    expect(screen.getByTestId("pay-now-overlay")).toHaveProp(
      "accessibilityViewIsModal",
      true
    );
    expect(screen.getByTestId("pay-now-overlay")).toHaveProp(
      "importantForAccessibility",
      "yes"
    );
  });

  it("disables confirmation when the payment has no account ID", () => {
    const screen = render(
      <PayNowModal
        payment={payment}
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByTestId("pay-now-confirm")).toBeDisabled();
    expect(mockUsePaymentSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null })
    );
  });

  it("disables confirmation when the linked account no longer exists", () => {
    mockAccounts = [account];
    const paymentWithStaleAccount = {
      ...payment,
      accountId: "deleted-account",
    } as unknown as RecurringPayment;

    const screen = render(
      <PayNowModal
        payment={paymentWithStaleAccount}
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByTestId("pay-now-confirm")).toBeDisabled();
    expect(mockUsePaymentSubmission).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: null })
    );
  });

  it("disables confirmation when the linked account uses another currency", () => {
    mockAccounts = [
      {
        ...account,
        currency: "USD",
      } as unknown as Account,
    ];

    const screen = render(
      <PayNowModal
        payment={validPayment}
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByTestId("pay-now-confirm")).toBeDisabled();
    expect(mockUsePaymentSubmission).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: null })
    );
  });

  it("submits the initialized amount for a valid account", () => {
    mockAccounts = [account];
    const screen = render(
      <PayNowModal
        payment={validPayment}
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("pay-now-confirm"));

    expect(mockSubmit).toHaveBeenCalledWith("250");
  });

  it("closes from the cancel action", () => {
    const onClose = jest.fn();
    const screen = render(
      <PayNowModal
        payment={payment}
        visible
        onClose={onClose}
        onSuccess={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText("cancel"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes and consumes the Android hardware-back event", () => {
    const onClose = jest.fn();
    const remove = jest.fn();
    let hardwareBackHandler: (() => boolean) | undefined;
    jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_eventName, handler) => {
        hardwareBackHandler = (): boolean => handler() === true;
        return { remove };
      });

    const screen = render(
      <PayNowModal
        payment={payment}
        visible
        onClose={onClose}
        onSuccess={jest.fn()}
      />
    );

    expect(hardwareBackHandler?.()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
