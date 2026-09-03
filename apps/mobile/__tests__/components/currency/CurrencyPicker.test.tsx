import { render, screen, within } from "@testing-library/react-native";
import React from "react";

import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { palette } from "@/constants/colors";

interface MockIconProps {
  readonly color?: string;
  readonly name: string;
  readonly testID?: string;
}

function MockIonicons({
  color,
  name,
  testID,
}: MockIconProps): React.JSX.Element {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");

  return (
    <ReactNative.Text
      testID={testID}
    >{`${name}:${color ?? ""}`}</ReactNative.Text>
  );
}

jest.mock("@expo/vector-icons", () => ({
  Ionicons: MockIonicons,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

describe("CurrencyPicker", () => {
  it("shows a selected checkmark after the currency code only for the selected currency", () => {
    render(
      <CurrencyPicker
        visible
        selectedCurrency="EGP"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const selectedCodeRow = within(screen.getByTestId("currency-code-row-EGP"));

    expect(selectedCodeRow.getByTestId("currency-code-EGP")).toHaveTextContent(
      "EGP"
    );
    expect(
      selectedCodeRow.getByTestId("currency-selected-checkmark-EGP")
    ).toHaveTextContent(`checkmark-circle:${palette.nileGreen[500]}`);
    expect(screen.getByTestId("currency-row-highlight-EGP")).toBeOnTheScreen();
    expect(screen.queryByTestId("currency-selected-checkmark-AED")).toBeNull();
  });
});
