/**
 * TransactionEditModal
 *
 * Inline bottom-sheet modal for editing a parsed SMS transaction directly
 * from the review page. Allows editing: amount, category, account, counterparty,
 * date, and transaction type — without navigating away.
 *
 * Account modes:
 * 1. Dropdown (default) — when bank accounts exist, shows tappable list
 * 2. Text input — when no accounts exist OR user taps "+ New"
 * 3. "+ New" toggle — creates a PendingAccount on save
 *
 * @module TransactionEditModal
 */

import { palette } from "@/constants/colors";
import type { PendingAccount } from "@/services/pending-account-service";
import type { AccountWithBankDetails } from "@/services/sms-account-matcher";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";
import { formatToLocalDateString } from "@/utils/dateHelpers";
import type { Category, MarketRate } from "@monyvi/db";
import {
  formatConversionPreview,
  formatAmountInput,
  parseAmountInput,
  CURRENCY_INFO_MAP,
  type ReviewableTransaction,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { TypeTabs } from "../../add-transaction/TypeTabs";
import { CurrencyPicker } from "../../currency/CurrencyPicker";
import { CategorySelectorModal } from "../../modals/CategorySelectorModal";
import { AccountSelector } from "./AccountSelector";
import { SmsEditIcon } from "./SmsEditIcon";
import { SmsReviewAccountPicker } from "./SmsReviewAccountPicker";
import {
  useTransactionEditState,
  type UseTransactionEditStateReturn,
} from "@/hooks/useTransactionEditState";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

export interface TransactionEditModalProps {
  /** Whether the modal is visible */
  readonly visible: boolean;
  /** The transaction being edited */
  readonly transaction: ReviewableTransaction;
  readonly sourceVariant?: "default" | "sms";
  /** Currently assigned account name */
  readonly currentAccountName: string | null;
  /** Currently assigned account ID */
  readonly currentAccountId: string | null;
  /** Available bank accounts for the account picker */
  readonly accounts: readonly AccountWithBankDetails[];
  /** In-memory pending accounts created this session */
  readonly pendingAccounts: readonly PendingAccount[];
  /** Market rates for currency conversion (optional, from useMarketRates) */
  readonly latestRates: MarketRate | null;
  /** Map of category IDs to categories */
  readonly categoryMap: ReadonlyMap<string, Category>;
  /** Expense categories for the category picker */
  readonly expenseCategories: readonly Category[];
  /** Income categories for the category picker */
  readonly incomeCategories: readonly Category[];
  /** Called with the edits when user saves */
  readonly onSave: (edits: TransactionEdits) => void;
  /** Called when a new PendingAccount is created via "+ New" */
  readonly onCreatePendingAccount: (account: PendingAccount) => void;
  /** Called when modal is dismissed without saving */
  readonly onClose: () => void;
}

export function TransactionEditModal(
  props: TransactionEditModalProps
): React.JSX.Element {
  const {
    visible,
    onClose,
    latestRates,
    transaction,
    sourceVariant = "default",
  } = props;
  const isSmsWorkspace = sourceVariant === "sms";
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();

  const { state, setters, accountHandlers } = useTransactionEditState({
    ...props,
    allowTransactionCurrencyEdit: isSmsWorkspace,
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : isSmsWorkspace
              ? "height"
              : undefined
        }
        className="flex-1 justify-end"
      >
        {/* Backdrop */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          className="flex-1 bg-black/50"
        />

        {/* Modal content */}
        <View
          className={`rounded-t-3xl bg-white dark:bg-slate-900 ${
            isSmsWorkspace ? "max-h-[78%]" : "max-h-[85%]"
          }`}
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/50 mb-6">
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text className="text-slate-500 dark:text-slate-400 text-base font-bold">
                {t("cancel")}
              </Text>
            </TouchableOpacity>
            <Text className="text-slate-800 dark:text-white text-lg font-bold">
              {t("edit_transaction")}
            </Text>
            <TouchableOpacity
              onPress={accountHandlers.handleSave}
              activeOpacity={0.7}
              className="bg-nileGreen-500 px-5 py-1.5 rounded-full"
            >
              <Text className="text-white text-sm font-semibold">
                {t("save")}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-7"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Sender info (read-only) */}
            <View
              testID={isSmsWorkspace ? "sms-edit-provider-identity" : undefined}
              className={`mb-4 flex-row items-center gap-3 px-1 py-2 ${
                isSmsWorkspace
                  ? ""
                  : "rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/60"
              }`}
            >
              <View className="w-10 h-10 rounded-full bg-emerald-500/20 items-center justify-center me-3">
                <Ionicons
                  name="business-outline"
                  size={25}
                  color={palette.nileGreen[400]}
                />
              </View>
              <View className="flex-1">
                <Text className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">
                  {t("from_label")}
                </Text>
                <Text
                  className="text-sm text-slate-800 dark:text-white font-semibold flex-shrink"
                  numberOfLines={1}
                >
                  {transaction.originLabel}
                </Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">
                  {formatToLocalDateString(transaction.date)}
                </Text>
              </View>
            </View>

            {isSmsWorkspace ? (
              <SmsReviewEditFields
                state={state}
                setters={setters}
                accountHandlers={accountHandlers}
                transaction={transaction}
                latestRates={latestRates}
              />
            ) : (
              <>
                {/* Type toggle */}
                {!isSmsWorkspace && state.formConfig.showTypeToggle && (
                  <View className="mb-2">
                    <TypeTabs
                      selectedType={state.txType}
                      onSelect={(type) => {
                        if (type === "EXPENSE" || type === "INCOME") {
                          setters.setTxType(type);
                        }
                      }}
                      hideTransfer={true}
                      containerClassName="mx-0"
                    />
                  </View>
                )}

                {/* Conditional Source Badge (e.g. Cash Withdrawal read-only) */}
                {state.formConfig.sourceTypeBadge && (
                  <View className="mb-4 bg-amber-500/15 rounded-xl p-3 border border-amber-500/30">
                    <View className="flex-row items-center">
                      <Ionicons
                        name={
                          state.formConfig.sourceTypeBadge
                            .iconName as keyof typeof Ionicons.glyphMap
                        }
                        size={18}
                        color={palette.gold[500]}
                      />
                      <Text className="text-sm font-bold text-amber-400 ms-2">
                        {state.formConfig.sourceTypeBadge.label}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Amount */}
                <View className="mb-4">
                  <Text className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">
                    {t("amount")}
                  </Text>
                  <View
                    className={`w-full bg-slate-100 dark:bg-slate-800/60 border rounded-xl py-4 px-4 flex-row items-center ${
                      state.formErrors.amount
                        ? "border-red-500/60"
                        : "border-slate-200 dark:border-slate-700/50"
                    }`}
                  >
                    <View className="bg-slate-200 dark:bg-slate-700/60 rounded-lg px-2.5 py-1 me-3">
                      <Text className="text-slate-800 dark:text-white font-bold text-xs">
                        {state.selectedAccountCurrency}
                      </Text>
                    </View>
                    <TextInput
                      value={formatAmountInput(state.amount)}
                      onChangeText={(text) => {
                        setters.setAmount(parseAmountInput(text));
                        if (state.formErrors.amount) {
                          setters.setFormErrors((prev) => ({
                            ...prev,
                            amount: undefined,
                          }));
                        }
                      }}
                      keyboardType="numeric"
                      className="flex-1 text-slate-800 dark:text-white text-xl font-bold m-0 p-0"
                      placeholderTextColor={palette.slate[600]}
                      placeholder="0.00"
                    />
                  </View>
                  {state.formErrors.amount && (
                    <Text className="text-xs text-red-400 mt-1.5 ms-1">
                      {state.formErrors.amount}
                    </Text>
                  )}
                </View>

                {/* Currency conversion notice  */}
                {state.hasCurrencyMismatch && (
                  <View className="mb-4 bg-blue-500/10 rounded-xl p-3 border border-blue-500/25">
                    <View className="flex-row items-center">
                      <Ionicons
                        name="swap-horizontal"
                        size={16}
                        color={palette.blue[500]}
                      />
                      <Text className="text-xs text-blue-400 font-medium ms-2 flex-shrink">
                        {formatConversionPreview(
                          state.amount,
                          transaction.currency,
                          state.selectedAccountCurrency,
                          latestRates
                        )}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Counterparty */}
                {state.formConfig.showCounterparty && (
                  <View className="mb-4">
                    <Text className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">
                      {state.txType === "EXPENSE" ? t("merchant") : t("payee")}
                    </Text>
                    <TextInput
                      value={state.counterparty}
                      onChangeText={setters.setCounterparty}
                      className="bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 text-slate-800 dark:text-white text-base font-semibold border border-slate-200 dark:border-slate-700/50"
                      placeholderTextColor={palette.slate[600]}
                      placeholder={t("counterparty_placeholder")}
                    />
                  </View>
                )}

                {/* Note (for voice transactions) */}
                {transaction.source === "VOICE" && (
                  <View className="mb-4">
                    <Text className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">
                      {t("note_label")}
                    </Text>
                    <TextInput
                      value={state.note}
                      onChangeText={setters.setNote}
                      className="bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 text-slate-800 dark:text-white text-base font-semibold border border-slate-200 dark:border-slate-700/50"
                      placeholderTextColor={palette.slate[600]}
                      placeholder={t("note_edit_placeholder")}
                      multiline
                    />
                  </View>
                )}

                {/* Category (tap to open picker) */}
                {state.formConfig.showCategory && (
                  <View className="mb-4">
                    <Text className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">
                      {t("category")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (state.formErrors.categoryId) {
                          setters.setFormErrors((prev) => ({
                            ...prev,
                            categoryId: undefined,
                          }));
                        }
                        setters.setIsCategoryPickerOpen(true);
                      }}
                      activeOpacity={0.7}
                      className={`bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 flex-row items-center justify-between border ${!state.selectedCategoryId || state.formErrors.categoryId ? "border-red-500/60" : "border-slate-200 dark:border-slate-700/50"}`}
                    >
                      <Text
                        className={`text-base font-semibold ${!state.selectedCategoryId ? "text-slate-500" : "text-slate-800 dark:text-white"}`}
                        numberOfLines={1}
                      >
                        {state.selectedCategoryDisplayName ??
                          t("select_category_label")}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={palette.slate[400]}
                      />
                    </TouchableOpacity>
                    {state.formErrors.categoryId && (
                      <Text className="text-xs text-red-400 mt-1.5 ms-1">
                        {state.formErrors.categoryId}
                      </Text>
                    )}
                  </View>
                )}

                {/* ── Main Account Selector ──────────────────────────────────── */}
                <AccountSelector
                  label={
                    state.formConfig.showToAccount
                      ? t("from_account_label")
                      : t("account_label")
                  }
                  options={state.accountOptions}
                  placeholder={
                    state.formConfig.showToAccount
                      ? t("select_source_bank")
                      : t("select_an_account")
                  }
                  hintMessage={t("create_account_hint", {
                    name:
                      state.newAccountName.trim() || t("new_account_default"),
                    currency: state.selectedAccountCurrency,
                  })}
                  themeColor="emerald"
                  isSecondary={false}
                  selectedId={state.selectedAccountId}
                  selectedName={state.selectedAccountName}
                  onSelect={accountHandlers.handleSelectAccount}
                  isPickerOpen={state.isAccountPickerOpen}
                  onTogglePicker={() =>
                    setters.setIsAccountPickerOpen(!state.isAccountPickerOpen)
                  }
                  errorMsg={state.formErrors.accountId}
                  allowCreateNew={true}
                  isCreatingNew={state.isCreatingNew || !state.hasBankAccounts}
                  newAccountName={state.newAccountName}
                  onNewAccountNameChange={(text) => {
                    setters.setNewAccountName(text);
                    setters.setFormErrors({
                      ...state.formErrors,
                      accountId: undefined,
                    });
                  }}
                  newAccountError={state.newAccountError}
                  onStartNew={accountHandlers.handleStartNew}
                  onCancelNew={accountHandlers.handleCancelNew}
                  matchingAccounts={state.matchingAccounts}
                  otherAccounts={state.otherAccounts}
                  showSectionHeaders={state.showSectionHeaders}
                  matchingSectionLabel={t("matching_accounts_label", {
                    currency: transaction.currency,
                  })}
                />

                {/* ── Currency Field ──────────────────────────────────────── */}
                <View className="mb-4">
                  <Text className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">
                    {t("currency")}
                  </Text>
                  {state.isCurrencyLocked ? (
                    /* Locked: show as a static read-only badge */
                    <View className="bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 flex-row items-center border border-slate-200 dark:border-slate-700/50 opacity-60">
                      <Text className="text-lg me-2">
                        {CURRENCY_INFO_MAP[state.selectedAccountCurrency]
                          ?.flag ?? "💱"}
                      </Text>
                      <Text className="text-base font-semibold text-slate-800 dark:text-white">
                        {state.selectedAccountCurrency}
                      </Text>
                      <Ionicons
                        name="lock-closed"
                        size={14}
                        color={palette.slate[400]}
                      />
                      <Text className="text-xs text-slate-400 ms-auto">
                        {t("currency_locked_hint")}
                      </Text>
                    </View>
                  ) : (
                    /* Editable: tappable to open CurrencyPicker */
                    <TouchableOpacity
                      onPress={() => setters.setIsCurrencyPickerOpen(true)}
                      activeOpacity={0.7}
                      className="bg-slate-100 dark:bg-slate-800/60 rounded-xl px-4 py-3 flex-row items-center justify-between border border-nileGreen-500/40"
                    >
                      <View className="flex-row items-center">
                        <Text className="text-lg me-2">
                          {CURRENCY_INFO_MAP[state.selectedAccountCurrency]
                            ?.flag ?? "💱"}
                        </Text>
                        <Text className="text-base font-semibold text-slate-800 dark:text-white">
                          {state.selectedAccountCurrency}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={palette.nileGreen[500]}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── Cash Withdrawal TO account selector ──────────────────────────────────── */}
                {state.formConfig.showToAccount && (
                  <AccountSelector
                    label={t("to_account_label")}
                    options={state.cashAccountOptions}
                    placeholder={t("select_cash_account")}
                    hintMessage={t("cash_account_hint", {
                      name: state.newToAccountName.trim() || t("cash_default"),
                      currency: transaction.currency,
                    })}
                    themeColor="amber"
                    iconName="cash"
                    isSecondary={true}
                    selectedId={state.selectedToAccountId}
                    selectedName={state.selectedToAccountName}
                    onSelect={(opt) => {
                      setters.setSelectedToAccountId(opt.id);
                      setters.setSelectedToAccountName(opt.name);
                      setters.setIsToAccountPickerOpen(false);
                    }}
                    isPickerOpen={state.isToAccountPickerOpen}
                    onTogglePicker={() =>
                      setters.setIsToAccountPickerOpen(
                        !state.isToAccountPickerOpen
                      )
                    }
                    errorMsg={undefined}
                    allowCreateNew={true}
                    isCreatingNew={!state.hasCashAccounts} // ATM strictly falls back if no cash account exists
                    newAccountName={state.newToAccountName}
                    onNewAccountNameChange={setters.setNewToAccountName}
                    newAccountError={null}
                    onStartNew={() => null}
                    onCancelNew={() => null}
                  />
                )}
              </>
            )}

            {/* Bottom spacing */}
            <View style={{ height: bottomInset + 32 }} />
          </ScrollView>
        </View>

        {/* ── Category selector modal ─────────────────────────────── */}
        <CategorySelectorModal
          visible={state.isCategoryPickerOpen}
          rootCategories={state.relevantCategories}
          selectedId={state.selectedCategoryId}
          type={state.txType}
          onSelect={setters.setSelectedCategoryId}
          onClose={() => setters.setIsCategoryPickerOpen(false)}
        />

        {/* ── Currency picker modal ─────────────────────────────── */}
        <CurrencyPicker
          visible={state.isCurrencyPickerOpen}
          selectedCurrency={state.selectedAccountCurrency}
          onSelect={accountHandlers.handleCurrencySelect}
          onClose={() => setters.setIsCurrencyPickerOpen(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface SmsReviewEditFieldsProps {
  readonly state: UseTransactionEditStateReturn["state"];
  readonly setters: UseTransactionEditStateReturn["setters"];
  readonly accountHandlers: UseTransactionEditStateReturn["accountHandlers"];
  readonly transaction: ReviewableTransaction;
  readonly latestRates: MarketRate | null;
}

type SmsEditableField = "amount" | "merchant" | null;

function SmsReviewEditFields({
  state,
  setters,
  accountHandlers,
  transaction,
  latestRates,
}: SmsReviewEditFieldsProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const [focusedField, setFocusedField] = useState<SmsEditableField>(null);

  const openCategory = (): void => {
    if (state.formErrors.categoryId) {
      setters.setFormErrors((previous) => ({
        ...previous,
        categoryId: undefined,
      }));
    }
    setters.setIsCategoryPickerOpen(true);
  };

  const updateAmount = (text: string): void => {
    setters.setAmount(parseAmountInput(text));
    if (state.formErrors.amount) {
      setters.setFormErrors((previous) => ({ ...previous, amount: undefined }));
    }
  };

  return (
    <View testID="sms-edit-fields" className="pb-2">
      {state.formConfig.sourceTypeBadge && (
        <View className="mb-3 flex-row items-center rounded-xl border border-amber-500/30 bg-amber-500/15 p-3">
          <Ionicons
            name={
              state.formConfig.sourceTypeBadge
                .iconName as keyof typeof Ionicons.glyphMap
            }
            size={18}
            color={palette.gold[500]}
          />
          <Text className="ms-2 text-sm font-bold text-amber-500">
            {state.formConfig.sourceTypeBadge.label}
          </Text>
        </View>
      )}

      <View className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
        <View
          testID="sms-edit-amount"
          className={`min-h-16 flex-row items-center border-b px-4 py-3 ${
            focusedField === "amount"
              ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-nileGreen-900"
              : "border-slate-200 dark:border-slate-700"
          }`}
        >
          <SmsEditIcon name="cash-outline" color={palette.nileGreen[500]} />
          <View className="ms-3 flex-1">
            <Text className="text-xs font-medium text-text-muted">
              {t("amount")}
            </Text>
            <View className="flex-row items-center">
              <Text className="me-1 text-base font-semibold text-text-primary">
                {transaction.currency}
              </Text>
              <TextInput
                value={formatAmountInput(state.amount)}
                onChangeText={updateAmount}
                onFocus={() => setFocusedField("amount")}
                onBlur={() => setFocusedField(null)}
                keyboardType="numeric"
                returnKeyType="next"
                className="min-h-8 flex-1 p-0 text-base font-semibold text-text-primary"
                placeholder="0.00"
                placeholderTextColor={palette.slate[500]}
              />
            </View>
          </View>
        </View>

        {state.formConfig.showCounterparty && (
          <View
            testID="sms-edit-merchant"
            className={`min-h-16 flex-row items-center border-b px-4 py-3 ${
              focusedField === "merchant"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <SmsEditIcon name="storefront-outline" color={palette.blue[500]} />
            <View className="ms-3 flex-1">
              <Text className="text-xs font-medium text-text-muted">
                {state.txType === "EXPENSE" ? t("merchant") : t("payee")}
              </Text>
              <TextInput
                value={state.counterparty}
                onChangeText={setters.setCounterparty}
                onFocus={() => setFocusedField("merchant")}
                onBlur={() => setFocusedField(null)}
                returnKeyType="done"
                className="min-h-8 p-0 text-base font-semibold text-text-primary"
                placeholder={t("counterparty_placeholder")}
                placeholderTextColor={palette.slate[500]}
              />
            </View>
          </View>
        )}

        {state.formConfig.showCategory && (
          <TouchableOpacity
            testID="sms-edit-category"
            onPress={openCategory}
            activeOpacity={0.7}
            className="min-h-16 flex-row items-center border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
          >
            <SmsEditIcon name="pricetag-outline" color={palette.violet[500]} />
            <View className="ms-3 flex-1">
              <Text className="text-xs font-medium text-text-muted">
                {t("category")}
              </Text>
              <Text
                className="text-base font-semibold text-text-primary"
                numberOfLines={1}
              >
                {state.selectedCategoryDisplayName ??
                  t("select_category_label")}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={palette.slate[400]}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="sms-edit-account"
          onPress={() => setters.setIsAccountPickerOpen(true)}
          activeOpacity={0.7}
          className="min-h-16 flex-row items-center border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
        >
          <SmsEditIcon name="business-outline" color={palette.blue[500]} />
          <View className="ms-3 flex-1">
            <Text className="text-xs font-medium text-text-muted">
              {state.formConfig.showToAccount
                ? t("from_account_label")
                : t("account_label")}
            </Text>
            <Text
              className="text-base font-semibold text-text-primary"
              numberOfLines={1}
            >
              {state.selectedAccountName || t("select_an_account")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={palette.slate[400]}
          />
        </TouchableOpacity>

        <TouchableOpacity
          testID="sms-edit-currency"
          onPress={() => setters.setIsCurrencyPickerOpen(true)}
          disabled={state.isCurrencyLocked}
          activeOpacity={0.7}
          className="min-h-16 flex-row items-center bg-slate-50 px-4 py-3 dark:bg-slate-800"
        >
          <SmsEditIcon name="globe-outline" color={palette.gold[500]} />
          <View className="ms-3 flex-1">
            <Text className="text-xs font-medium text-text-muted">
              {t("currency")}
            </Text>
            <Text className="text-base font-semibold text-text-primary">
              {state.selectedAccountCurrency}
            </Text>
          </View>
          <Ionicons
            name={
              state.isCurrencyLocked ? "lock-closed-outline" : "chevron-forward"
            }
            size={20}
            color={palette.slate[400]}
          />
        </TouchableOpacity>
      </View>

      {state.formErrors.amount && (
        <Text className="mt-1.5 text-xs text-red-500">
          {state.formErrors.amount}
        </Text>
      )}
      {state.formErrors.categoryId && (
        <Text className="mt-1.5 text-xs text-red-500">
          {state.formErrors.categoryId}
        </Text>
      )}
      {state.formErrors.accountId && (
        <Text className="mt-1.5 text-xs text-red-500">
          {state.formErrors.accountId}
        </Text>
      )}

      {(state.isCreatingNew || !state.hasBankAccounts) && (
        <View className="mt-3 rounded-xl border border-nileGreen-500 bg-nileGreen-50 p-3 dark:bg-nileGreen-900">
          <Text className="mb-1 text-xs font-medium text-text-muted">
            {t("account_name")}
          </Text>
          <TextInput
            value={state.newAccountName}
            onChangeText={setters.setNewAccountName}
            className="min-h-9 p-0 text-base font-semibold text-text-primary"
            placeholder={t("account_name")}
            placeholderTextColor={palette.slate[500]}
          />
          {state.newAccountError && (
            <Text className="mt-1 text-xs text-red-500">
              {state.newAccountError}
            </Text>
          )}
        </View>
      )}

      {state.hasCurrencyMismatch && (
        <View className="mt-3 flex-row items-center rounded-xl border border-blue-500/25 bg-blue-500/10 p-3">
          <Ionicons
            name="swap-horizontal"
            size={16}
            color={palette.blue[500]}
          />
          <Text className="ms-2 flex-1 text-xs font-medium text-blue-500">
            {formatConversionPreview(
              state.amount,
              transaction.currency,
              state.selectedAccountCurrency,
              latestRates
            )}
          </Text>
        </View>
      )}

      {state.formConfig.showToAccount && (
        <AccountSelector
          label={t("to_account_label")}
          options={state.cashAccountOptions}
          placeholder={t("select_cash_account")}
          hintMessage={t("cash_account_hint", {
            name: state.newToAccountName.trim() || t("cash_default"),
            currency: transaction.currency,
          })}
          themeColor="amber"
          iconName="cash"
          isSecondary
          selectedId={state.selectedToAccountId}
          selectedName={state.selectedToAccountName}
          onSelect={(option) => {
            setters.setSelectedToAccountId(option.id);
            setters.setSelectedToAccountName(option.name);
            setters.setIsToAccountPickerOpen(false);
          }}
          isPickerOpen={state.isToAccountPickerOpen}
          onTogglePicker={() =>
            setters.setIsToAccountPickerOpen(!state.isToAccountPickerOpen)
          }
          allowCreateNew
          isCreatingNew={!state.hasCashAccounts}
          newAccountName={state.newToAccountName}
          onNewAccountNameChange={setters.setNewToAccountName}
          onStartNew={accountHandlers.handleStartNewToAccount}
          onCancelNew={accountHandlers.handleCancelNewToAccount}
        />
      )}

      <SmsReviewAccountPicker
        visible={state.isAccountPickerOpen}
        options={state.accountOptions}
        selectedId={state.selectedAccountId}
        onSelect={accountHandlers.handleSelectAccount}
        onStartNew={accountHandlers.handleStartNew}
        onClose={() => setters.setIsAccountPickerOpen(false)}
      />
    </View>
  );
}

export type { TransactionEdits };
