import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";

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
