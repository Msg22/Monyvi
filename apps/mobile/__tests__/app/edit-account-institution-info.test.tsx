import React from "react";
import { render, screen } from "@testing-library/react-native";

const translations: Record<string, string> = {
  account_name: "Account name",
  account_name_placeholder_bank: "e.g., CIB",
  account_type: "Account type",
  balance: "Balance",
  currency: "Currency",
  danger_zone: "Danger zone",
  default_account: "Default account",
  default_account_description: "Use by default",
  delete_account: "Delete account",
  delete_account_warning: "This cannot be undone.",
  edit_account: "Edit account",
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
  save: "Save",
  save_changes: "Save changes",
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly id: string } => ({ id: "account-1" }),
  useRouter: (): { readonly back: jest.Mock } => ({ back: jest.fn() }),
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

jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Error: "Error" },
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: jest.Mock } => ({ showToast: jest.fn() }),
}));

jest.mock("@/hooks", () => ({
  useKeyboardVisibility: (): boolean => false,
}));

jest.mock("@/hooks/useEgyptianInstitutionEligibility", () => ({
  useEgyptianInstitutionEligibility: (): { readonly isEligible: boolean } => ({
    isEligible: true,
  }),
}));

jest.mock("@/hooks/useAccountById", () => ({
  useAccountById: (): unknown => ({
    account: {
      id: "account-1",
      name: "CIB salary",
      type: "BANK",
      currency: "EGP",
      balance: 500,
      isDefault: false,
      institutionId: "cib",
      providerDisplayName: "CIB",
    },
    bankDetails: null,
    isLoading: false,
  }),
}));

jest.mock("@/hooks/useAccountDisplayNames", () => ({
  useAccountDisplayName: (): string => "CIB salary",
}));

jest.mock("@/hooks/useDeleteAccount", () => ({
  useDeleteAccount: (): unknown => ({
    performDelete: jest.fn(),
    isDeleting: false,
    linkedCounts: { transactions: 0, transfers: 0 },
    isLoadingCounts: false,
    loadCounts: jest.fn(),
  }),
}));

jest.mock("@/hooks/useEditAccountForm", () => ({
  useEditAccountForm: (): unknown => ({
    formData: {
      balance: "500",
      bankName: "CIB",
      cardLast4: "",
      institutionId: "cib",
      name: "CIB salary",
      providerDisplayName: "CIB",
      senderNames: ["CIB"],
    },
    errors: {},
    isValid: true,
    isDirty: false,
    isCheckingUniqueness: false,
    accountType: "BANK",
    currency: "EGP",
    isDefault: false,
    originalBalance: 500,
    updateField: jest.fn(),
    selectKnownInstitution: jest.fn(),
    selectOtherInstitution: jest.fn(),
    updateSenderNames: jest.fn(),
    toggleDefault: jest.fn(),
    validate: jest.fn(),
  }),
}));

jest.mock("@/hooks/useUpdateAccount", () => ({
  useUpdateAccount: (): unknown => ({
    performUpdate: jest.fn(),
    isSubmitting: false,
  }),
}));

// Institution-info rendering receives an owner-aligned default snapshot;
// the actual reactive SQLite ownership/CAS path is covered separately.
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

jest.mock("@/components/ui/TextField", () => {
  return {
    TextField: (): null => null,
  };
});

jest.mock("@/components/edit-account/BalanceChangedSheet", () => ({
  BalanceChangedSheet: (): null => null,
}));

jest.mock("@/components/edit-account/DeleteAccountSheet", () => ({
  DeleteAccountSheet: (): null => null,
}));

jest.mock("@/components/edit-account/ReadOnlyDropdown", () => ({
  ReadOnlyDropdown: (): null => null,
}));

jest.mock("@/components/edit-account/EditAccountSkeleton", () => ({
  EditAccountSkeleton: (): null => null,
}));

jest.mock("@/components/add-account/BankCardDetailsSection", () => ({
  BankCardDetailsSection: (): null => null,
}));

jest.mock("@/utils/haptics", () => ({
  safeNotificationHaptic: jest.fn(),
}));

// Import after mocks.
// eslint-disable-next-line import/first
import EditAccount from "../../app/(private)/edit-account";

describe("Edit account institution info", () => {
  it("shows the provider-details info control in the bank edit flow", () => {
    render(<EditAccount />);

    expect(screen.getByLabelText("Why this helps")).toBeTruthy();
  });

  it("keeps message detection collapsed by default", () => {
    render(<EditAccount />);

    expect(screen.getByText("Message detection (optional)")).toBeTruthy();
    expect(screen.queryByText("SMS sender names")).toBeNull();
  });
});
