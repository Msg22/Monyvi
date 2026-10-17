import React from "react";
import { render, screen } from "@testing-library/react-native";

const translations: Record<string, string> = {
  add_account: "Add account",
  saving: "Saving",
  add_new_account: "Add new account",
  add_account_hero_title: "Add account",
  add_account_hero_subtitle: "Track your money",
  account_name: "Account name",
  account_name_placeholder_bank: "e.g., CIB",
  account_name_placeholder_cash: "e.g., Wallet",
  account_name_placeholder_wallet: "e.g., Vodafone Cash",
  currency: "Currency",
  initial_balance: "Initial balance",
  provider_details_section: "Bank or wallet",
  provider_details_help:
    "Choose the bank or wallet so SMS transactions can be matched to the right account.",
  provider_details_info: "Why this helps",
  manual_bank_name: "Bank name",
  manual_wallet_name: "Wallet name",
  provider_name_placeholder_bank: "e.g., CIB, NBE, HSBC",
  provider_name_placeholder_wallet: "e.g., Vodafone Cash",
  institution_search_placeholder: "Search",
  institution_other: "Other",
  sms_sender_names: "SMS sender names",
  sms_matching_optional: "Message detection (optional)",
  sms_matching_help: "Sender names help Monyvi find messages for this account.",
  sms_sender_help:
    "The name that appears as the SMS sender when your bank sends you transaction notifications.",
  type_bank: "Bank",
  type_cash: "Cash",
  type_digital_wallet: "Digital wallet",
  selected: "Selected",
  save: "Save",
};

const mockUpdateField = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly type: string } => ({ type: "BANK" }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => translations[key] ?? key,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): { readonly bottom: number } => ({ bottom: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks", () => ({
  useAccountForm: (): unknown => ({
    formData: {
      accountType: "BANK",
      balance: "",
      bankName: "",
      cardLast4: "",
      currency: "EGP",
      institutionId: null,
      name: "",
      providerDisplayName: "",
      senderNames: [],
    },
    errors: {},
    updateField: mockUpdateField,
    selectKnownInstitution: jest.fn(),
    selectOtherInstitution: jest.fn(),
    updateSenderNames: jest.fn(),
    validate: jest.fn(),
    isValid: true,
    isCheckingUniqueness: false,
  }),
  useCreateAccount: (): unknown => ({
    createAccount: jest.fn(),
    isSubmitting: false,
  }),
  useEgyptianInstitutionEligibility: (): { readonly isEligible: boolean } => ({
    isEligible: true,
  }),
  useKeyboardVisibility: (): boolean => false,
}));

// This suite verifies institution presentation, not the real owner-scoped
// default subscription. Canonical default/CAS behavior has separate SQLite tests.
jest.mock("@/hooks/useOwnedAccountDefaultState", () => ({
  useOwnedAccountDefaultState: () => ({
    state: {
      status: "ready",
      ownerId: "owner-1",
      snapshot: { activeAccountIds: ["account-1"], defaultAccount: null },
      defaultAccountName: null,
    },
    retry: jest.fn(),
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/components/ui/Button", () => ({
  Button: (): null => null,
}));

jest.mock("@/components/ui/Dropdown", () => ({
  Dropdown: (): null => null,
}));

jest.mock("@/components/currency/CurrencyPicker", () => ({
  CurrencyPicker: (): null => null,
}));

jest.mock("@/components/ui/TextField", () => {
  return {
    TextField: (): null => null,
  };
});

jest.mock("@/components/add-account/BankCardDetailsSection", () => ({
  BankCardDetailsSection: (): null => null,
}));

jest.mock("@/components/add-account/AccountPreviewCard", () => ({
  AccountPreviewCard: (): null => null,
}));

// Import after mocks.
// eslint-disable-next-line import/first
import AddAccount from "../../app/(private)/add-account";

describe("Add account institution info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the provider-details info control in the bank create flow", () => {
    render(<AddAccount />);

    expect(screen.getByLabelText("Why this helps")).toBeTruthy();
  });

  it("keeps message detection collapsed by default", () => {
    render(<AddAccount />);

    expect(screen.getByText("Message detection (optional)")).toBeTruthy();
    expect(screen.queryByText("SMS sender names")).toBeNull();
  });
});
