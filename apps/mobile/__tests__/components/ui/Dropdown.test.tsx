import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";

let mockDropdownLocale: "en" | "ar" = "en";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: mockDropdownLocale },
    t: (key: string): string =>
      key === "required_field"
        ? mockDropdownLocale === "ar"
          ? "حقل مطلوب"
          : "Required field"
        : key,
  }),
}));

afterEach((): void => {
  mockDropdownLocale = "en";
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: false } => ({ isDark: false }),
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 0,
}));

jest.mock("expo-blur", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    BlurView: ({
      children,
    }: {
      readonly children?: import("react").ReactNode;
    }): React.JSX.Element =>
      ReactActual.createElement(Native.View, null, children),
  };
});

jest.mock("@expo/vector-icons", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      ReactActual.createElement(
        Native.Text,
        { testID: `dropdown-icon-${name}` },
        name
      ),
  };
});

const ACCOUNT_ITEMS: ReadonlyArray<DropdownItem<string>> = [
  { value: "cash-1", label: "Cash" },
  { value: "bank-1", label: "Bank" },
];

function getTouchableProps(testID: string): Record<string, unknown> {
  const node: unknown = getTestInstances(
    screen.UNSAFE_getAllByType(TouchableOpacity)
  ).find(
    (candidate: unknown) => getTestInstanceProps(candidate).testID === testID
  );
  if (!node) throw new Error(`Touchable ${testID} not found`);
  return getTestInstanceProps(node);
}

function getViewProps(testID: string): Record<string, unknown> {
  const node: unknown = getTestInstances(screen.UNSAFE_getAllByType(View)).find(
    (candidate: unknown) => getTestInstanceProps(candidate).testID === testID
  );
  if (!node) throw new Error(`View ${testID} not found`);
  return getTestInstanceProps(node);
}

function getNativeTextProps(content: string): Record<string, unknown> {
  const node: unknown = getTestInstances(screen.UNSAFE_getAllByType(Text)).find(
    (candidate: unknown) => getTestInstanceProps(candidate).children === content
  );
  if (!node) throw new Error(`Native Text "${content}" not found`);
  return getTestInstanceProps(node);
}

describe("Dropdown repair contract", () => {
  it("represents a required missing entity with null and the placeholder", () => {
    render(
      <Dropdown
        variant="outlined"
        label="Account"
        required
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        placeholder="Select account"
        testID="account-dropdown"
      />
    );

    expect(screen.getByText("Account *")).toBeTruthy();
    expect(screen.getByText("Select account")).toBeTruthy();
    expect(screen.getByTestId("account-dropdown-trigger")).toHaveProp(
      "accessibilityLabel",
      "Account, Required field"
    );
    expect(screen.getByTestId("account-dropdown-trigger")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByTestId("account-dropdown-trigger")).not.toHaveProp(
      "accessibilityHint",
      "Required field"
    );
  });

  it("renders a typed selected adornment without replacing the selected label", () => {
    render(
      <Dropdown
        variant="outlined"
        label="Account"
        items={ACCOUNT_ITEMS}
        value="cash-1"
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        selectedAdornment={<Text testID="selected-account-icon">wallet</Text>}
        testID="account-dropdown"
      />
    );

    expect(screen.getByTestId("selected-account-icon")).toBeTruthy();
    expect(screen.getByText("Cash")).toBeTruthy();
  });

  it("keeps a long selected label shrinkable so the chevron remains visible", () => {
    const longLabel =
      "Very long account name that must truncate before the dropdown chevron";

    render(
      <Dropdown
        variant="outlined"
        label="Account"
        items={[{ value: "long-account", label: longLabel }]}
        value="long-account"
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        testID="long-account-dropdown"
      />
    );

    const selectedLabel: unknown = screen.getByText(longLabel);
    expect(selectedLabel).toHaveProp("numberOfLines", 1);
    const selectedLabelClassName = getNativeTextProps(longLabel)
      .className as string;
    expect(selectedLabelClassName).toContain("min-w-0");
    expect(selectedLabelClassName).toContain("flex-1");
    expect(screen.getByTestId("dropdown-icon-chevron-down")).toBeTruthy();
  });

  it("accepts the approved 56dp trigger geometry without changing the default variant", () => {
    const { rerender } = render(
      <Dropdown
        variant="outlined"
        label="Account"
        items={ACCOUNT_ITEMS}
        value="cash-1"
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        triggerClassName="min-h-14"
        testID="account-dropdown"
      />
    );

    expect(
      getTouchableProps("account-dropdown-trigger").className as string
    ).toContain("min-h-14");

    rerender(
      <Dropdown
        label="Account"
        items={ACCOUNT_ITEMS}
        value="cash-1"
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        testID="legacy-dropdown"
      />
    );

    expect(
      getTouchableProps("legacy-dropdown-trigger").className as string
    ).toContain("p-4");
    expect(
      getTouchableProps("legacy-dropdown-trigger").className as string
    ).not.toContain("min-h-14");
  });

  it("renders shared inline error semantics and error border", () => {
    render(
      <Dropdown
        variant="outlined"
        label="Account"
        required
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        error="Account is required"
        testID="account-dropdown"
      />
    );

    expect(
      screen.getByRole("alert", { name: "Account is required" })
    ).toBeTruthy();
    expect(
      getViewProps("account-dropdown-control").className as string
    ).toContain("border-red-500");
  });

  it("preserves existing inline selection and toggle behavior", () => {
    const onChange = jest.fn();
    const onToggle = jest.fn();

    render(
      <Dropdown
        label="Account"
        items={ACCOUNT_ITEMS}
        value="cash-1"
        onChange={onChange}
        isOpen
        onToggle={onToggle}
        testID="legacy-dropdown"
      />
    );

    fireEvent.press(screen.getByTestId("legacy-dropdown-option-bank-1"));

    expect(onChange).toHaveBeenCalledWith("bank-1");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
describe("T007 Dropdown required names and feedback precedence", () => {
  it.each([
    ["en", "Account", "Account, Required field"],
    ["ar", "الحساب", "الحساب، حقل مطلوب"],
  ] as const)(
    "exposes one required accessible name on the %s selection trigger",
    (locale, label, expectedName) => {
      mockDropdownLocale = locale;
      render(
        <Dropdown
          label={label}
          required
          items={ACCOUNT_ITEMS}
          value={null}
          onChange={jest.fn()}
          isOpen={false}
          onToggle={jest.fn()}
          testID="required-selector"
        />
      );

      const trigger = screen.getByTestId("required-selector-trigger");
      expect(trigger).toHaveProp("accessibilityRole", "button");
      expect(trigger).toHaveProp("accessibilityLabel", expectedName);
      expect(trigger).not.toHaveProp(
        "accessibilityHint",
        locale === "ar" ? "حقل مطلوب" : "Required field"
      );
      expect(screen.getByText(label + " *")).toBeTruthy();
    }
  );

  it.each([
    ["en", "Account", "Custom account, Required field"],
    ["ar", "الحساب", "الحساب المخصص، حقل مطلوب"],
  ] as const)(
    "preserves a prequalified explicit accessible override once in %s",
    (locale, label, override) => {
      mockDropdownLocale = locale;
      render(
        <Dropdown
          label={label}
          required
          accessibilityLabel={override}
          items={ACCOUNT_ITEMS}
          value={null}
          onChange={jest.fn()}
          isOpen={false}
          onToggle={jest.fn()}
          testID="override-selector"
        />
      );

      expect(screen.getByTestId("override-selector-trigger")).toHaveProp(
        "accessibilityLabel",
        override
      );
    }
  );

  it("appends requiredness to an unqualified override without a duplicate hint", () => {
    render(
      <Dropdown
        label="Account"
        accessibilityLabel="Choose source account"
        required
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        testID="unqualified-selector"
      />
    );

    const trigger = screen.getByTestId("unqualified-selector-trigger");
    expect(trigger).toHaveProp(
      "accessibilityLabel",
      "Choose source account, Required field"
    );
    expect(trigger).not.toHaveProp("accessibilityHint", "Required field");
  });

  it("retains an actionable custom hint while requiredness is part of the name", () => {
    render(
      <Dropdown
        label="Account"
        required
        accessibilityHint="Select an account to continue"
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        testID="hint-selector"
      />
    );

    const trigger = screen.getByTestId("hint-selector-trigger");
    expect(trigger).toHaveProp("accessibilityLabel", "Account, Required field");
    expect(trigger).toHaveProp(
      "accessibilityHint",
      "Select an account to continue"
    );
  });

  it("leaves optional selection accessible without the required qualifier", () => {
    render(
      <Dropdown
        label="Optional provider"
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        placeholder="Choose provider"
        testID="optional-selector"
      />
    );

    const trigger = screen.getByTestId("optional-selector-trigger");
    expect(trigger).toHaveProp("accessibilityRole", "button");
    expect(trigger).toHaveProp("accessibilityLabel", "Optional provider");
    expect(screen.getByText("Choose provider")).toBeTruthy();
    expect(screen.queryByText("Optional provider *")).toBeNull();
  });

  it("retains selected adornment, typed onChange and required naming during selection", () => {
    const onChange = jest.fn();
    render(
      <Dropdown
        label="Account"
        required
        items={ACCOUNT_ITEMS}
        value="cash-1"
        onChange={onChange}
        isOpen
        onToggle={jest.fn()}
        selectedAdornment={<Text testID="foundation-selected-icon">wallet</Text>}
        testID="typed-selector"
      />
    );

    expect(screen.getByTestId("typed-selector-trigger")).toHaveProp(
      "accessibilityLabel",
      "Account, Required field"
    );
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByTestId("foundation-selected-icon")).toBeTruthy();
    fireEvent.press(screen.getByTestId("typed-selector-option-bank-1"));
    expect(onChange).toHaveBeenCalledWith("bank-1");
  });

  it("prioritizes the existing error alert above warning/helper text", () => {
    render(
      <Dropdown
        label="Account"
        required
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={jest.fn()}
        testID="error-priority"
        error="Select an account"
        warning="Advisory only"
        helperText="Additional explanation"
      />
    );

    expect(
      screen.getByRole("alert", { name: "Select an account" })
    ).toBeTruthy();
    expect(
      getViewProps("error-priority-control").className as string
    ).toContain("border-red-500");
    expect(screen.queryByText("Advisory only")).toBeNull();
    expect(screen.queryByText("Additional explanation")).toBeNull();
  });

  it("shows warning before helper without blocking selection or adding error styling", () => {
    const onToggle = jest.fn();
    const props = {
      label: "Account",
      items: ACCOUNT_ITEMS,
      value: null,
      onChange: jest.fn(),
      isOpen: false,
      onToggle,
      testID: "warning-selector",
    } as const;
    const { rerender } = render(
      <Dropdown
        {...props}
        warning="Review account choice"
        helperText="Account help"
      />
    );

    expect(screen.getByText("Review account choice")).toBeTruthy();
    expect(screen.queryByText("Account help")).toBeNull();
    expect(
      getViewProps("warning-selector-control").className as string
    ).not.toContain("border-red-500");
    fireEvent.press(screen.getByTestId("warning-selector-trigger"));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Dropdown {...props} helperText="Account help" />);
    expect(screen.getByText("Account help")).toBeTruthy();
    expect(screen.queryByText("Review account choice")).toBeNull();
  });

  it("preserves disabled trigger semantics and does not make it a locked display field", () => {
    const onToggle = jest.fn();
    render(
      <Dropdown
        label="Temporarily unavailable"
        disabled
        items={ACCOUNT_ITEMS}
        value={null}
        onChange={jest.fn()}
        isOpen={false}
        onToggle={onToggle}
        testID="disabled-selector"
      />
    );

    const trigger = getTouchableProps("disabled-selector-trigger");
    expect(trigger.disabled).toBe(true);
    expect(trigger.accessibilityRole).toBe("button");
    expect(trigger.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(screen.getByTestId("disabled-selector-trigger"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
