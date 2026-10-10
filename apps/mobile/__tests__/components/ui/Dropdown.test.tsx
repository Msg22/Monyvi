import { fireEvent, render, screen } from "@testing-library/react-native";
import React, { type ReactNode } from "react";
import { Text } from "react-native";

import {
  Dropdown,
  type DropdownItem,
} from "@/components/ui/Dropdown";

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string =>
      key === "required_field" ? "Required field" : key,
  }),
}));

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

interface RepairDropdownProps<T extends string | number> {
  readonly variant?: "default" | "outlined";
  readonly label: string;
  readonly required?: boolean;
  readonly accessibilityHint?: string;
  readonly items: ReadonlyArray<DropdownItem<T>>;
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly placeholder?: string;
  readonly testID?: string;
  readonly selectedAdornment?: ReactNode;
  readonly triggerClassName?: string;
  readonly error?: string;
}

const RepairDropdown = Dropdown as unknown as <T extends string | number>(
  props: RepairDropdownProps<T>
) => React.JSX.Element;

const ACCOUNT_ITEMS: readonly DropdownItem<string>[] = [
  { value: "cash-1", label: "Cash" },
  { value: "bank-1", label: "Bank" },
];

describe("Dropdown repair contract", () => {
  it("represents a required missing entity with null and the placeholder", () => {
    render(
      <RepairDropdown
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
      "accessibilityHint",
      "Required field"
    );
  });

  it("renders a typed selected adornment without replacing the selected label", () => {
    render(
      <RepairDropdown
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

  it("accepts the approved 56dp trigger geometry without changing the default variant", () => {
    const { rerender } = render(
      <RepairDropdown
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

    expect(screen.getByTestId("account-dropdown-trigger")).toHaveProp(
      "className",
      expect.stringContaining("min-h-14")
    );

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

    expect(screen.getByTestId("legacy-dropdown-trigger")).toHaveProp(
      "className",
      "p-4"
    );
  });

  it("renders shared inline error semantics and error border", () => {
    render(
      <RepairDropdown
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
    expect(screen.getByTestId("account-dropdown-control")).toHaveProp(
      "className",
      expect.stringContaining("border-red-500")
    );
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
