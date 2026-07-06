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
import React from "react";
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
import { CategorySelectorModal } from "../../modals/CategorySelectorModal";
import { TypeTabs } from "../../add-transaction/TypeTabs";
import { AccountSelector } from "./AccountSelector";
import { CurrencyPicker } from "../../currency/CurrencyPicker";
import { useTransactionEditState } from "@/hooks/useTransactionEditState";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

export interface TransactionEditModalProps {
  /** Whether the modal is visible */
  readonly visible: boolean;
  /** The transaction being edited */
  readonly transaction: ReviewableTransaction;
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
  const { visible, onClose, latestRates, transaction } = props;
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();

  const { state, setters, accountHandlers } = useTransactionEditState(props);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        {/* Backdrop */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          className="flex-1 bg-black/50"
        />

        {/* Modal content */}
        <View className="bg-white dark:bg-slate-900 rounded-t-3xl max-h-[85%]">
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
            <View className="mb-4 bg-slate-100 dark:bg-slate-800/60 rounded-2xl gap-3 px-4 py-3 flex-row items-center border border-slate-200 dark:border-slate-700/50">
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

            {/* Type toggle */}
            {state.formConfig.showTypeToggle && (
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
                name: state.newAccountName.trim() || t("new_account_default"),
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
                    {CURRENCY_INFO_MAP[state.selectedAccountCurrency]?.flag ??
                      "💱"}
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
                      {CURRENCY_INFO_MAP[state.selectedAccountCurrency]?.flag ??
                        "💱"}
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
                  setters.setIsToAccountPickerOpen(!state.isToAccountPickerOpen)
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

export type { TransactionEdits };
