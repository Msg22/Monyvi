import { CategoryPicker } from "@/components/add-transaction/CategoryPicker";
import { OptionalSection } from "@/components/add-transaction/OptionalSection";
import { palette } from "@/constants/colors";
import type { TransactionValidationErrors } from "@/validation/transaction-validation";
import { Ionicons } from "@expo/vector-icons";
import { AccountIdentityMark } from "@/components/institutions/AccountIdentityMark";
import type { Category, TransactionType } from "@monyvi/db";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface AccountOption {
  readonly id: string;
  readonly name: string;
  readonly type: "CASH" | "BANK" | "DIGITAL_WALLET";
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}

interface OptionalFieldUpdates {
  readonly counterparty?: string;
  readonly note?: string;
  readonly date?: Date;
}

interface EditTransactionFieldsProps {
  readonly isTransferMode: boolean;
  readonly type: TransactionType | "TRANSFER";
  readonly selectedAccount: AccountOption | undefined;
  readonly selectedToAccount: AccountOption | undefined;
  readonly selectedCategory: Category | null;
  readonly chipCategories: readonly Category[];
  readonly formErrors: TransactionValidationErrors;
  readonly isDark: boolean;
  readonly isOptionalExpanded: boolean;
  readonly counterparty: string | undefined;
  readonly note: string | undefined;
  readonly date: Date;
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
  readonly onOpenAccountPicker: () => void;
  readonly onOpenToAccountPicker: () => void;
  readonly onOpenCategoryPicker: () => void;
  readonly onSwapAccounts: () => void;
  readonly onSelectCategory: (categoryId: string) => void;
  readonly onToggleOptional: () => void;
  readonly onOptionalChange: (updates: OptionalFieldUpdates) => void;
}

export function EditTransactionFields({
  isTransferMode,
  type,
  selectedAccount,
  selectedToAccount,
  selectedCategory,
  chipCategories,
  formErrors,
  isDark,
  isOptionalExpanded,
  counterparty,
  note,
  date,
  t,
  tCommon,
  onOpenAccountPicker,
  onOpenToAccountPicker,
  onOpenCategoryPicker,
  onSwapAccounts,
  onSelectCategory,
  onToggleOptional,
  onOptionalChange,
}: EditTransactionFieldsProps): React.JSX.Element {
  return (
    <View className="px-6 mt-4">
      {isTransferMode ? (
        <TransferAccountFields
          t={t}
          tCommon={tCommon}
          isDark={isDark}
          selectedAccount={selectedAccount}
          selectedToAccount={selectedToAccount}
          formErrors={formErrors}
          onOpenAccountPicker={onOpenAccountPicker}
          onOpenToAccountPicker={onOpenToAccountPicker}
          onSwapAccounts={onSwapAccounts}
        />
      ) : (
        <TransactionAccountCategoryFields
          t={t}
          tCommon={tCommon}
          isDark={isDark}
          selectedAccount={selectedAccount}
          selectedCategory={selectedCategory}
          chipCategories={chipCategories}
          formErrors={formErrors}
          onOpenAccountPicker={onOpenAccountPicker}
          onOpenCategoryPicker={onOpenCategoryPicker}
          onSelectCategory={onSelectCategory}
        />
      )}

      {isOptionalExpanded && !isTransferMode && (
        <OptionalSection
          expanded={isOptionalExpanded}
          onToggleExpand={onToggleOptional}
          transactionType={type}
          fields={{
            counterparty,
            note,
            date,
            isRecurring: false,
            recurringName: "",
            recurringFrequency: "MONTHLY" as const,
            recurringAutoCreate: false,
          }}
          onChange={onOptionalChange}
          hideRecurring
        />
      )}
    </View>
  );
}

function TransferAccountFields({
  t,
  tCommon,
  isDark,
  selectedAccount,
  selectedToAccount,
  formErrors,
  onOpenAccountPicker,
  onOpenToAccountPicker,
  onSwapAccounts,
}: {
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
  readonly isDark: boolean;
  readonly selectedAccount: AccountOption | undefined;
  readonly selectedToAccount: AccountOption | undefined;
  readonly formErrors: TransactionValidationErrors;
  readonly onOpenAccountPicker: () => void;
  readonly onOpenToAccountPicker: () => void;
  readonly onSwapAccounts: () => void;
}): React.JSX.Element {
  return (
    <>
      <View className="flex-row gap-4 mb-4">
        <AccountPickerField
          testID="edit-transaction-from-account-selector"
          label={t("transfer_from").toUpperCase()}
          account={selectedAccount}
          isDark={isDark}
          placeholder={tCommon("select")}
          onPress={onOpenAccountPicker}
        />
        <View className="justify-end pb-1">
          <TouchableOpacity
            onPress={onSwapAccounts}
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-slate-700"
          >
            <Ionicons
              name="swap-horizontal"
              size={20}
              color={isDark ? palette.slate[400] : palette.slate[500]}
            />
          </TouchableOpacity>
        </View>
        <AccountPickerField
          testID="edit-transaction-to-account-selector"
          label={t("transfer_to").toUpperCase()}
          account={selectedToAccount}
          isDark={isDark}
          placeholder={tCommon("select")}
          onPress={onOpenToAccountPicker}
        />
      </View>

      {formErrors.accountId && (
        <Text className="text-red-500 text-xs mt-1 mb-2">
          {formErrors.accountId}
        </Text>
      )}
    </>
  );
}

function TransactionAccountCategoryFields({
  t,
  tCommon,
  isDark,
  selectedAccount,
  selectedCategory,
  chipCategories,
  formErrors,
  onOpenAccountPicker,
  onOpenCategoryPicker,
  onSelectCategory,
}: {
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
  readonly isDark: boolean;
  readonly selectedAccount: AccountOption | undefined;
  readonly selectedCategory: Category | null;
  readonly chipCategories: readonly Category[];
  readonly formErrors: TransactionValidationErrors;
  readonly onOpenAccountPicker: () => void;
  readonly onOpenCategoryPicker: () => void;
  readonly onSelectCategory: (categoryId: string) => void;
}): React.JSX.Element {
  return (
    <>
      <View className="flex-row gap-4 mb-4">
        <View className="flex-1">
          <AccountPickerField
            testID="edit-transaction-account-selector"
            label={t("account").toUpperCase()}
            account={selectedAccount}
            isDark={isDark}
            placeholder={tCommon("select")}
            selectedCategory={selectedCategory}
            onPress={onOpenAccountPicker}
          />
          {formErrors.accountId && (
            <Text className="text-red-500 text-xs mt-1">
              {formErrors.accountId}
            </Text>
          )}
        </View>

        <View className="flex-1">
          <Text className="input-label">{t("category").toUpperCase()}</Text>
          <TouchableOpacity
            onPress={onOpenCategoryPicker}
            activeOpacity={0.7}
            className="flex-row items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700"
          >
            <CategoryIcon category={selectedCategory} isDark={isDark} />
            <Text
              numberOfLines={1}
              className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
            >
              {selectedCategory?.displayName || tCommon("select")}
            </Text>
          </TouchableOpacity>
          {formErrors.categoryId && (
            <Text className="text-red-500 text-xs mt-1">
              {formErrors.categoryId}
            </Text>
          )}
        </View>
      </View>

      <CategoryPicker
        selectedCategory={selectedCategory}
        categories={chipCategories}
        onOpenPicker={onOpenCategoryPicker}
        onSelectCategory={(category) => onSelectCategory(category.id)}
        hideMainSelector
      />
    </>
  );
}

function AccountPickerField({
  testID,
  label,
  account,
  selectedCategory,
  isDark,
  placeholder,
  onPress,
}: {
  readonly testID: string;
  readonly label: string;
  readonly account: AccountOption | undefined;
  readonly selectedCategory?: Category | null;
  readonly isDark: boolean;
  readonly placeholder: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <View className="flex-1">
      <Text className="input-label">{label}</Text>
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-row items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700"
      >
        <View
          className="w-8 h-8 rounded-xl items-center justify-center me-2 bg-slate-100 dark:bg-slate-700/50"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            backgroundColor: selectedCategory?.color
              ? `${selectedCategory.color}20`
              : undefined,
          }}
        >
          <AccountIdentityMark
            account={account ?? null}
            size="field"
            testID="edit-transaction-selected-account-identity"
            fallbackColor={
              selectedCategory?.color ||
              (isDark ? palette.slate[400] : palette.slate[500])
            }
          />
        </View>
        <Text
          numberOfLines={1}
          className="flex-1 text-sm font-semibold text-slate-900 dark:text-white"
        >
          {account?.name || placeholder}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function CategoryIcon({
  category,
  isDark,
}: {
  readonly category: Category | null;
  readonly isDark: boolean;
}): React.JSX.Element {
  return (
    <View
      className="w-8 h-8 rounded-xl items-center justify-center me-2 bg-slate-100 dark:bg-slate-700"
      // eslint-disable-next-line react-native/no-inline-styles
      style={{
        backgroundColor: category?.color ? `${category.color}20` : undefined,
      }}
    >
      <Ionicons
        name={
          category?.icon
            ? (category.icon as keyof typeof Ionicons.glyphMap)
            : "grid-outline"
        }
        size={18}
        color={
          category?.color || (isDark ? palette.slate[400] : palette.slate[500])
        }
      />
    </View>
  );
}
