/* eslint-disable max-lines, @typescript-eslint/no-unsafe-assignment -- Physical-device QA coverage keeps the form interactions together; RNTL screen query values are safe renderer handles. */
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";

interface MockDatePickerProps {
  readonly value: Date;
  readonly minimumDate?: Date;
  readonly maximumDate?: Date;
  readonly onChange: (
    event: { readonly type: "set" | "dismissed" },
    selectedDate?: Date
  ) => void;
}

const mockDateTimePicker = jest.fn<void, [MockDatePickerProps]>();

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: (props: MockDatePickerProps): React.JSX.Element => {
    mockDateTimePicker(props);
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <>
        {props.minimumDate ? (
          <ReactNative.Pressable
            testID="set-picker-minimum-date"
            onPress={() =>
              props.onChange({ type: "set" }, props.minimumDate)
            }
          />
        ) : null}
        {props.maximumDate ? (
          <ReactNative.Pressable
            testID="set-picker-maximum-date"
            onPress={() =>
              props.onChange({ type: "set" }, props.maximumDate)
            }
          />
        ) : null}
        <ReactNative.Pressable
          testID="dismiss-recurring-date-picker"
          onPress={() => props.onChange({ type: "dismissed" })}
        />
      </>
    );
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

jest.mock("@/hooks/useFormScroll", () => ({
  useFormScroll: (): {
    readonly scrollViewRef: { readonly current: null };
    readonly getFieldRef: () => { readonly current: null };
    readonly onScroll: () => void;
    readonly scrollToField: () => void;
    readonly scrollToFirstError: () => void;
  } => ({
    scrollViewRef: { current: null },
    getFieldRef: () => ({ current: null }),
    onScroll: () => undefined,
    scrollToField: () => undefined,
    scrollToFirstError: () => undefined,
  }),
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

jest.mock(
  "@/components/recurring-payments/RecurringPaymentEditActions",
  () => ({
    RecurringPaymentEditActions: (): null => null,
  })
);

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): null => null,
}));

jest.mock("@expo/vector-icons", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => (
      <ReactNative.Text>{name}</ReactNative.Text>
    ),
  };
});

import {
  RecurringPaymentForm,
  type RecurringPaymentFormValues,
} from "@/components/recurring-payments/RecurringPaymentForm";
import type { Account, Category } from "@monyvi/db";
import { isSameLocalCalendarDay } from "@monyvi/logic";

const accounts = [
  {
    id: "account-1",
    name: "Cash",
    type: "CASH",
    balance: 1000,
    currency: "EGP",
  },
] as const;

const categories = [
  {
    id: "category-1",
    displayName: "Subscriptions",
    icon: "card-outline",
    iconLibrary: "Ionicons",
    color: null,
    isExpense: true,
  },
] as const;

function createInitialValues(
  overrides: Partial<RecurringPaymentFormValues> = {}
): RecurringPaymentFormValues {
  return {
    name: "Netflix",
    amount: "250",
    type: "EXPENSE",
    accountId: "account-1",
    categoryId: "category-1",
    frequency: "MONTHLY",
    startDate: new Date(2026, 5, 1, 8),
    endDate: null,
    reactivateAfterSaving: false,
    action: "NOTIFY",
    notes: "",
    ...overrides,
  };
}

function renderForm({
  mode = "create",
  initialValues = createInitialValues(),
  onSubmit = jest.fn(),
}: {
  readonly mode?: "create" | "edit";
  readonly initialValues?: RecurringPaymentFormValues;
  readonly onSubmit?: jest.Mock;
} = {}): jest.Mock {
  render(
    <RecurringPaymentForm
      mode={mode}
      initialValues={initialValues}
      accounts={accounts as unknown as readonly Account[]}
      expenseCategories={categories as unknown as readonly Category[]}
      incomeCategories={[]}
      isSubmitting={false}
      submitLabel="save"
      dueDate={mode === "edit" ? initialValues.startDate : undefined}
      onSubmit={onSubmit}
    />
  );

  return onSubmit;
}

function getLatestDatePickerProps(): MockDatePickerProps {
  const latestCall = mockDateTimePicker.mock.calls.at(-1);
  expect(latestCall).toBeDefined();

  const props = latestCall?.[0];
  expect(props).toBeDefined();
  return props as MockDatePickerProps;
}

function expectSameLocalDay(actual: Date | undefined, expected: Date): void {
  expect(actual).toBeDefined();
  if (actual) {
    expect(isSameLocalCalendarDay(actual, expected)).toBe(true);
  }
}

describe("RecurringPaymentForm physical-device QA", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.setSystemTime(new Date(2026, 5, 1, 12));
  });

  it("groups an amount typed character by character and submits the same canonical value", async () => {
    const onSubmit = renderForm({
      initialValues: createInitialValues({ amount: "" }),
    });
    const input = screen.getByTestId("recurring-payment-amount-input");

    const typingSteps = [
      ["1", "1"],
      ["12", "12"],
      ["123", "123"],
      ["1234", "1,234"],
      ["1,234.", "1,234."],
      ["1,234.5", "1,234.5"],
      ["1,234.50", "1,234.50"],
    ] as const;

    typingSteps.forEach(([entered, displayed]) => {
      fireEvent.changeText(input, entered);
      expect(screen.getByTestId("recurring-payment-amount-input")).toHaveProp(
        "value",
        displayed
      );
    });

    expect(screen.queryByText("amount_decimal_separator_error")).toBeNull();
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "1234.50" })
      );
    });
  });

  it("accepts a complete valid grouped paste without changing its meaning", async () => {
    const onSubmit = renderForm({
      initialValues: createInitialValues({ amount: "" }),
    });
    const input = screen.getByTestId("recurring-payment-amount-input");

    fireEvent.changeText(input, "1,234.50");
    fireEvent(input, "blur");

    expect(input).toHaveProp("value", "1,234.50");
    expect(screen.queryByText("amount_decimal_separator_error")).toBeNull();
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "1234.50" })
      );
    });
  });

  it("keeps comma-decimal text visible, blocks save, and clears guidance after correction", async () => {
    const onSubmit = renderForm({
      initialValues: createInitialValues({ amount: "" }),
    });
    const input = screen.getByTestId("recurring-payment-amount-input");

    fireEvent.changeText(input, "1");
    fireEvent.changeText(input, "12");
    fireEvent.changeText(input, "12,");
    expect(input).toHaveProp("value", "12,");

    fireEvent.changeText(input, "12,5");
    fireEvent(input, "blur");

    expect(input).toHaveProp("value", "12,5");
    expect(screen.getByText("amount_decimal_separator_error")).toBeTruthy();

    fireEvent.press(screen.getByText("save"));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });

    fireEvent.changeText(input, "12.5");
    expect(input).toHaveProp("value", "12.5");
    expect(screen.queryByText("amount_decimal_separator_error")).toBeNull();

    fireEvent.press(screen.getByText("save"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "12.5" })
      );
    });
  });

  it("does not show a premature error for a safe trailing-decimal typing state", () => {
    renderForm({ initialValues: createInitialValues({ amount: "" }) });
    const input = screen.getByTestId("recurring-payment-amount-input");

    fireEvent.changeText(input, "1");
    fireEvent.changeText(input, "12");
    fireEvent.changeText(input, "12.");

    expect(input).toHaveProp("value", "12.");
    expect(screen.queryByText("invalid_amount")).toBeNull();
    expect(screen.queryByText("amount_decimal_separator_error")).toBeNull();
  });

  it("makes both inclusive create Due-payment boundaries selectable", async () => {
    const onSubmit = renderForm({
      initialValues: createInitialValues({ startDate: new Date(2026, 5, 15) }),
    });

    fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));
    let pickerProps = getLatestDatePickerProps();
    expectSameLocalDay(pickerProps.minimumDate, new Date(2026, 5, 1));
    expectSameLocalDay(pickerProps.maximumDate, new Date(2027, 5, 1));

    fireEvent.press(screen.getByTestId("set-picker-minimum-date"));
    fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));
    pickerProps = getLatestDatePickerProps();
    expectSameLocalDay(pickerProps.maximumDate, new Date(2027, 5, 1));
    fireEvent.press(screen.getByTestId("set-picker-maximum-date"));
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: pickerProps.maximumDate })
      );
    });
  });

  it("clamps the picker maximum for a leap-day reference", () => {
    jest.setSystemTime(new Date(2028, 1, 29, 12));
    renderForm({
      initialValues: createInitialValues({ startDate: new Date(2028, 1, 29) }),
    });

    fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));
    const pickerProps = getLatestDatePickerProps();

    expectSameLocalDay(pickerProps.minimumDate, new Date(2028, 1, 29));
    expectSameLocalDay(pickerProps.maximumDate, new Date(2029, 1, 28));
  });

  it.each([
    ["past", new Date(2025, 4, 15)],
    ["far-future", new Date(2028, 4, 15)],
  ] as const)(
    "preserves an unchanged %s legacy Due payment when the constrained picker is cancelled",
    async (_label, legacyDueDate) => {
      const initialValues = createInitialValues({ startDate: legacyDueDate });
      const onSubmit = renderForm({
        mode: "edit",
        initialValues,
      });

      fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));
      const pickerProps = getLatestDatePickerProps();

      expectSameLocalDay(pickerProps.minimumDate, new Date(2026, 5, 1));
      expectSameLocalDay(pickerProps.maximumDate, new Date(2027, 5, 1));
      expectSameLocalDay(pickerProps.value, new Date(2026, 5, 1));

      fireEvent.press(screen.getByTestId("dismiss-recurring-date-picker"));
      fireEvent.press(screen.getByText("save"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ startDate: legacyDueDate })
        );
      });
    }
  );

  it("sets End-date minimum to Due payment without inventing a maximum", async () => {
    const dueDate = new Date(2026, 6, 15);
    const onSubmit = renderForm({
      initialValues: createInitialValues({ startDate: dueDate }),
    });

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row"));
    const pickerProps = getLatestDatePickerProps();

    expectSameLocalDay(pickerProps.minimumDate, dueDate);
    expect(pickerProps.maximumDate).toBeUndefined();
    fireEvent.press(screen.getByTestId("set-picker-minimum-date"));
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: dueDate })
      );
    });
  });

  it("retains form validation as defense when Due payment is after End date", async () => {
    const onSubmit = renderForm({
      initialValues: createInitialValues({
        startDate: new Date(2026, 6, 16),
        endDate: new Date(2026, 6, 15),
      }),
    });

    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(screen.getByText("end_date_before_due")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
