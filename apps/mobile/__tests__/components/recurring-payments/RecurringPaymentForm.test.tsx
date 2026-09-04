/* eslint-disable max-lines -- Existing form integration fixtures are consolidated pending a dedicated test-structure refactor. */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import React from "react";
import {
  Keyboard,
  ScrollView,
  View,
  type EmitterSubscription,
} from "react-native";

const mockAccountModal = jest.fn();
const mockCategoryModal = jest.fn();
const mockFrequencyModal = jest.fn();
let mockUsesCompactLayout = false;
const mockScrollTo = jest.fn<
  void,
  [{ readonly animated?: boolean; readonly y?: number }]
>();
let keyboardShowListener:
  | ((event: { readonly endCoordinates: { readonly height: number } }) => void)
  | null = null;

jest
  .spyOn(Keyboard, "addListener")
  .mockImplementation((eventName, listener): EmitterSubscription => {
    if (eventName === "keyboardDidShow") {
      keyboardShowListener = listener as typeof keyboardShowListener;
    }

    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });

jest.spyOn(View.prototype, "measureInWindow").mockImplementation((callback) => {
  callback(0, 2000, 320, 72);
});

jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation((options) => {
  if (typeof options === "object" && options) {
    mockScrollTo(options);
  }
});

jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: ({
    onChange,
  }: {
    readonly onChange: (event: { readonly type: "set" }, date: Date) => void;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <ReactNative.Pressable
        testID="set-recurring-payment-date-july-15"
        onPress={() =>
          onChange(
            { type: "set" },
            new Date("2026-07-15T00:00:00.000Z")
          )
        }
      />
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
  useTheme: (): { readonly isDark: true } => ({ isDark: true }),
}));

jest.mock("@/constants/ui", () => ({
  shouldUseCompactLayout: (): boolean => mockUsesCompactLayout,
}));

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (props: { readonly visible: boolean }): null => {
    mockAccountModal(props.visible);
    return null;
  },
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (props: { readonly visible: boolean }): null => {
    mockCategoryModal(props.visible);
    return null;
  },
}));

jest.mock("@/components/modals/FrequencyPickerModal", () => ({
  FrequencyPickerModal: (props: {
    readonly visible: boolean;
    readonly onSelect: (frequency: "WEEKLY") => void;
  }): React.JSX.Element | null => {
    mockFrequencyModal(props.visible);
    if (!props.visible) return null;

    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");

    return (
      <ReactNative.Pressable
        testID="select-weekly-frequency"
        onPress={() => props.onSelect("WEEKLY")}
      >
        <ReactNative.Text>weekly</ReactNative.Text>
      </ReactNative.Pressable>
    );
  },
  getFrequencyLabel: (frequency: string): string => frequency,
}));

jest.mock("@/components/common/CategoryIcon", () => ({
  CategoryIcon: (): null => null,
}));

jest.mock("@expo/vector-icons", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({
      color,
      name,
    }: {
      readonly color?: string;
      readonly name: string;
    }): React.JSX.Element => (
      <ReactNative.Text testID={`icon-${name}`}>{color ?? ""}</ReactNative.Text>
    ),
  };
});

import {
  RecurringPaymentForm,
  type RecurringPaymentFormHandle,
  type RecurringPaymentFormValues,
} from "@/components/recurring-payments/RecurringPaymentForm";
import { palette } from "@/constants/colors";
import type { Account, Category } from "@monyvi/db";

const initialValues: RecurringPaymentFormValues = {
  name: "Netflix",
  amount: "250",
  type: "EXPENSE",
  accountId: "account-1",
  categoryId: "category-1",
  frequency: "MONTHLY",
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: null,
  reactivateAfterSaving: false,
  action: "NOTIFY",
  notes: "",
};

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

const childCategory = {
  id: "category-child",
  displayName: "Streaming",
  icon: "film-outline",
  iconLibrary: "Ionicons",
  color: null,
  isExpense: true,
} as const;

function renderForm(
  overrides: Partial<React.ComponentProps<typeof RecurringPaymentForm>> = {}
): ReturnType<typeof render> {
  return render(
    <RecurringPaymentForm
      mode="create"
      initialValues={initialValues}
      accounts={accounts as unknown as readonly Account[]}
      expenseCategories={categories as unknown as readonly Category[]}
      incomeCategories={[]}
      isSubmitting={false}
      submitLabel="save"
      onSubmit={jest.fn()}
      {...overrides}
    />
  );
}

describe("RecurringPaymentForm", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockScrollTo.mockClear();
    keyboardShowListener = null;
    mockUsesCompactLayout = false;
  });

  it("renders the approved shared add/edit sections", () => {
    renderForm();

    expect(screen.getByTestId("recurring-payment-summary-card")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-type-tabs")).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-details-section")
    ).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-schedule-section")
    ).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-action-section")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-notes-section")).toBeTruthy();
    expect(screen.queryByTestId("recurring-payment-edit-actions")).toBeNull();
  });

  it("opens the selector modals from the grouped schedule rows", () => {
    renderForm();

    fireEvent.press(screen.getByTestId("recurring-payment-account-row"));
    fireEvent.press(screen.getByTestId("recurring-payment-category-row"));
    fireEvent.press(screen.getByTestId("recurring-payment-frequency-row"));

    expect(mockAccountModal).toHaveBeenLastCalledWith(true);
    expect(mockCategoryModal).toHaveBeenLastCalledWith(true);
    expect(mockFrequencyModal).toHaveBeenLastCalledWith(true);
  });

  it("renders optional end date guidance and clears a selected end date", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const selectedEndDate = new Date("2026-08-01T00:00:00.000Z");

    renderForm({
      initialValues: { ...initialValues, endDate: selectedEndDate },
      onSubmit,
    });

    expect(screen.getByText("due_payment_hint")).toBeTruthy();
    expect(screen.getByText("end_date_hint")).toBeTruthy();
    expect(screen.getByText("optional")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-end-date-row-action")).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-end-date-row-value-action")
    ).toHaveProp("className", expect.stringContaining("items-end"));

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row-action"));
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: null })
      );
    });
  });

  it("stacks selected End date action at compact layout widths", () => {
    mockUsesCompactLayout = true;
    renderForm({
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-08-01T00:00:00.000Z"),
      },
    });

    expect(
      screen.getByTestId("recurring-payment-end-date-row-controls")
    ).toHaveProp("className", expect.stringContaining("self-end mt-2"));
  });

  it("shows pause/resume and delete actions only in edit mode", () => {
    renderForm({
      mode: "edit",
      status: "ACTIVE",
      onPauseToggle: jest.fn(),
      onDelete: jest.fn(),
    });

    expect(screen.getByTestId("recurring-payment-edit-actions")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-pause-action")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-delete-action")).toBeTruthy();
  });

  it("hides pause and resume actions for completed payments", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      onPauseToggle: jest.fn(),
      onDelete: jest.fn(),
    });

    expect(screen.getByTestId("recurring-payment-edit-actions")).toBeTruthy();
    expect(screen.queryByTestId("recurring-payment-pause-action")).toBeNull();
    expect(screen.getByTestId("recurring-payment-delete-action")).toBeTruthy();
  });

  it("updates the summary due date after schedule edits", () => {
    renderForm({
      mode: "edit",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(
      screen.getByTestId("recurring-payment-summary-due-value")
    ).toHaveTextContent("Jul 1, 2026");

    fireEvent.press(screen.getByTestId("recurring-payment-frequency-row"));
    fireEvent.press(screen.getByTestId("select-weekly-frequency"));

    expect(screen.getByTestId("recurring-payment-summary-due-value")).toHaveTextContent("Jul 8, 2026");
  });

  it("keeps the final paid date in the summary when frequency changes on a completed bounded payment", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    fireEvent.press(screen.getByTestId("recurring-payment-frequency-row"));
    fireEvent.press(screen.getByTestId("select-weekly-frequency"));

    expect(
      screen.getByTestId("recurring-payment-summary-due-value")
    ).toHaveTextContent("Jul 1, 2026");
  });

  it("keeps a completed payment completed in the preview when End date is relaxed", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    fireEvent.press(screen.getByTestId("recurring-payment-frequency-row"));
    fireEvent.press(screen.getByTestId("select-weekly-frequency"));
    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row-action"));

    expect(
      screen.getByTestId("recurring-payment-summary-due-value")
    ).toHaveTextContent("Jul 1, 2026");
  });

  it("shows a save-time reactivation choice only for completed edit payments", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-08-15T00:00:00.000Z"),
      },
    });

    expect(
      screen.getByTestId("recurring-payment-reactivate-after-saving")
    ).toBeTruthy();
    expect(screen.getByText("reactivate_after_saving")).toBeTruthy();
  });

  it("keeps the stored occurrence in the reactivation preview after a boundary shortened before it", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-08-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row-action"));
    fireEvent.press(
      screen.getByTestId("recurring-payment-reactivate-after-saving")
    );

    expect(
      screen.getByTestId("recurring-payment-summary-due-value")
    ).toHaveTextContent("Aug 1, 2026");
  });

  it("disables save-time reactivation when the next payment is after End date", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    expect(
      screen.getByTestId("recurring-payment-reactivate-after-saving")
    ).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByText("reactivate_payment_unavailable")).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-reactivate-after-saving")
    ).toHaveStyle({ opacity: 0.5 });
  });

  it("enables save-time reactivation when edited Due payment is eligible", () => {
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row"));
    fireEvent.press(screen.getByTestId("set-recurring-payment-date-july-15"));
    fireEvent.press(screen.getByTestId("recurring-payment-start-date-row"));
    fireEvent.press(screen.getByTestId("set-recurring-payment-date-july-15"));

    expect(
      screen.getByTestId("recurring-payment-reactivate-after-saving")
    ).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: false })
    );
  });

  it("clears reactivation intent when a later End date change makes it unavailable", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderForm({
      mode: "edit",
      status: "COMPLETED",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      initialValues: {
        ...initialValues,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      },
      onSubmit,
    });

    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row-action"));
    fireEvent.press(screen.getByTestId("recurring-payment-reactivate-after-saving"));
    fireEvent.press(screen.getByTestId("recurring-payment-end-date-row"));
    fireEvent.press(screen.getByTestId("set-recurring-payment-date-july-15"));

    await waitFor(() => {
      expect(
        screen.getByTestId("recurring-payment-reactivate-after-saving")
      ).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ checked: false, disabled: true })
      );
    });
    fireEvent.press(screen.getByText("save"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ reactivateAfterSaving: false })
      );
    });
  });

  it("explains when a valid bounded schedule has no further eligible recurrence", () => {
    renderForm({
      initialValues: {
        ...initialValues,
        frequency: "WEEKLY",
        startDate: new Date("2026-08-25T00:00:00.000Z"),
        endDate: new Date("2026-08-27T00:00:00.000Z"),
      },
    });

    expect(screen.getByText("end_date_no_further_payments")).toBeTruthy();
  });

  it("shows End date guidance immediately when Due payment is outside the allowed period", () => {
    renderForm({
      initialValues: {
        ...initialValues,
        startDate: new Date("2026-08-28T00:00:00.000Z"),
        endDate: new Date("2026-08-27T00:00:00.000Z"),
      },
    });

    expect(screen.getByText("end_date_before_due")).toBeTruthy();
  });

  it("guards against duplicate submissions while a submit is in flight", async () => {
    const onSubmit = jest.fn((): Promise<void> => new Promise(() => undefined));
    const ref = React.createRef<RecurringPaymentFormHandle>();

    render(
      <RecurringPaymentForm
        ref={ref}
        mode="create"
        initialValues={initialValues}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    act(() => {
      ref.current?.submit();
    });
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it("resyncs pristine form state when initial values change", () => {
    const { rerender } = render(
      <RecurringPaymentForm
        mode="edit"
        initialValues={initialValues}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    rerender(
      <RecurringPaymentForm
        mode="edit"
        initialValues={{
          ...initialValues,
          name: "Spotify",
          amount: "450",
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("Spotify")).toBeTruthy();
    expect(screen.getByDisplayValue("450")).toBeTruthy();
  });

  it("keeps dirty local edits while merging untouched initial value changes", async () => {
    const onSubmit = jest.fn();
    const { rerender } = render(
      <RecurringPaymentForm
        mode="edit"
        initialValues={initialValues}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    fireEvent.changeText(screen.getByDisplayValue("Netflix"), "Local edit");
    rerender(
      <RecurringPaymentForm
        mode="edit"
        initialValues={{
          ...initialValues,
          name: "Spotify",
          amount: "450",
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByDisplayValue("Local edit")).toBeTruthy();
    expect(screen.getByDisplayValue("450")).toBeTruthy();

    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "450",
          name: "Local edit",
        })
      );
    });
  });

  it("keeps dirty local edits when submit reports failure", async () => {
    const onSubmit = jest.fn((): Promise<false> => Promise.resolve(false));
    const { rerender } = renderForm({ mode: "edit", onSubmit });

    fireEvent.changeText(screen.getByDisplayValue("Netflix"), "Local edit");
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Local edit" })
      );
    });

    rerender(
      <RecurringPaymentForm
        mode="edit"
        initialValues={{
          ...initialValues,
          name: "Remote update",
          amount: "450",
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByDisplayValue("Local edit")).toBeTruthy();
    expect(screen.getByDisplayValue("450")).toBeTruthy();
  });

  it("shows a selected subcategory from the full category list", () => {
    renderForm({
      initialValues: {
        ...initialValues,
        categoryId: "category-child",
      },
      allCategories: [
        ...categories,
        childCategory,
      ] as unknown as readonly Category[],
    });

    expect(screen.getAllByText("Streaming").length).toBeGreaterThan(0);
    expect(screen.queryByText("select_category")).toBeNull();
  });

  it("validates whitespace-only payment names as required", async () => {
    const ref = React.createRef<RecurringPaymentFormHandle>();
    const onSubmit = jest.fn();

    render(
      <RecurringPaymentForm
        ref={ref}
        mode="create"
        initialValues={{
          ...initialValues,
          name: "   ",
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    act(() => {
      ref.current?.submit();
    });

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prefixes the amount input with the selected account currency", () => {
    renderForm();

    expect(
      screen.getByTestId("recurring-payment-amount-currency-prefix")
    ).toHaveTextContent("EGP");
  });

  it("renders the amount field as a full-width row below the name", () => {
    renderForm();

    expect(screen.getByTestId("recurring-payment-amount-field")).toHaveProp(
      "className",
      expect.stringContaining("w-full")
    );
  });

  it("scrolls the amount field above the numeric keyboard when focused", async () => {
    renderForm();

    fireEvent(screen.getByTestId("recurring-payment-amount-input"), "focus");
    keyboardShowListener?.({ endCoordinates: { height: 300 } });

    await waitFor(() => {
      expect(mockScrollTo).toHaveBeenCalled();
    });
    const scrollOptions = mockScrollTo.mock.calls[0]?.[0];

    expect(scrollOptions?.animated).toBe(true);
    expect(typeof scrollOptions?.y).toBe("number");
  });

  it("scrolls to the first visible validation error when submitted from the header", async () => {
    const ref = React.createRef<RecurringPaymentFormHandle>();
    render(
      <RecurringPaymentForm
        ref={ref}
        mode="create"
        initialValues={{
          ...initialValues,
          categoryId: null,
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );
    mockScrollTo.mockClear();

    act(() => {
      ref.current?.submit();
    });

    await waitFor(() => {
      expect(screen.getByText("Category is required")).toBeTruthy();
      expect(mockScrollTo).toHaveBeenCalled();
    });
    expect(screen.getByText("Category is required")).toHaveProp(
      "className",
      expect.stringContaining("input-error")
    );
  });

  it("scrolls to End date error when Due payment moves after it", async () => {
    const ref = React.createRef<RecurringPaymentFormHandle>();

    render(
      <RecurringPaymentForm
        ref={ref}
        mode="create"
        initialValues={{
          ...initialValues,
          startDate: new Date("2026-08-02T00:00:00.000Z"),
          endDate: new Date("2026-08-01T00:00:00.000Z"),
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );

    mockScrollTo.mockClear();
    act(() => {
      ref.current?.submit();
    });

    await waitFor(() => {
      expect(screen.getByText("end_date_before_due")).toBeTruthy();
      expect(mockScrollTo).toHaveBeenCalled();
    });
  });

  it("scrolls upward when the first validation error is above the viewport", async () => {
    const ref = React.createRef<RecurringPaymentFormHandle>();
    jest
      .spyOn(View.prototype, "measureInWindow")
      .mockImplementationOnce((callback) => {
        callback(0, 8, 320, 72);
      });

    const view = render(
      <RecurringPaymentForm
        ref={ref}
        mode="create"
        initialValues={{
          ...initialValues,
          name: "",
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
      />
    );
    fireEvent.scroll(view.UNSAFE_getByType(ScrollView), {
      nativeEvent: { contentOffset: { y: 300 } },
    });
    mockScrollTo.mockClear();

    act(() => {
      ref.current?.submit();
    });

    await waitFor(() => {
      expect(mockScrollTo).toHaveBeenCalled();
    });
    const scrollOptions = mockScrollTo.mock.calls[0]?.[0];

    expect(scrollOptions?.animated).toBe(true);
    expect(typeof scrollOptions?.y).toBe("number");
    expect(scrollOptions?.y).toBeLessThan(300);
  });

  it("renders payment action choices as compact options", () => {
    renderForm();

    expect(screen.queryByText("notify_me_description")).toBeNull();
    expect(screen.queryByText("auto_create_description")).toBeNull();
    expect(screen.getByTestId("recurring-payment-action-NOTIFY")).toBeTruthy();
  });

  it("places summary status in the header and amount details below", () => {
    renderForm();

    expect(screen.getByTestId("recurring-payment-summary-status")).toHaveProp(
      "className",
      expect.stringContaining("py-1.5")
    );
    expect(screen.getByTestId("recurring-payment-summary-details")).toHaveProp(
      "className",
      expect.stringContaining("mt-5")
    );
    expect(
      screen.getByTestId("recurring-payment-summary-divider")
    ).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-summary-next-due")
    ).toBeTruthy();
  });

  it("aligns summary amount and next due values with matching typography", () => {
    renderForm();

    expect(screen.getByText("next_due")).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-summary-amount-value")
    ).toHaveProp("className", expect.stringContaining("text-lg font-bold"));
    expect(
      screen.getByTestId("recurring-payment-summary-due-value")
    ).toHaveProp("className", expect.stringContaining("text-lg font-bold"));
    expect(
      screen.getByTestId("recurring-payment-summary-amount-label")
    ).toHaveProp("className", expect.not.stringContaining("uppercase"));
    expect(
      screen.getByTestId("recurring-payment-summary-amount-label")
    ).toHaveProp("className", expect.not.stringContaining("font-bold"));
    expect(
      screen.getByTestId("recurring-payment-summary-next-due-label")
    ).toHaveProp("className", expect.not.stringContaining("uppercase"));
    expect(
      screen.getByTestId("recurring-payment-summary-next-due-label")
    ).toHaveProp("className", expect.not.stringContaining("font-bold"));
  });

  it("uses status-specific summary pill colors", () => {
    renderForm({ status: "PAUSED" });

    expect(screen.getByTestId("recurring-payment-summary-status")).toHaveProp(
      "className",
      expect.stringContaining("bg-slate-25")
    );
    expect(screen.getByTestId("recurring-payment-summary-status")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-700")
    );
  });

  it("renders the summary amount with suffix currency and divider spacing", () => {
    renderForm();

    expect(
      screen.getByTestId("recurring-payment-summary-amount-value")
    ).toHaveTextContent("-250 EGP");
    expect(screen.getByTestId("recurring-payment-summary-amount")).toHaveProp(
      "className",
      expect.stringContaining("flex-1 pe-8")
    );
    expect(screen.getByTestId("recurring-payment-summary-next-due")).toHaveProp(
      "className",
      expect.stringContaining("flex-1 ps-12")
    );
    expect(screen.getByTestId("recurring-payment-summary-divider")).toHaveProp(
      "className",
      expect.stringContaining("ms-1 me-3")
    );
  });

  it("preserves fractional amounts in the summary", () => {
    renderForm({
      initialValues: {
        ...initialValues,
        amount: "1234.56",
      },
    });

    expect(
      screen.getByTestId("recurring-payment-summary-amount-value")
    ).toHaveTextContent("-1,234.56 EGP");
  });

  it("uses shared currency formatting for prefixed currencies in the summary", () => {
    renderForm({
      accounts: [
        {
          ...accounts[0],
          currency: "USD",
        },
      ] as unknown as readonly Account[],
      initialValues: {
        ...initialValues,
        amount: "1234.5",
      },
    });

    expect(
      screen.getByTestId("recurring-payment-summary-amount-value")
    ).toHaveTextContent("-$1,234.50");
  });

  it("shows a calendar icon beside the next due date", () => {
    renderForm();

    expect(
      screen.getByTestId("recurring-payment-summary-due-icon")
    ).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-summary-due-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(screen.getByTestId("recurring-payment-summary-due-icon")).toHaveProp(
      "className",
      expect.stringContaining("me-2")
    );
  });

  it("shows the frequency with the payment type in title case", () => {
    renderForm();

    expect(screen.getAllByText("Monthly Expense")).toHaveLength(2);
  });

  it("uses full schedule dividers instead of text-only dividers", () => {
    renderForm();

    expect(screen.getByTestId("recurring-payment-divider-0")).toHaveProp(
      "className",
      expect.stringContaining("mx-4")
    );
  });

  it("uses the same green schedule icon styling for all schedule rows", () => {
    renderForm();
    [
      "recurring-payment-account-row-icon",
      "recurring-payment-category-row-icon",
      "recurring-payment-frequency-row-icon",
      "recurring-payment-start-date-row-icon",
    ].forEach((testID: string) => {
      expect(screen.getByTestId(testID)).toHaveProp(
        "className",
        expect.stringContaining("bg-nileGreen-100"));
    });
  });

  it("renders the payment action helper description", () => {
    renderForm();

    expect(screen.getByText("payment_action_description")).toBeTruthy();
  });

  it("uses the shared field-label style for section titles", () => {
    renderForm();

    expect(screen.getByTestId("recurring-payment-schedule-title")).toHaveProp(
      "className",
      expect.stringContaining("input-label")
    );
    expect(screen.getByTestId("recurring-payment-action-title")).toHaveProp(
      "className",
      expect.stringContaining("input-label")
    );
  });

  it("formats amount input with separators while submitting the clean value", async () => {
    const onSubmit = jest.fn();
    renderForm({
      initialValues: {
        ...initialValues,
        amount: "12500",
      },
      onSubmit,
    });

    expect(screen.getByDisplayValue("12,500")).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue("12,500"), "99,999.50");
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: "99999.50" })
      );
    });
  });

  it("defaults to the first account when account data arrives after mount", async () => {
    const onSubmit = jest.fn();
    const { rerender } = render(
      <RecurringPaymentForm
        mode="create"
        initialValues={{
          ...initialValues,
          accountId: null,
        }}
        accounts={[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    rerender(
      <RecurringPaymentForm
        mode="create"
        initialValues={{
          ...initialValues,
          accountId: "account-1",
        }}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Cash")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "account-1" })
      );
    });
  });

  it("exposes submit through the form ref", async () => {
    const onSubmit = jest.fn();
    const ref = React.createRef<RecurringPaymentFormHandle>();
    render(
      <RecurringPaymentForm
        ref={ref}
        mode="create"
        initialValues={initialValues}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={onSubmit}
      />
    );

    ref.current?.submit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Netflix" })
      );
    });
  });

  it("renders icon-bearing edit actions", () => {
    renderForm({
      mode: "edit",
      status: "PAUSED",
      onPauseToggle: jest.fn(),
      onDelete: jest.fn(),
    });

    expect(screen.getByTestId("recurring-payment-resume-icon")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-delete-icon")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-pause-chevron")).toBeTruthy();
    expect(screen.getByTestId("recurring-payment-delete-chevron")).toBeTruthy();
    expect(
      screen.getByTestId("recurring-payment-pause-action-content")
    ).toHaveProp("className", expect.not.stringContaining("border"));
    expect(screen.getByTestId("recurring-payment-save-separator")).toBeTruthy();
  });

  it("uses yellow for pause and green for resume action icons", () => {
    const { rerender } = render(
      <RecurringPaymentForm
        mode="edit"
        status="ACTIVE"
        initialValues={initialValues}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
        onPauseToggle={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByTestId("icon-pause-circle-outline")).toHaveTextContent(
      palette.gold[600]
    );

    rerender(
      <RecurringPaymentForm
        mode="edit"
        status="PAUSED"
        initialValues={initialValues}
        accounts={accounts as unknown as readonly Account[]}
        expenseCategories={categories as unknown as readonly Category[]}
        incomeCategories={[]}
        isSubmitting={false}
        submitLabel="save"
        onSubmit={jest.fn()}
        onPauseToggle={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByTestId("icon-play-circle-outline")).toHaveTextContent(
      palette.nileGreen[500]
    );
  });

  it("uses New Payment as the card fallback title", () => {
    renderForm({
      initialValues: {
        ...initialValues,
        name: "",
      },
    });

    expect(screen.getByText("new_payment")).toBeTruthy();
  });
});
