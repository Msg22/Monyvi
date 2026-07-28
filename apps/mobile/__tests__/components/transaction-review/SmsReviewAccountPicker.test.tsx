import { render, screen } from "@testing-library/react-native";
import React from "react";

import { SmsReviewAccountPicker } from "@/components/transaction-review/edit-modal/SmsReviewAccountPicker";

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 0,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

describe("SmsReviewAccountPicker", () => {
  it("keeps heading, account name, and currency readable in dark mode", () => {
    render(
      <SmsReviewAccountPicker
        visible
        options={[
          {
            id: "account-1",
            name: "Main account",
            currency: "EGP",
            isPending: false,
            type: "BANK",
          },
        ]}
        selectedId="account-1"
        onSelect={jest.fn()}
        onStartNew={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText("select_an_account")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-primary-dark")
    );
    expect(screen.getByText("Main account")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-primary-dark")
    );
    expect(screen.getByText("EGP")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-muted-dark")
    );
  });
});
