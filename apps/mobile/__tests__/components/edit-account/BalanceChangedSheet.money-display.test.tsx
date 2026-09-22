import { render, screen } from "@testing-library/react-native";
import React from "react";

import { BalanceChangedSheet } from "@/components/edit-account/BalanceChangedSheet";

jest.mock("expo-blur", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    BlurView: ({
      children,
    }: {
      readonly children?: React.ReactNode;
    }): React.ReactElement => ReactActual.createElement(View, null, children),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

function renderSheet(
  previousBalance: number,
  newBalance: number
): ReturnType<typeof render> {
  return render(
    <BalanceChangedSheet
      visible={true}
      previousBalance={previousBalance}
      newBalance={newBalance}
      currencyCode="EGP"
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
    />
  );
}

describe("BalanceChangedSheet money display", () => {
  it("hides the fractional part when every displayed fraction digit is zero", () => {
    renderSheet(35000, 35500);

    expect(screen.getByText("35,500 EGP")).toBeTruthy();
    expect(screen.queryByText("35,500.00 EGP")).toBeNull();
  });

  it("retains meaningful fractional digits", () => {
    renderSheet(35500, 35500.01);

    expect(screen.getByText("35,500 EGP")).toBeTruthy();
    expect(screen.getByText("35,500.01 EGP")).toBeTruthy();
  });

  it("keeps the trailing fractional zero when the fraction is meaningful", () => {
    renderSheet(35500, 35500.1);

    expect(screen.getByText("35,500.10 EGP")).toBeTruthy();
  });
});
