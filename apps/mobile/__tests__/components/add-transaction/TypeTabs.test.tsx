import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { TypeTabs } from "@/components/add-transaction/TypeTabs";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "Light" },
  impactAsync: jest.fn((): Promise<void> => Promise.resolve()),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string =>
      ({
        expense: "Expense",
        income: "Income",
        transfer: "Transfer",
      })[key] ?? key,
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const Native =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element => (
      <Native.Text testID={`type-icon-${name}`}>{name}</Native.Text>
    ),
  };
});

describe("TypeTabs compact Manual selector", () => {
  it("uses the approved labels, icons and selected tab semantics", () => {
    render(<TypeTabs compact selectedType="EXPENSE" onSelect={jest.fn()} />);

    expect(screen.getByRole("tab", { name: "Expense" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    expect(screen.getByRole("tab", { name: "Income" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: false })
    );
    expect(screen.getByRole("tab", { name: "Transfer" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: false })
    );

    expect(screen.getByTestId("type-icon-remove-circle")).toBeTruthy();
    expect(screen.getByTestId("type-icon-arrow-up-circle")).toBeTruthy();
    expect(screen.getByTestId("type-icon-swap-horizontal")).toBeTruthy();
  });

  it("keeps selection delegated to the parent", () => {
    const onSelect = jest.fn();
    render(<TypeTabs compact selectedType="EXPENSE" onSelect={onSelect} />);

    fireEvent.press(screen.getByRole("tab", { name: "Income" }));

    expect(onSelect).toHaveBeenCalledWith("INCOME");
  });
});
