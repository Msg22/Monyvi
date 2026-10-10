import { render, screen, within } from "@testing-library/react-native";
import type { Account } from "@monyvi/db";
import { Text as NativeText, TextInput } from "react-native";
import {
  getTestInstanceProps,
  getTestInstances,
} from "../../test-utils/test-instance-props";

import { TransferFields } from "@/components/add-transaction/TransferFields";

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

jest.mock("@/components/modals/AccountSelectorModal", () => ({
  AccountSelectorModal: (): null => null,
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string) => string;
    readonly i18n: { readonly language: "en" };
  } => ({
    t: (key: string): string =>
      ({
        from_label: "From",
        to_label: "To",
        select: "Select",
        target_amount: "Target amount",
        confirm_amount_received: "Confirm amount received",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
}));

function account(
  id: string,
  name: string,
  currency: "EGP" | "USD" = "EGP"
): Account {
  const value: Partial<Account> = {
    id,
    name,
    currency,
  };
  return value as Account;
}

function getNativeTextProps(content: string): Record<string, unknown> {
  const node: unknown = getTestInstances(
    screen.UNSAFE_getAllByType(NativeText)
  ).find(
    (candidate: unknown) => getTestInstanceProps(candidate).children === content
  );
  if (!node) throw new Error(`Native Text "${content}" not found`);
  return getTestInstanceProps(node);
}

function getNativeInputProps(testID: string): Record<string, unknown> {
  const node: unknown = getTestInstances(
    screen.UNSAFE_getAllByType(TextInput)
  ).find(
    (candidate: unknown) => getTestInstanceProps(candidate).testID === testID
  );
  if (!node) throw new Error(`Native TextInput "${testID}" not found`);
  return getTestInstanceProps(node);
}

describe("TransferFields", () => {
  beforeEach(() => {
    mockLocaleFontFamily = {
      regular: "Inter_400Regular",
      medium: "Inter_500Medium",
      semiBold: "Inter_600SemiBold",
      bold: "Inter_700Bold",
    };
  });

  it("surfaces source and destination account validation errors", () => {
    render(
      <TransferFields
        accounts={[account("acc-1", "Cash"), account("acc-2", "Bank")]}
        fromAccountId={null}
        toAccountId={null}
        onSelectFrom={jest.fn()}
        onSelectTo={jest.fn()}
        amount="100"
        targetAmount=""
        onChangeTargetAmount={jest.fn()}
        fromAccountError="Source account is required"
        toAccountError="Destination account is required"
      />
    );

    expect(screen.getByText("Source account is required")).toBeTruthy();
    expect(screen.getByText("Destination account is required")).toBeTruthy();
  });

  it("suppresses the native soft keyboard for the compact target amount", () => {
    render(
      <TransferFields
        accounts={[
          account("acc-egp", "Cash", "EGP"),
          account("acc-usd", "USD Bank", "USD"),
        ]}
        fromAccountId="acc-egp"
        toAccountId="acc-usd"
        onSelectFrom={jest.fn()}
        onSelectTo={jest.fn()}
        amount="100"
        targetAmount="2"
        onChangeTargetAmount={jest.fn()}
        compactTargetAmount
      />
    );

    const nativeProps = getNativeInputProps(
      "manual-transfer-target-amount-input"
    );
    expect(nativeProps.showSoftInputOnFocus).toBe(false);
    expect(nativeProps.inputMode).toBe("none");
  });

  it("uses the active locale medium font for the compact target currency suffix", () => {
    const accounts = [
      account("acc-egp", "Cash", "EGP"),
      account("acc-usd", "USD Bank", "USD"),
    ];
    const onSelectFrom = jest.fn();
    const onSelectTo = jest.fn();
    const onChangeTargetAmount = jest.fn();

    const { rerender } = render(
      <TransferFields
        accounts={accounts}
        fromAccountId="acc-egp"
        toAccountId="acc-usd"
        onSelectFrom={onSelectFrom}
        onSelectTo={onSelectTo}
        amount="100"
        targetAmount="2"
        onChangeTargetAmount={onChangeTargetAmount}
        compactTargetAmount
      />
    );

    const suffix: unknown = within(
      screen.getByTestId(
        "manual-transfer-target-amount-input-trailing-adornment"
      )
    ).getByText("USD");
    expect(suffix).toHaveStyle({
      fontFamily: "Inter_500Medium",
    });
    expect(getNativeTextProps("USD").className as string).toContain("text-sm");

    mockLocaleFontFamily = {
      regular: "NotoSansArabic_400Regular",
      medium: "NotoSansArabic_500Medium",
      semiBold: "NotoSansArabic_600SemiBold",
      bold: "NotoSansArabic_700Bold",
    };

    rerender(
      <TransferFields
        accounts={accounts}
        fromAccountId="acc-egp"
        toAccountId="acc-usd"
        onSelectFrom={onSelectFrom}
        onSelectTo={onSelectTo}
        amount="100"
        targetAmount="2"
        onChangeTargetAmount={onChangeTargetAmount}
        compactTargetAmount
      />
    );

    const arabicSuffix: unknown = within(
      screen.getByTestId(
        "manual-transfer-target-amount-input-trailing-adornment"
      )
    ).getByText("USD");
    expect(arabicSuffix).toHaveStyle({
      fontFamily: "NotoSansArabic_500Medium",
    });
  });
});
