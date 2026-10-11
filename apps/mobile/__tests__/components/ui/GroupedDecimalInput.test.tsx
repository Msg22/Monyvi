import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { I18nManager, Text, TextInput } from "react-native";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { GroupedDecimalInput } from "@/components/ui/GroupedDecimalInput";
import { GroupedMoneyInput } from "@/components/ui/GroupedMoneyInput";
import { TextField } from "@/components/ui/TextField";

let mockGroupedLocale: "en" | "ar" = "en";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: mockGroupedLocale },
    t: (key: string): string =>
      key === "required_field"
        ? mockGroupedLocale === "ar"
          ? "حقل مطلوب"
          : "Required field"
        : key,
  }),
}));

afterEach((): void => {
  mockGroupedLocale = "en";
});

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

  it("renders required asterisk and localized accessible name without aria-required", () => {
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
      "accessibilityLabel",
      "Weight, Required field"
    );
    expect(screen.getByTestId("weight-input")).not.toHaveProp(
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

  it("keeps the English required accessible name when I18nManager.isRTL is true", () => {
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

      // Spoken requiredness follows active English, not device RTL direction.
      expect(screen.getByTestId("rtl-en-test")).toHaveProp(
        "accessibilityLabel",
        "Weight, Required field"
      );
      expect(screen.getByTestId("rtl-en-test")).not.toHaveProp(
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

describe("GroupedMoneyInput typography forwarding", () => {
  it("forwards input, label style and label class props through the grouped numeric foundation", () => {
    render(
      <GroupedMoneyInput
        testID="manual-money-typography"
        label="Amount"
        value="120"
        onCanonicalChange={jest.fn()}
        className="text-lg leading-7"
        style={{ fontFamily: "Inter_500Medium" }}
        labelStyle={{ fontFamily: "Inter_400Regular" }}
        labelClassName="mb-2 text-sm"
      />
    );

    const textField: unknown = getTestInstances(
      screen.UNSAFE_getAllByType(TextField)
    ).find(
      (node: unknown) =>
        getTestInstanceProps(node).testID === "manual-money-typography"
    );
    if (!textField) throw new Error("Forwarded TextField not found");
    const textFieldProps = getTestInstanceProps(textField);

    expect(textFieldProps.className).toContain("text-lg leading-7");
    expect(textFieldProps.style).toEqual({
      fontFamily: "Inter_500Medium",
    });
    expect(textFieldProps.labelClassName).toBe("mb-2 text-sm");
    expect(textFieldProps.labelStyle).toEqual({
      fontFamily: "Inter_400Regular",
    });
  });
});

describe("GroupedMoneyInput focus forwarding", () => {
  it("forwards focus lifecycle and suppresses the native soft keyboard when requested", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();

    render(
      <GroupedMoneyInput
        testID="manual-money-input"
        label="Amount"
        value="120"
        onCanonicalChange={jest.fn()}
        onFocus={onFocus}
        onBlur={onBlur}
        showSoftInputOnFocus={false}
      />
    );

    const input: unknown = screen.getByTestId("manual-money-input");
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
describe("T007 grouped numeric opt-in and raw display", () => {
  it("keeps the omitted variant outlined for existing Metals weight consumers", () => {
    render(
      <GroupedDecimalInput
        label="Weight"
        testID="legacy-weight-shape"
        value="1250.755"
        onCanonicalChange={jest.fn()}
      />
    );

    const input: unknown = screen.getByTestId("legacy-weight-shape");
    expect(input).toHaveDisplayValue("1,250.755");
    expect(getTestInstanceProps(input).className as string).toContain("rounded-lg");
    expect(getTestInstanceProps(input).className as string).toContain("min-h-11");
  });

  it("uses the existing default field surface only when explicitly opted in", () => {
    render(
      <GroupedDecimalInput
        variant="default"
        label="Initial balance"
        testID="default-grouped-input"
        value="12345.678"
        onCanonicalChange={jest.fn()}
      />
    );

    const input: unknown = screen.getByTestId("default-grouped-input");
    expect(input).toHaveDisplayValue("12,345.678");
    expect(getTestInstanceProps(input).className as string).toContain("rounded-2xl");
    expect(getTestInstanceProps(input).className as string).toContain("p-4");
  });

  it("shows invalid raw text verbatim after a controlled rerender and groups valid correction", () => {
    const onCanonicalChange = jest.fn();

    function ControlledMalformed(): React.JSX.Element {
      const [value, setValue] = React.useState("123");
      const onChange = (next: string): void => {
        onCanonicalChange(next);
        setValue(next);
      };
      return (
        <>
          <GroupedDecimalInput
            label="Amount"
            testID="raw-amount"
            value={value}
            onCanonicalChange={onChange}
          />
          <Text testID="raw-canonical">{value}</Text>
        </>
      );
    }

    render(<ControlledMalformed />);
    const input: unknown = screen.getByTestId("raw-amount");
    fireEvent(input, "focus", {});
    fireEvent.changeText(input, "abc12345");

    expect(onCanonicalChange).toHaveBeenLastCalledWith("abc12345");
    expect(screen.getByTestId("raw-canonical")).toHaveTextContent("abc12345");
    expect(screen.getByTestId("raw-amount")).toHaveDisplayValue("abc12345");

    fireEvent.changeText(screen.getByTestId("raw-amount"), "12345.678");
    expect(onCanonicalChange).toHaveBeenLastCalledWith("12345.678");
    expect(screen.getByTestId("raw-canonical")).toHaveTextContent("12345.678");
    expect(screen.getByTestId("raw-amount")).toHaveDisplayValue("12,345.678");
  });

  it("retains a malformed signed draft until the user corrects it", () => {
    function ControlledSigned(): React.JSX.Element {
      const [value, setValue] = React.useState("-12");
      return (
        <GroupedDecimalInput
          allowNegative
          variant="default"
          testID="signed-raw"
          label="Balance"
          value={value}
          onCanonicalChange={setValue}
        />
      );
    }

    render(<ControlledSigned />);
    fireEvent.changeText(screen.getByTestId("signed-raw"), "--1234");
    expect(screen.getByTestId("signed-raw")).toHaveDisplayValue("--1234");

    fireEvent.changeText(screen.getByTestId("signed-raw"), "-1234.567");
    expect(screen.getByTestId("signed-raw")).toHaveDisplayValue("-1,234.567");
  });

  it("keeps minus, fractional intermediates and trailing zeros visible during signed typing", () => {
    const onCanonicalChange = jest.fn();

    function ControlledSigned(): React.JSX.Element {
      const [value, setValue] = React.useState("");
      const onChange = (next: string): void => {
        onCanonicalChange(next);
        setValue(next);
      };
      return (
        <GroupedDecimalInput
          allowNegative
          label="Balance"
          testID="signed-intermediate"
          value={value}
          onCanonicalChange={onChange}
        />
      );
    }

    render(<ControlledSigned />);
    for (const entry of ["-", "-1", "-12.", "-12.30", "-12.3000"]) {
      fireEvent.changeText(screen.getByTestId("signed-intermediate"), entry);
      expect(onCanonicalChange).toHaveBeenLastCalledWith(entry);
      expect(screen.getByTestId("signed-intermediate")).toHaveDisplayValue(entry);
    }
  });

  it("emits dot-decimal canonical text for negative grouped paste and mid-string replacement", () => {
    const onCanonicalChange = jest.fn();

    function ControlledSigned(): React.JSX.Element {
      const [value, setValue] = React.useState("-1234.50");
      const onChange = (next: string): void => {
        onCanonicalChange(next);
        setValue(next);
      };
      return (
        <GroupedDecimalInput
          allowNegative
          label="Balance"
          testID="signed-grouped"
          value={value}
          onCanonicalChange={onChange}
        />
      );
    }

    render(<ControlledSigned />);
    fireEvent.changeText(screen.getByTestId("signed-grouped"), "-1,234.567");
    expect(onCanonicalChange).toHaveBeenLastCalledWith("-1234.567");
    expect(screen.getByTestId("signed-grouped")).toHaveDisplayValue(
      "-1,234.567"
    );

    fireEvent.changeText(screen.getByTestId("signed-grouped"), "-1,294.567");
    expect(onCanonicalChange).toHaveBeenLastCalledWith("-1294.567");
    expect(screen.getByTestId("signed-grouped")).toHaveDisplayValue(
      "-1,294.567"
    );
  });

  it("supports comma deletion and sign removal without dropping digits", () => {
    const onCanonicalChange = jest.fn();

    function ControlledSigned(): React.JSX.Element {
      const [value, setValue] = React.useState("-1234.50");
      const onChange = (next: string): void => {
        onCanonicalChange(next);
        setValue(next);
      };
      return (
        <GroupedDecimalInput
          allowNegative
          label="Balance"
          testID="signed-separator"
          value={value}
          onCanonicalChange={onChange}
        />
      );
    }

    render(<ControlledSigned />);
    fireEvent.changeText(screen.getByTestId("signed-separator"), "-1234.50");
    expect(onCanonicalChange).toHaveBeenLastCalledWith("-1234.50");
    expect(screen.getByTestId("signed-separator")).toHaveDisplayValue(
      "-1,234.50"
    );

    fireEvent.changeText(screen.getByTestId("signed-separator"), "1,234.50");
    expect(onCanonicalChange).toHaveBeenLastCalledWith("1234.50");
    expect(screen.getByTestId("signed-separator")).toHaveDisplayValue(
      "1,234.50"
    );
  });

  it("keeps negative text ungrouped by default when signed input was not enabled", () => {
    render(
      <GroupedDecimalInput
        label="Unsigned amount"
        testID="unsigned-negative"
        value="-1234.567"
        onCanonicalChange={jest.fn()}
      />
    );
    expect(screen.getByTestId("unsigned-negative")).toHaveDisplayValue(
      "-1234.567"
    );
  });

  it("forwards signed/default opts without losing keyboard, native events, styles, ref or adornment", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const inputRef = React.createRef<TextInput>();
    render(
      <GroupedDecimalInput
        allowNegative
        variant="default"
        testID="signed-forwarded"
        label="Balance"
        value="-1234.567"
        onCanonicalChange={jest.fn()}
        inputRef={inputRef}
        onFocus={onFocus}
        onBlur={onBlur}
        showSoftInputOnFocus={false}
        inputMode="text"
        keyboardType="numbers-and-punctuation"
        className="text-lg"
        style={{ fontFamily: "Inter_500Medium" }}
        labelClassName="mb-2"
        trailingAdornment={<Text testID="signed-unit">EGP</Text>}
      />
    );

    const input: unknown = screen.getByTestId("signed-forwarded");
    expect(input).toHaveDisplayValue("-1,234.567");
    expect(input).toHaveProp("inputMode", "none");
    expect(input).toHaveProp("showSoftInputOnFocus", false);
    expect(input).toHaveProp("keyboardType", "numbers-and-punctuation");
    expect(getTestInstanceProps(input).className as string).toContain("text-lg");
    expect(input).toHaveStyle({ fontFamily: "Inter_500Medium" });
    expect(screen.getByTestId("signed-unit")).toBeOnTheScreen();
    expect(inputRef.current).not.toBeNull();
    fireEvent(input, "focus", {});
    fireEvent(input, "blur", {});
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("uses the Arabic required name with an explicit override exactly once", () => {
    mockGroupedLocale = "ar";
    render(
      <GroupedMoneyInput
        variant="default"
        allowNegative
        label="الرصيد"
        required
        accessibilityLabel="رصيد الحساب، حقل مطلوب"
        testID="arabic-money"
        value="-1234.567"
        onCanonicalChange={jest.fn()}
      />
    );
    const input: unknown = screen.getByTestId("arabic-money");
    expect(input).toHaveProp("accessibilityLabel", "رصيد الحساب، حقل مطلوب");
    expect(input).not.toHaveProp("accessibilityHint", "حقل مطلوب");
    expect(input).toHaveDisplayValue("-1,234.567");
  });

  it("keeps focused numeric errors visible and reserves helper/warning priority", () => {
    render(
      <GroupedDecimalInput
        label="Amount"
        required
        testID="numeric-error"
        value="abc12345"
        error="Enter a valid amount"
        warning="Advisory only"
        helperText="Secondary help"
        onCanonicalChange={jest.fn()}
      />
    );

    const input: unknown = screen.getByTestId("numeric-error");
    fireEvent(input, "focus", {});
    expect(input).toHaveDisplayValue("abc12345");
    expect(screen.getByRole("alert", { name: "Enter a valid amount" }))
      .toBeOnTheScreen();
    expect(screen.queryByText("Advisory only")).toBeNull();
    expect(screen.queryByText("Secondary help")).toBeNull();
  });
});
describe("T007 Q3/Q4 unsigned and controlled draft preservation", () => {
  it("emits an unsigned negative edit as exact raw text, never as accepted signed canonical", () => {
    const onCanonicalChange = jest.fn();
    render(
      <GroupedDecimalInput
        label="Unsigned amount"
        testID="unsigned-negative-change"
        value="1234"
        onCanonicalChange={onCanonicalChange}
      />
    );

    fireEvent.changeText(
      screen.getByTestId("unsigned-negative-change"),
      "-1,234.567"
    );
    expect(onCanonicalChange).toHaveBeenCalledTimes(1);
    expect(onCanonicalChange).toHaveBeenCalledWith("-1,234.567");
    expect(onCanonicalChange).not.toHaveBeenCalledWith("-1234.567");
  });

  it("keeps malformed raw drafts through unrelated rerender, blur/refocus, and a complete valid correction sequence", () => {
    const observedChanges: string[] = [];

    function ControlledNumeric({
      revision,
    }: {
      readonly revision: number;
    }): React.JSX.Element {
      const [value, setValue] = React.useState("1234");
      const onChange = (next: string): void => {
        observedChanges.push(next);
        setValue(next);
      };

      return (
        <>
          <GroupedDecimalInput
            label="Amount"
            testID="grouped-controlled-rerender"
            value={value}
            onCanonicalChange={onChange}
          />
          <Text testID="grouped-current-canonical">{value}</Text>
          <Text testID="unrelated-revision">{revision}</Text>
        </>
      );
    }

    const { rerender } = render(<ControlledNumeric revision={0} />);
    const field = (): ReturnType<typeof screen.getByTestId> =>
      screen.getByTestId("grouped-controlled-rerender");

    fireEvent(field(), "focus", {});
    expect(field()).toHaveDisplayValue("1,234");
    expect(observedChanges).toEqual([]);

    fireEvent.changeText(field(), "abc12345");
    expect(observedChanges).toEqual(["abc12345"]);
    expect(screen.getByTestId("grouped-current-canonical"))
      .toHaveTextContent("abc12345");
    expect(field()).toHaveDisplayValue("abc12345");

    // Same canonical value, unrelated parent render: do not discard the draft.
    rerender(<ControlledNumeric revision={1} />);
    expect(screen.getByTestId("unrelated-revision")).toHaveTextContent("1");
    expect(field()).toHaveDisplayValue("abc12345");
    expect(observedChanges).toEqual(["abc12345"]);

    fireEvent(field(), "blur", {});
    expect(field()).toHaveDisplayValue("abc12345");
    fireEvent(field(), "focus", {});
    expect(field()).toHaveDisplayValue("abc12345");

    fireEvent.changeText(field(), "12,34");
    expect(field()).toHaveDisplayValue("12,34");
    fireEvent.changeText(field(), "12345.678");
    expect(field()).toHaveDisplayValue("12,345.678");

    // A public changeText simulates mid-string replacement; it does not prove
    // native caret/IME/selection positioning on a device.
    fireEvent.changeText(field(), "12,945.678");
    expect(field()).toHaveDisplayValue("12,945.678");
    fireEvent.changeText(field(), "12945.678");
    expect(field()).toHaveDisplayValue("12,945.678");

    fireEvent(field(), "blur", {});
    fireEvent(field(), "focus", {});
    expect(field()).toHaveDisplayValue("12,945.678");
    expect(screen.getByTestId("grouped-current-canonical"))
      .toHaveTextContent("12945.678");
    expect(observedChanges).toEqual([
      "abc12345",
      "12,34",
      "12345.678",
      "12945.678",
      "12945.678",
    ]);
  });
});
