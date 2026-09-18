import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React from "react";

interface MockDateTimePickerProps {
  readonly minimumDate?: Date;
  readonly maximumDate?: Date;
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
  startDate: new Date(2026, 5, 1),
  endDate: null,
  reactivateAfterSaving: false,
  action: "NOTIFY",
  notes: "",
};

describe("RecurringPaymentForm date picker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockDateTimePicker.mockClear();
    latestDateTimePickerProps = null;
    jest.setSystemTime(new Date(2026, 5, 1, 12));
  });

  it("constrains replacement choices for an existing past start date in edit mode", () => {
    const historicalStartDate = new Date(2020, 0, 15);

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
        minimumDate: new Date(2026, 5, 1),
        maximumDate: new Date(2027, 5, 1),
        value: new Date(2026, 5, 1),
      })
    );
  });

  it("uses the due payment date as the minimum end date", () => {
    const duePaymentDate = new Date(2026, 5, 1);
    const endDate = new Date(2026, 7, 1);

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

  it("reopens the picker when the selected End date value is pressed", () => {
    render(
      <RecurringPaymentForm
        mode="edit"
        initialValues={{
          ...initialValues,
          endDate: new Date(2026, 7, 1),
        }}
        accounts={[account] as unknown as readonly Account[]}
        expenseCategories={[category] as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row-value"));

    expect(screen.getByTestId("recurring-payment-date-picker")).toBeTruthy();
  });

  it("keeps an unset End date unchanged when the picker is dismissed", () => {
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
    const dismissedEvent: DateTimePickerEvent = {
      type: "dismissed",
      nativeEvent: { timestamp: 0, utcOffset: 0 },
    };
    act(() => {
      latestDateTimePickerProps?.onChange(
        dismissedEvent,
        new Date(2026, 7, 24)
      );
    });

    expect(screen.getByText("end_date_not_set")).toBeTruthy();
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
          startDate: new Date(2026, 5, 10),
          endDate: new Date(2026, 5, 1),
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
      nativeEvent: { timestamp: 0, utcOffset: 0 },
    };
    act(() => {
      datePickerProps.onChange(datePickerEvent, new Date(2026, 5, 1));
    });

    expect(screen.queryByText("end_date_before_due")).toBeNull();
  });
});
