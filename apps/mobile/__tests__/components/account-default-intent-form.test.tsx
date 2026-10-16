/**
 * #395 T065 TESTS FIRST — actual Add/Edit routes and actual form hooks.
 * Context, Expo adapter and unrelated live-rate provider are isolated.
 * No account UI component, default-control module, form hook or business SUT
 * is mocked. Approved new UI/copy is intentionally missing at this source parent.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react-native";
import i18next, { type i18n } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import enAccounts from "@/locales/en/accounts.json";
import arAccounts from "@/locales/ar/accounts.json";
import enCommon from "@/locales/en/common.json";
import arCommon from "@/locales/ar/common.json";
import * as accountService from "@/services/account-service";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import AddAccount from "../../app/(private)/add-account";
import EditAccount from "../../app/(private)/edit-account";
import {
  APPROVED_DEFAULT_COPY,
  DEFAULT_FORM_A,
  DEFAULT_FORM_B,
  DEFAULT_FORM_OWNER,
  createDeferredResult,
  resetDefaultFormLedger,
  seedDefaultFormAccount,
  seedDefaultFormBankChildren,
} from "./account-default-intent-form-fixtures";

let mockOwnerId = DEFAULT_FORM_OWNER;
let mockLocaleLanguage: "en" | "ar" = "en";
let mockTypeParam: string | undefined = "CASH";
let mockAccountId: string = DEFAULT_FORM_A;
let mockIsDark = false;
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
const mockToast = jest.fn();

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual("@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js")
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const factory = jest.requireActual<
    typeof import("./account-default-intent-form-fixtures")
  >("./account-default-intent-form-fixtures");
  const ledger = factory.createDefaultFormLedger();
  return {
    database: ledger.database,
    __adapter: ledger.adapter,
    ...Object.fromEntries(
      factory.DEFAULT_FORM_MODEL_CLASSES.map((model) => [model.name, model])
    ),
  };
});
jest.mock("expo-router", () => ({
  useLocalSearchParams: (): Readonly<{
    type: string | undefined;
    id: string;
  }> => ({
    type: mockTypeParam,
    id: mockAccountId,
  }),
  useRouter: () => ({
    back: mockGoBack,
    canGoBack: (): boolean => true,
    replace: mockReplace,
  }),
  router: { push: jest.fn(), back: mockGoBack, replace: mockReplace },
}));
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: mockOwnerId },
    isLoading: false,
    isAuthenticated: true,
  }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: mockIsDark, toggleTheme: () => undefined }),
}));
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({
    language: mockLocaleLanguage,
    isRTL: mockLocaleLanguage === "ar",
  }),
}));
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockOwnerId),
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "Success", Error: "Error" },
  notificationAsync: (): Promise<void> => Promise.resolve(),
}));
jest.mock("expo-localization", () => ({
  getLocales: () => [{
    languageCode: mockLocaleLanguage,
    regionCode: "EG",
    languageTag: mockLocaleLanguage === "ar" ? "ar-EG" : "en-EG",
  }],
  getCalendars: () => [],
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));
/** Market valuations are not part of Add/Edit account-default behavior. */
jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: () => ({
    selectedSnapshot: null,
    previousDayRate: null,
    isLoading: false,
    isCurrentLoading: false,
    isHistoryLoading: false,
    currentError: null,
    isConnected: false,
    lastUpdated: null,
    isStale: false,
    refreshSelectedSnapshot: () => undefined,
  }),
}));

const mockDb = jest.requireMock<{
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}>("@monyvi/db");

async function makeI18n(language: "en" | "ar" = "en"): Promise<i18n> {
  mockLocaleLanguage = language;
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: language,
    resources: {
      en: { accounts: enAccounts, common: enCommon },
      ar: { accounts: arAccounts, common: arCommon },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

async function renderAdd(language: "en" | "ar" = "en"): Promise<void> {
  const instance = await makeI18n(language);
  render(
    <I18nextProvider i18n={instance}>
      <DatabaseProvider><AddAccount /></DatabaseProvider>
    </I18nextProvider>
  );
  // A real owner-scoped Watermelon observation is asynchronous. Do not
  // interpret the initial loading state as proof of an empty owned account set.
  await waitFor(() =>
    expect(screen.getByTestId("account-default-state-ready")).toBeTruthy()
  );
}

async function renderEdit(language: "en" | "ar" = "en"): Promise<void> {
  const instance = await makeI18n(language);
  render(
    <I18nextProvider i18n={instance}>
      <DatabaseProvider><EditAccount /></DatabaseProvider>
    </I18nextProvider>
  );
  await waitFor(() =>
    expect(screen.getByTestId("account-name-input")).toHaveProp("value", "Cash")
  );
  await waitFor(() =>
    expect(screen.getByTestId("account-default-state-ready")).toBeTruthy()
  );
}

function defaultFlag(): ReturnType<typeof screen.getByRole> {
  return screen.getByRole("switch", { name: /default account|الحساب الافتراضي/i });
}

async function seedExistingDefault(
  options: Readonly<{ isDefault?: boolean; type?: "BANK" | "CASH" }> = {}
): Promise<void> {
  await seedDefaultFormAccount(mockDb.database, {
    id: DEFAULT_FORM_A,
    type: options.type ?? "CASH",
    default: options.isDefault ?? true,
    name: "Cash",
  });
}

function assertExistingFieldsUnchanged(
  expectedName: string,
  expectedBalance: string
): void {
  expect(screen.getByTestId("account-name-input"))
    .toHaveProp("value", expectedName);
  expect(screen.getByTestId("initial-balance-input"))
    .toHaveProp("value", expectedBalance);
}

beforeEach(async (): Promise<void> => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockOwnerId = DEFAULT_FORM_OWNER;
  mockTypeParam = "CASH";
  mockAccountId = DEFAULT_FORM_A;
  mockLocaleLanguage = "en";
  mockIsDark = false;
  await mockDb.__adapter.initializingPromise;
  await resetDefaultFormLedger(mockDb.database);
});

afterEach((): void => {
  cleanup();
});

describe("#395 T065 Add Account approved default-control behavior", () => {
  it("first Cash is ON, disabled, accessible, and explains Voice-only default + SMS restriction", async (): Promise<void> => {
    await renderAdd();
    const control = defaultFlag();
    expect(control).toHaveProp("accessibilityRole", "switch");
    expect(control).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true, disabled: true,
    }));
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.first)).toBeTruthy();
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.cashHelper)).toBeTruthy();
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.cashRestriction)).toBeTruthy();
    fireEvent.press(control);
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true, disabled: true,
    }));
    expect(screen.queryByText(/parsing|parser|AI token/i)).toBeNull();
  });

  it("later account starts OFF; toggling ON announces replacement without changing existing inputs", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    await renderAdd();
    const control = defaultFlag();
    expect(control).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false, disabled: false,
    }));
    fireEvent.changeText(screen.getByTestId("account-name-input"), "New Savings");
    fireEvent.changeText(screen.getByTestId("initial-balance-input"), "123.45");
    fireEvent.press(defaultFlag());
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true, disabled: false,
    }));
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.replace)).toBeTruthy();
    assertExistingFieldsUnchanged("New Savings", "123.45");
    expect(screen.getByTestId("institution-provider-section")).toBeTruthy();
  });

  it("later account OFF does not show misleading replacement; existing default remains an unsaved preference", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    await renderAdd();
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false,
    }));
    expect(screen.queryByText(APPROVED_DEFAULT_COPY.en.replace)).toBeNull();
    const before = await mockDb.database.get("accounts").query().fetch();
    expect(before).toHaveLength(1);
    fireEvent.press(screen.getByTestId("header-back"));
    const after = await mockDb.database.get("accounts").query().fetch();
    expect(after).toHaveLength(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("existing owned account with intentionally no default starts OFF and can be turned ON without fake previous-default notice", async (): Promise<void> => {
    await seedExistingDefault({ isDefault: false });
    mockTypeParam = "BANK";
    await renderAdd();
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false, disabled: false,
    }));
    fireEvent.press(defaultFlag());
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true, disabled: false,
    }));
    expect(screen.queryByText(APPROVED_DEFAULT_COPY.en.replace)).toBeNull();
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.bankHelper)).toBeTruthy();
  });

  it("default helper sits after initial balance and before unchanged SMS matching in the actual Add tree", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    await renderAdd();
    const tree = JSON.stringify(screen.toJSON());
    const balance = tree.indexOf(enAccounts.initial_balance);
    const flag = tree.indexOf(enAccounts.default_account);
    const sms = tree.indexOf(enAccounts.sms_matching_optional);
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(flag).toBeGreaterThan(balance);
    expect(sms).toBeGreaterThan(flag);
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.bankHelper)).toBeTruthy();
  });

  it("toggling default preserves Bank provider, sender and card form values and name focus", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    await renderAdd();
    fireEvent.press(screen.getByLabelText("Choose bank"));
    fireEvent.press(screen.getByText("CIB (Commercial International Bank)"));
    fireEvent.changeText(screen.getByTestId("account-name-input"), "CIB Salary");
    fireEvent.changeText(screen.getByTestId("initial-balance-input"), "50.25");
    fireEvent.press(screen.getByText(enAccounts.sms_matching_optional));
    fireEvent.changeText(screen.getByLabelText(enAccounts.card_last_4_digits), "1234");
    const nameInput = screen.getByTestId("account-name-input");
    fireEvent(nameInput, "focus");
    fireEvent.press(defaultFlag());
    expect(screen.getByTestId("account-name-input")).toBe(nameInput);
    assertExistingFieldsUnchanged("CIB Salary", "50.25");
    expect(screen.getByLabelText(enAccounts.card_last_4_digits))
      .toHaveProp("value", "1234");
    expect(screen.getByTestId("institution-provider-section")).toBeTruthy();
  });

  it("default toggle never bypasses required account name or invalid opening balance", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    await renderAdd();
    expect(screen.getByTestId("header-save")).toHaveProp("disabled", true);
    fireEvent.press(defaultFlag());
    expect(screen.getByTestId("header-save")).toHaveProp("disabled", true);
    fireEvent.changeText(screen.getByTestId("account-name-input"), "Salary");
    fireEvent.changeText(screen.getByTestId("initial-balance-input"), "12..5");
    expect(screen.getByTestId("header-save")).toHaveProp("disabled", true);
    expect(screen.getByTestId("account-name-input")).toHaveProp(
      "accessibilityLabel", enAccounts.account_name
    );
    expect(screen.getByTestId("initial-balance-input")).toHaveProp(
      "accessibilityLabel", enAccounts.initial_balance
    );
  });

  it("save receives the chosen ON intent once, with the actual validated account fields", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    const pending = createDeferredResult<accountService.CreateAccountResult>();
    const service = jest.spyOn(accountService, "createAccountForUser")
      .mockImplementation(() => pending.promise);
    await renderAdd();
    fireEvent.changeText(screen.getByTestId("account-name-input"), "Salary Account");
    fireEvent.press(defaultFlag());
    await waitFor(() => expect(screen.getByTestId("header-save"))
      .toHaveProp("disabled", false));
    fireEvent.press(screen.getByTestId("header-save"));
    fireEvent.press(screen.getByTestId("header-save"));
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith(DEFAULT_FORM_OWNER, expect.objectContaining({
      name: "Salary Account",
      accountType: "BANK",
      defaultIntent: true,
      balance: "0",
    }));
    expect(screen.getByTestId("header-save")).toHaveProp("disabled", true);
    await act(async (): Promise<void> => {
      pending.resolve({ success: false, error: "account_core_writer_stale_account_state" });
      await pending.promise;
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
    assertExistingFieldsUnchanged("Salary Account", "0");
  });

  it("an unsuccessful/default-stale save gives recoverable feedback without losing the chosen form state", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    const service = jest.spyOn(accountService, "createAccountForUser")
      .mockResolvedValue({
        success: false,
        error: "account_core_writer_stale_account_state",
      });
    await renderAdd();
    fireEvent.changeText(screen.getByTestId("account-name-input"), "Keep My Details");
    fireEvent.press(defaultFlag());
    fireEvent.press(screen.getByTestId("header-save"));
    await waitFor(() => expect(service).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    ));
    assertExistingFieldsUnchanged("Keep My Details", "0");
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true,
    }));
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("reuses the existing Add CurrencyPicker modal, not a second custom picker", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    await renderAdd();
    fireEvent.press(screen.getByRole("button", { name: enAccounts.currency }));
    expect(screen.getByText(enCommon.select_currency)).toBeTruthy();
    const searchInput = screen.getByPlaceholderText(enCommon.search_currency_name_code);
    fireEvent.changeText(searchInput, "USD");
    expect(screen.getByTestId("currency-code-row-USD")).toBeTruthy();
    fireEvent.changeText(searchInput, "EGP");
    expect(screen.getByTestId("currency-code-row-EGP")).toBeTruthy();
    expect(screen.queryByText(/For Lunch at Talabat/i)).toBeNull();
  });

  it("shows the approved Arabic default control and account-type-aware Arabic helper", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "DIGITAL_WALLET";
    await renderAdd("ar");
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false, disabled: false,
    }));
    expect(screen.getByText(APPROVED_DEFAULT_COPY.ar.label)).toBeTruthy();
    expect(screen.getByText(APPROVED_DEFAULT_COPY.ar.bankHelper)).toBeTruthy();
    expect(screen.queryByText(/تحليل|parsing/i)).toBeNull();
  });
});

describe("#395 T065 existing Edit default flag and unchanged account form", () => {
  it("renders the existing ON bank default as an accessible switch with the approved updated helper", async (): Promise<void> => {
    await seedDefaultFormAccount(mockDb.database, {
      id: DEFAULT_FORM_A, type: "BANK", default: true, name: "Cash",
    });
    await seedDefaultFormBankChildren(mockDb.database, DEFAULT_FORM_A);
    await renderEdit();
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true, disabled: false,
    }));
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.bankHelper)).toBeTruthy();
    expect(screen.getByTestId("account-name-input")).toHaveProp("value", "Cash");
    expect(screen.getByTestId("initial-balance-input")).toHaveProp("value", "100");
  });

  it("Edit toggle changes local preference only, leaves account type/currency locked and provider/SMS fields intact", async (): Promise<void> => {
    await seedDefaultFormAccount(mockDb.database, {
      id: DEFAULT_FORM_A, type: "BANK", default: true, name: "Cash",
    });
    await seedDefaultFormBankChildren(mockDb.database, DEFAULT_FORM_A);
    await renderEdit();
    expect(screen.getByText(enAccounts.account_type)).toBeTruthy();
    expect(screen.getByText(enAccounts.currency)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: enAccounts.currency })).toBeNull();
    fireEvent.press(defaultFlag());
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false, disabled: false,
    }));
    assertExistingFieldsUnchanged("Cash", "100");
    expect(screen.getByTestId("institution-provider-section")).toBeTruthy();
    fireEvent.press(screen.getByText(enAccounts.sms_matching_optional));
    expect(screen.getByLabelText(enAccounts.card_last_4_digits))
      .toHaveProp("value", "1234");
    const fresh = await mockDb.database.get("accounts").find(DEFAULT_FORM_A);
    expect(fresh).toHaveProperty("isDefault", true);
  });

  it("Edit OFF initially remains accessible and switches ON without losing the balance/name fields", async (): Promise<void> => {
    await seedDefaultFormAccount(mockDb.database, {
      id: DEFAULT_FORM_A, type: "CASH", default: false, name: "Cash",
    });
    await renderEdit();
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false,
    }));
    fireEvent.press(defaultFlag());
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true,
    }));
    assertExistingFieldsUnchanged("Cash", "100");
    expect(screen.getByTestId("header-save")).toHaveProp("disabled", false);
  });
});

describe("#395 T065 approved copy and scoped presentation contract", () => {
  it("ships the exact approved Bank, Cash, first and replacement messages in both real account locale resources", (): void => {
    const englishValues = Object.values(enAccounts);
    const arabicValues = Object.values(arAccounts);
    for (const copy of [
      APPROVED_DEFAULT_COPY.en.bankHelper,
      APPROVED_DEFAULT_COPY.en.cashHelper,
      APPROVED_DEFAULT_COPY.en.cashRestriction,
      APPROVED_DEFAULT_COPY.en.first,
      APPROVED_DEFAULT_COPY.en.replace,
    ]) {
      expect(englishValues).toContain(copy);
      expect(copy).not.toMatch(/parsing|parser|LLM|token/i);
    }
    for (const copy of [
      APPROVED_DEFAULT_COPY.ar.bankHelper,
      APPROVED_DEFAULT_COPY.ar.cashHelper,
      APPROVED_DEFAULT_COPY.ar.cashRestriction,
      APPROVED_DEFAULT_COPY.ar.first,
      APPROVED_DEFAULT_COPY.ar.replace,
    ]) {
      expect(arabicValues).toContain(copy);
    }
  });

  it("retains the B1 star/toggle semantics and readable helper instead of inventing a second button pattern", async (): Promise<void> => {
    await seedExistingDefault();
    mockTypeParam = "BANK";
    mockIsDark = true;
    await renderAdd();
    const control = defaultFlag();
    expect(control).toHaveProp("accessibilityRole", "switch");
    expect(control).toHaveProp("accessibilityLabel",
      expect.stringMatching(/default account/i));
    expect(control).toHaveProp("accessibilityState", expect.objectContaining({
      checked: false, disabled: false,
    }));
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).toContain("star-outline");
    expect(tree).toContain("dark:");
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.bankHelper)).toBeTruthy();
  });

  it("does not mistake unrelated active foreign or deleted accounts for the first-owned-account default decision", async (): Promise<void> => {
    await seedDefaultFormAccount(mockDb.database, {
      id: DEFAULT_FORM_A,
      default: true,
      owner: "018f0c7a-1234-4abc-8def-000000000999",
    });
    await seedDefaultFormAccount(mockDb.database, {
      id: DEFAULT_FORM_B, default: true, deleted: true,
    });
    mockTypeParam = "CASH";
    await renderAdd();
    expect(defaultFlag()).toHaveProp("accessibilityState", expect.objectContaining({
      checked: true, disabled: true,
    }));
    expect(screen.getByText(APPROVED_DEFAULT_COPY.en.first)).toBeTruthy();
  });
});
