import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React from "react";

interface MockDateTimePickerProps {
  readonly minimumDate?: Date;
  readonly value: Date;
  readonly onChange: (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => void;
}
const mockDateTimePicker = jest.fn<void, [MockDateTimePickerProps]>();
let latestDateTimePickerProps: MockDateTimePickerProps | null = null;

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: (props: MockDateTimePickerProps): React.JSX.Element => {
    latestDateTimePickerProps = props;
    mockDateTimePicker(props);
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.Text testID="recurring-payment-date-picker" />;
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string) => string;
    readonly i18n: { readonly language: string };
  } => ({
    t: (key: string): string => key,
    i18n: { language: "en-US" },
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (): null => null,
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));

jest.mock("@/components/modals/FrequencyPickerModal", () => ({
  FrequencyPickerModal: (): null => null,
  getFrequencyLabel: (frequency: string): string => frequency,
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): null => null,
}));

jest.mock("@expo/vector-icons", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => (
      <ReactNative.Text testID={`icon-${name}`} />
    ),
  };
});

import {
  RecurringPaymentForm,
  type RecurringPaymentFormValues,
} from "@/components/recurring-payments/RecurringPaymentForm";
import type { Account, Category } from "@monyvi/db";

const account = {
  id: "account-1",
  name: "Cash",
  type: "CASH",
  balance: 1000,
  currency: "EGP",
} as const;

const category = {
  id: "category-1",
  displayName: "Subscriptions",
  icon: "card-outline",
  iconLibrary: "Ionicons",
  color: null,
  isExpense: true,
} as const;

const initialValues: RecurringPaymentFormValues = {
  name: "Netflix",
  amount: "250",
  type: "EXPENSE",
  accountId: "account-1",
  categoryId: "category-1",
  frequency: "MONTHLY",
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: null,
  action: "NOTIFY",
  notes: "",
};

describe("RecurringPaymentForm date picker", () => {
  beforeEach(() => {
    mockDateTimePicker.mockClear();
    latestDateTimePickerProps = null;
  });

  it("allows an existing past start date to stay selectable in edit mode", () => {
    const historicalStartDate = new Date("2020-01-15T00:00:00.000Z");

    render(
      <RecurringPaymentForm
        mode="edit"
        initialValues={{ ...initialValues, startDate: historicalStartDate }}
        accounts={[account] as unknown as readonly Account[]}
        expenseCategories={[category] as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));

    expect(mockDateTimePicker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        minimumDate: historicalStartDate,
        value: historicalStartDate,
      })
    );
  });

  it("uses the due payment date as the minimum end date", () => {
    const duePaymentDate = new Date("2026-06-01T00:00:00.000Z");
    const endDate = new Date("2026-08-01T00:00:00.000Z");

    render(
      <RecurringPaymentForm
        mode="edit"
        initialValues={{ ...initialValues, startDate: duePaymentDate, endDate }}
        accounts={[account] as unknown as readonly Account[]}
        expenseCategories={[category] as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row"));

    expect(mockDateTimePicker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        minimumDate: duePaymentDate,
        value: endDate,
      })
    );
  });

  it("closes a date picker when its row is pressed again", () => {
    render(
      <RecurringPaymentForm
        mode="create"
        initialValues={initialValues}
        accounts={[account] as unknown as readonly Account[]}
        expenseCategories={[category] as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row"));
    expect(screen.getByTestId("recurring-payment-date-picker")).toBeTruthy();

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row"));

    expect(
      screen.queryByTestId("recurring-payment-date-picker")
    ).toBeNull();
  });

  it("clears an End date error after correcting Due payment", () => {
    render(
      <RecurringPaymentForm
        mode="create"
        initialValues={{
          ...initialValues,
          startDate: new Date("2026-06-10T00:00:00.000Z"),
          endDate: new Date("2026-06-01T00:00:00.000Z"),
        }}
        accounts={[account] as unknown as readonly Account[]}
        expenseCategories={[category] as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("recurring-payment-save-button"));
    expect(screen.getByText("end_date_before_due")).toBeTruthy();

    fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));
    const datePickerProps = latestDateTimePickerProps;
    if (!datePickerProps) {
      throw new Error("Expected Due payment picker props");
    }
    const datePickerEvent: DateTimePickerEvent = {
      type: "set",
      nativeEvent: { timestamp: 0 },
    };
    act(() => {
      datePickerProps.onChange(
        datePickerEvent,
        new Date("2026-05-20T00:00:00.000Z")
      );
    });

    expect(screen.queryByText("end_date_before_due")).toBeNull();
  });
});
