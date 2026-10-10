import { render, screen } from "@testing-library/react-native";
import React from "react";
import { TextInput } from "react-native";

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
