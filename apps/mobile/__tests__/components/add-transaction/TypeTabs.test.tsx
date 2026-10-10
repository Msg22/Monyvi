import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text as NativeText } from "react-native";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { TypeTabs } from "@/components/add-transaction/TypeTabs";

function getNativeTextProps(content: string): Record<string, unknown> {
  const node: unknown = getTestInstances(
    screen.UNSAFE_getAllByType(NativeText)
  ).find(
    (candidate: unknown) => getTestInstanceProps(candidate).children === content
  );
  if (!node) throw new Error(`Native Text "${content}" not found`);
  return getTestInstanceProps(node);
}

let mockLocaleFontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    language: "en",
    isRTL: false,
    fontFamily: mockLocaleFontFamily,
  }),
}));


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
  beforeEach(() => {
    mockLocaleFontFamily = {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    };
  });

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

  it("uses approved compact tab typography with the active locale font family", () => {
    render(<TypeTabs compact selectedType="EXPENSE" onSelect={jest.fn()} />);

    const expenseLabel: unknown = screen.getByText("Expense");
    expect(expenseLabel).toHaveStyle({
      fontFamily: "Inter_600SemiBold",
    });
    const expenseClassName = getNativeTextProps("Expense").className as string;
    expect(expenseClassName).toContain("text-base");
    expect(expenseClassName).toContain("leading-[26px]");
  });

  it("switches compact tab typography to Noto Sans Arabic without changing the legacy variant", () => {
    mockLocaleFontFamily = {
      regular: "NotoSansArabic_400Regular",
      medium: "NotoSansArabic_500Medium",
      semiBold: "NotoSansArabic_600SemiBold",
      bold: "NotoSansArabic_700Bold",
    };

    const { rerender } = render(
      <TypeTabs compact selectedType="EXPENSE" onSelect={jest.fn()} />
    );

    const expenseLabel: unknown = screen.getByText("Expense");
    expect(expenseLabel).toHaveStyle({
      fontFamily: "NotoSansArabic_600SemiBold",
    });
    const expenseClassName = getNativeTextProps("Expense").className as string;
    expect(expenseClassName).toContain("text-base");
    expect(expenseClassName).toContain("leading-[26px]");

    rerender(<TypeTabs selectedType="EXPENSE" onSelect={jest.fn()} />);
    expect(screen.getByText("EXPENSE")).toBeTruthy();
  });

  it("keeps selection delegated to the parent", () => {
    const onSelect = jest.fn();
    render(<TypeTabs compact selectedType="EXPENSE" onSelect={onSelect} />);

    fireEvent.press(screen.getByRole("tab", { name: "Income" }));

    expect(onSelect).toHaveBeenCalledWith("INCOME");
  });
});
