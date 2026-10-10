import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { I18nManager, Text, TextInput } from "react-native";

import { GroupedDecimalInput } from "@/components/ui/GroupedDecimalInput";
import { GroupedMoneyInput } from "@/components/ui/GroupedMoneyInput";
import { TextField } from "@/components/ui/TextField";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string): string =>
      key === "required_field" ? "Required field" : key,
  }),
}));

describe("GroupedDecimalInput", () => {
  it("formats value with thousands commas while preserving 3 decimal places without rounding", () => {
    render(
      <GroupedDecimalInput
        testID="weight-input"
        label="Weight"
        value="1250.755"
        onCanonicalChange={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("1,250.755")).toBeTruthy();
  });

  it("handles small decimals under 1000 without separators", () => {
    render(
      <GroupedDecimalInput
        testID="weight-input"
        label="Weight"
        value="10.125"
        onCanonicalChange={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("10.125")).toBeTruthy();
  });

  it("strips commas to report canonical dot-decimal on change", () => {
    const onCanonicalChange = jest.fn();
    render(
      <GroupedDecimalInput
        testID="weight-input"
        label="Weight"
        value=""
        onCanonicalChange={onCanonicalChange}
      />
    );

    fireEvent.changeText(screen.getByTestId("weight-input"), "1,500.250");
    expect(onCanonicalChange).toHaveBeenCalledWith("1500.250");
  });

  it("preserves invalid intermediate input for form-level validation", () => {
    const onCanonicalChange = jest.fn();
    render(
      <GroupedDecimalInput
        testID="weight-input"
        label="Weight"
        value="10.5"
        onCanonicalChange={onCanonicalChange}
      />
    );

    fireEvent.changeText(screen.getByTestId("weight-input"), "10.5.5");
    expect(onCanonicalChange).toHaveBeenCalledWith("10.5.5");
  });

  it("renders trailing adornment such as grams unit", () => {
    render(
      <GroupedDecimalInput
        testID="weight-input"
        label="Weight"
        value="50"
        trailingAdornment={<Text testID="unit-adornment">g</Text>}
        onCanonicalChange={jest.fn()}
      />
    );

    expect(screen.getByTestId("unit-adornment")).toBeTruthy();
  });

  it("renders required asterisk and localized accessibilityHint without aria-required", () => {
    render(
      <GroupedDecimalInput
        testID="weight-input"
        label="Weight"
        value="50"
        required
        onCanonicalChange={jest.fn()}
      />
    );

    expect(screen.getByText("Weight *")).toBeTruthy();
    expect(screen.getByTestId("weight-input")).toHaveProp(
      "accessibilityHint",
      "Required field"
    );
    expect(screen.getByTestId("weight-input")).not.toHaveProp("aria-required");
  });

  it("comma-groups WHILE typing focused without dropping draft keystrokes or decimal tail", () => {
    function ControlledTestInput(): React.JSX.Element {
      const [value, setValue] = React.useState("");
      return (
        <GroupedDecimalInput
          testID="controlled-price"
          label="Purchase price"
          value={value}
          onCanonicalChange={setValue}
        />
      );
    }

    render(<ControlledTestInput />);

    // Focus the input
    fireEvent(screen.getByTestId("controlled-price"), "focus", {});

    // Type '1'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "1");
    expect(screen.getByDisplayValue("1")).toBeTruthy();

    // Type '12'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "12");
    expect(screen.getByDisplayValue("12")).toBeTruthy();

    // Type '123'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "123");
    expect(screen.getByDisplayValue("123")).toBeTruthy();

    // Type '1234' -> should immediately format as 1,234 while focused
    fireEvent.changeText(screen.getByTestId("controlled-price"), "1234");
    expect(screen.getByDisplayValue("1,234")).toBeTruthy();

    // Successive typing appending '5' to '1,234' -> native text is '1,2345'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "1,2345");
    expect(screen.getByDisplayValue("12,345")).toBeTruthy();

    // Typing decimal point '.' -> '12,345.'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "12,345.");
    expect(screen.getByDisplayValue("12,345.")).toBeTruthy();

    // Typing '6' -> '12,345.6'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "12,345.6");
    expect(screen.getByDisplayValue("12,345.6")).toBeTruthy();

    // Backspace to remove '6'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "12,345.");
    expect(screen.getByDisplayValue("12,345.")).toBeTruthy();

    // Backspace to remove '.'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "12,345");
    expect(screen.getByDisplayValue("12,345")).toBeTruthy();

    // Backspace to remove '5'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "12,34");
    expect(screen.getByDisplayValue("1,234")).toBeTruthy();

    // Paste '50000'
    fireEvent.changeText(screen.getByTestId("controlled-price"), "50000");
    expect(screen.getByDisplayValue("50,000")).toBeTruthy();
  });

  it("restores formatting when user removes grouping comma while focused", () => {
    function CommaRemovalTestInput(): React.JSX.Element {
      const [value, setValue] = React.useState("1234");
      return (
        <GroupedDecimalInput
          testID="comma-test"
          label="Purchase price"
          value={value}
          onCanonicalChange={setValue}
        />
      );
    }

    render(<CommaRemovalTestInput />);
    expect(screen.getByDisplayValue("1,234")).toBeTruthy();

    fireEvent(screen.getByTestId("comma-test"), "focus", {});
    // User deletes comma -> native changeText is "1234"
    fireEvent.changeText(screen.getByTestId("comma-test"), "1234");
    // Canonical parent value remains "1234", input still displays formatted "1,234"
    expect(screen.getByDisplayValue("1,234")).toBeTruthy();
  });

  it("handles separator deletion in fractional grouped text while focused", () => {
    function FractionalSeparatorTest(): React.JSX.Element {
      const [value, setValue] = React.useState("1234.56");
      return (
        <GroupedDecimalInput
          testID="fraction-test"
          label="Purchase price"
          value={value}
          onCanonicalChange={setValue}
        />
      );
    }

    render(<FractionalSeparatorTest />);
    expect(screen.getByDisplayValue("1,234.56")).toBeTruthy();

    fireEvent(screen.getByTestId("fraction-test"), "focus", {});
    // User deletes comma from "1,234.56" -> native changeText is "1234.56"
    fireEvent.changeText(screen.getByTestId("fraction-test"), "1234.56");
    expect(screen.getByDisplayValue("1,234.56")).toBeTruthy();
  });

  it("preserves delayed ordinary TextField draft protection when syncWhileFocused is not set", () => {
    function OrdinaryTextFieldWrapper(): React.JSX.Element {
      const [externalText, setExternalText] = React.useState("initial");
      return (
        <>
          <TextField
            testID="ordinary-field"
            label="Name"
            value={externalText}
            onChangeText={() => {}}
          />
          <Text
            testID="external-updater"
            onPress={() => setExternalText("updated externally")}
          >
            Update
          </Text>
        </>
      );
    }

    render(<OrdinaryTextFieldWrapper />);
    expect(screen.getByDisplayValue("initial")).toBeTruthy();

    fireEvent(screen.getByTestId("ordinary-field"), "focus", {});
    fireEvent.changeText(screen.getByTestId("ordinary-field"), "my user draft");
    expect(screen.getByDisplayValue("my user draft")).toBeTruthy();

    // External prop changes while focused -> draft protection keeps user draft
    fireEvent.press(screen.getByTestId("external-updater"));
    expect(screen.getByDisplayValue("my user draft")).toBeTruthy();

    // On blur, externalValue syncs
    fireEvent(screen.getByTestId("ordinary-field"), "blur", {});
    expect(screen.getByDisplayValue("updated externally")).toBeTruthy();
  });

  it("renders localized English accessibilityHint even when I18nManager.isRTL is true", () => {
    const originalRTL = I18nManager.isRTL;
    I18nManager.isRTL = true;
    try {
      render(
        <GroupedDecimalInput
          testID="rtl-en-test"
          label="Weight"
          value="50"
          required
          onCanonicalChange={jest.fn()}
        />
      );

      // In English locale (active in test), hint is dictated by language, not native isRTL
      expect(screen.getByTestId("rtl-en-test")).toHaveProp(
        "accessibilityHint",
        "Required field"
      );
    } finally {
      I18nManager.isRTL = originalRTL;
    }
  });
});

describe("GroupedMoneyInput delegation", () => {
  it("uses the shared numeric foundation to format monetary values", () => {
    render(
      <GroupedMoneyInput
        testID="money-input"
        label="Price"
        value="47800"
        onCanonicalChange={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("47,800")).toBeTruthy();
  });
});


describe("GroupedMoneyInput focus forwarding", () => {
  interface FocusableMoneyProps
    extends React.ComponentProps<typeof GroupedMoneyInput> {
    readonly onFocus?: () => void;
    readonly onBlur?: () => void;
    readonly showSoftInputOnFocus?: boolean;
  }

  const FocusableGroupedMoneyInput =
    GroupedMoneyInput as unknown as React.ComponentType<FocusableMoneyProps>;

  it("forwards focus lifecycle and suppresses the native soft keyboard when requested", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();

    render(
      <FocusableGroupedMoneyInput
        testID="manual-money-input"
        label="Amount"
        value="120"
        onCanonicalChange={jest.fn()}
        onFocus={onFocus}
        onBlur={onBlur}
        showSoftInputOnFocus={false}
      />
    );

    const input = screen.getByTestId("manual-money-input");
    expect(input).toHaveProp("showSoftInputOnFocus", false);

    fireEvent(input, "focus", {});
    expect(onFocus).toHaveBeenCalledTimes(1);

    fireEvent(input, "blur", {});
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("keeps forwarding the shared native input ref", () => {
    const inputRef = React.createRef<TextInput>();

    render(
      <GroupedMoneyInput
        testID="manual-money-ref"
        label="Amount"
        value="120"
        onCanonicalChange={jest.fn()}
        inputRef={inputRef}
      />
    );

    expect(inputRef.current).not.toBeNull();
  });
});
