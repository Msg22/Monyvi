import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text, TextInput } from "react-native";

import { GroupedDecimalInput } from "@/components/ui/GroupedDecimalInput";
import { GroupedMoneyInput } from "@/components/ui/GroupedMoneyInput";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string): string =>
      key === "required_field" ? "Required field" : key,
  }),
}));

function getNativeInputProps(testID: string): Record<string, unknown> {
  const input: unknown = getTestInstances(
    screen.UNSAFE_getAllByType(TextInput)
  ).find(
    (candidate: unknown) => getTestInstanceProps(candidate).testID === testID
  );
  if (!input) throw new Error(`Native TextInput "${testID}" not found`);
  return getTestInstanceProps(input);
}

describe("Grouped money calculator keyboard suppression", () => {
  it("keeps the normal grouped decimal field on the native decimal input mode", () => {
    render(
      <GroupedDecimalInput
        testID="ordinary-decimal"
        label="Weight"
        value="12.5"
        onCanonicalChange={jest.fn()}
      />
    );

    const nativeProps = getNativeInputProps("ordinary-decimal");
    expect(nativeProps.inputMode).toBe("decimal");
    expect(nativeProps.showSoftInputOnFocus).not.toBe(false);
  });

  it("resolves calculator-controlled money input to native inputMode none", () => {
    render(
      <GroupedMoneyInput
        testID="calculator-money"
        label="Amount"
        value="120"
        onCanonicalChange={jest.fn()}
        showSoftInputOnFocus={false}
      />
    );

    const nativeProps = getNativeInputProps("calculator-money");
    expect(nativeProps.showSoftInputOnFocus).toBe(false);
    expect(nativeProps.inputMode).toBe("none");
  });
});
describe("T007 GroupedMoneyInput option compatibility", () => {
  it("preserves the outlined/unsigned defaults and normal decimal keyboard", () => {
    render(
      <GroupedMoneyInput
        testID="money-legacy-default"
        label="Price"
        value="1250.755"
        onCanonicalChange={jest.fn()}
      />
    );

    const input = getNativeInputProps("money-legacy-default");
    expect(input.value).toBe("1,250.755");
    expect(input.className as string).toContain("rounded-lg");
    expect(input.inputMode).toBe("decimal");
  });

  it("forwards explicitly opted-in default surface and signed canonical edits", () => {
    const onCanonicalChange = jest.fn();
    render(
      <GroupedMoneyInput
        variant="default"
        allowNegative
        testID="money-signed-default"
        label="Balance"
        value="-1234.567"
        onCanonicalChange={onCanonicalChange}
      />
    );

    const input = screen.getByTestId("money-signed-default");
    expect(input).toHaveDisplayValue("-1,234.567");
    expect(getNativeInputProps("money-signed-default").className as string)
      .toContain("rounded-2xl");
    fireEvent.changeText(input, "-1,234.568");
    expect(onCanonicalChange).toHaveBeenCalledWith("-1234.568");
  });

  it("keeps PR383 native keyboard suppression, ref, adornment, style and events with opt-in props", () => {
    const inputRef = React.createRef<TextInput>();
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    render(
      <GroupedMoneyInput
        variant="default"
        allowNegative
        testID="money-forwarded-optin"
        label="Balance"
        value="-1250.755"
        onCanonicalChange={jest.fn()}
        showSoftInputOnFocus={false}
        inputRef={inputRef}
        onFocus={onFocus}
        onBlur={onBlur}
        className="text-lg leading-7"
        style={{ fontFamily: "Inter_500Medium" }}
        labelClassName="mb-2"
        trailingAdornment={<Text testID="money-unit">EGP</Text>}
      />
    );

    const input = screen.getByTestId("money-forwarded-optin");
    expect(input).toHaveDisplayValue("-1,250.755");
    expect(input).toHaveProp("showSoftInputOnFocus", false);
    expect(input).toHaveProp("inputMode", "none");
    expect(getNativeInputProps("money-forwarded-optin").className as string)
      .toContain("text-lg leading-7");
    expect(input).toHaveStyle({ fontFamily: "Inter_500Medium" });
    expect(screen.getByTestId("money-unit")).toBeOnTheScreen();
    expect(inputRef.current).not.toBeNull();
    fireEvent(input, "focus", {});
    fireEvent(input, "blur", {});
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("preserves arbitrary accepted decimals and trailing zero text during controlled updates", () => {
    const onCanonicalChange = jest.fn();

    function ControlledMoney(): React.JSX.Element {
      const [value, setValue] = React.useState("1250.755");
      const onChange = (next: string): void => {
        onCanonicalChange(next);
        setValue(next);
      };
      return (
        <GroupedMoneyInput
          testID="money-trailing-zeroes"
          label="Purchase price"
          value={value}
          onCanonicalChange={onChange}
        />
      );
    }

    render(<ControlledMoney />);
    fireEvent.changeText(
      screen.getByTestId("money-trailing-zeroes"),
      "1,250.7550"
    );
    expect(onCanonicalChange).toHaveBeenLastCalledWith("1250.7550");
    expect(screen.getByTestId("money-trailing-zeroes")).toHaveDisplayValue(
      "1,250.7550"
    );
  });
});
