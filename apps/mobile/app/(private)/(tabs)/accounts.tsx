import {
  AccountCard,
  AccountTypeTabs,
  FilterType,
} from "@/components/accounts";
import { AccountListSkeleton } from "@/components/accounts/skeletons/AccountListSkeleton";
import { buildAccountDisplayNames } from "@/utils/account-display";
import { resolveAccountInstitutionPresentation } from "@/utils/account-institution-presentation";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Button, ButtonVariant } from "@/components/ui/Button";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { TAB_BAR_HEIGHT } from "@/constants/ui";
import { useAccounts } from "@/hooks";
import { useMarketRates } from "@/hooks/useMarketRates";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ReactElement, useCallback, useMemo, useState } from "react";
import { FlatList, type ListRenderItem, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Renders a button for creating a new account.
 *
 * @param onPress - Callback invoked when the button is pressed
 * @param variant - Visual variant of the button (defaults to `"dashed"`)
 * @returns A view containing an "Add New Account" button that invokes `onPress` when tapped
 */
function AddAccountButton({
  onPress,
  variant = "dashed",
}: {
  onPress: () => void;
  variant?: ButtonVariant;
}): ReactElement {
  const { t } = useTranslation("accounts");
  return (
    <View className="mx-5 mb-10">
      <Button
        variant={variant}
        icon="add"
        title={t("add_new_account")}
        onPress={onPress}
        size="md"
      />
    </View>
  );
}

/**
 * Empty-state slot for the accounts FlatList. Module-level → stable identity.
 */
function AccountsListEmpty({
  selectedFilter,
  onAdd,
}: {
  selectedFilter: FilterType;
  onAdd: () => void;
}): ReactElement {
  const { t } = useTranslation("accounts");
  const selectedType =
    selectedFilter === "ALL" ? "" : t(getAccountTypeLabelKey(selectedFilter));
  return (
    <View className="flex-1 items-center justify-center py-20 px-10">
      <View className="w-20 h-20 rounded-full items-center justify-center mb-6 bg-slate-100 dark:bg-slate-800">
        <Ionicons name="wallet-outline" size={40} color={palette.slate[400]} />
      </View>
      <Text className="text-lg font-bold text-center mb-2 text-slate-800 dark:text-white">
        {selectedFilter === "ALL"
          ? t("no_accounts_title")
          : t("no_accounts_type_title", { type: selectedType })}
      </Text>
      <Text className="text-sm text-slate-400 text-center mb-10">
        {selectedFilter === "ALL"
          ? t("no_accounts_message")
          : t("no_accounts_type_message", {
              type: selectedType,
            })}
      </Text>

      {selectedFilter === "ALL" && (
        <AddAccountButton onPress={onAdd} variant="primary" />
      )}
    </View>
  );
}

function getAccountTypeLabelKey(filter: Exclude<FilterType, "ALL">): string {
  const keyMap: Record<Exclude<FilterType, "ALL">, string> = {
    CASH: "type_cash",
    BANK: "type_bank",
    DIGITAL_WALLET: "type_digital_wallet",
  };
  return keyMap[filter];
}

/**
 * Render a styled card displaying the total account balance alongside its currency code.
 *
 * @param balance - The numeric amount to display as the total balance.
 * @param currencyCode - The currency code used to label and format the displayed amount.
 * @returns A React element containing a card with the "Total Balance" label, the currency code, and the formatted balance.
 */
function TotalBalanceCard({
  balance,
  currencyCode,
}: {
  balance: number;
  currencyCode: CurrencyType;
}): ReactElement {
  const { t } = useTranslation("accounts");
  return (
    <View className="p-6 rounded-3xl border-b-4 bg-white dark:bg-slate-800 border-nileGreen-600 dark:border-nileGreen-500 shadow-xl dark:shadow-none">
      <Text className="text-sm font-bold mb-1 text-slate-500 dark:text-slate-400 uppercase tracking-widest">
        {t("total_balance")}
      </Text>
      <Text className="text-3xl font-black text-slate-900 dark:text-white">
        {formatCurrency({ amount: balance, currency: currencyCode })}
      </Text>
    </View>
  );
}

/**
 * Render the Accounts screen with total balance, filter tabs, and a list of accounts.
 *
 * Shows a currency-aware total balance and account type tabs only when accounts exist,
 * provides actions to add a new account, and displays a contextual empty state when no accounts match the selected filter.
 *
 * @returns The React element representing the Accounts screen UI
 */
export default function Accounts(): ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tCommon } = useTranslation("common");
  const { latestRates } = useMarketRates();

  const [selectedFilter, setSelectedFilter] = useState<FilterType>("ALL");
  const { totalAccountsBalance, accounts, isLoading } = useAccounts();
  const { preferredCurrency } = usePreferredCurrency();
  const isEmpty = accounts.length === 0;
  const isHydrating = isLoading && isEmpty;
  const listBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 24;

  const filteredAccounts = useMemo(() => {
    if (selectedFilter === "ALL") return accounts;
    return accounts.filter((acc) => acc.type === selectedFilter);
  }, [accounts, selectedFilter]);

  // Compute the display-name map from the FULL account list (not the
  // filtered slice) so duplicates that fall on different tabs still
  // disambiguate consistently — e.g. "Cash (EGP)" vs "Cash (USD)" should
  // appear the same way regardless of which tab the user is on.
  const displayNames = useMemo(
    (): Map<string, string> => buildAccountDisplayNames(accounts),
    [accounts]
  );

  const handleAddAccount = useCallback(() => {
    router.push("/add-account");
  }, [router]);

  const handleCardPress = useCallback(
    (id: string) => {
      router.push(`/edit-account?id=${id}`);
    },
    [router]
  );

  const renderItem: ListRenderItem<(typeof filteredAccounts)[number]> =
    useCallback(
      ({ item }) => {
        const presentation = resolveAccountInstitutionPresentation(item);
        return (
          <AccountCard
            account={item}
            latestRates={latestRates}
            displayName={displayNames.get(item.id) ?? item.name}
            providerLabel={presentation?.providerLabel ?? null}
            institutionLogo={presentation?.asset.logo ?? null}
            onPress={handleCardPress}
          />
        );
      },
      [latestRates, displayNames, handleCardPress]
    );

  const keyExtractor = useCallback(
    (item: (typeof filteredAccounts)[number]) => item.id,
    []
  );

  const renderEmpty = useCallback(
    (): ReactElement => (
      <AccountsListEmpty
        selectedFilter={selectedFilter}
        onAdd={handleAddAccount}
      />
    ),
    [selectedFilter, handleAddAccount]
  );

  return (
    <View className="flex-1">
      <PageHeader
        title={tCommon("accounts")}
        rightAction={{
          icon: "add",
          onPress: handleAddAccount,
          testID: "accounts-add-button",
        }}
      />

      {isHydrating ? (
        <AccountListSkeleton />
      ) : (
        <>
          {/* Total Balance Card */}
          {!isEmpty && (
            <View className="px-5 pb-6">
              <TotalBalanceCard
                balance={totalAccountsBalance}
                currencyCode={preferredCurrency}
              />
            </View>
          )}

          {/* Only show filter tabs if user has accounts */}
          {!isEmpty && (
            <AccountTypeTabs
              selectedFilter={selectedFilter}
              onSelectFilter={setSelectedFilter}
            />
          )}

          <FlatList
            data={filteredAccounts}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: listBottomPadding,
            }}
            {...ANDROID_SAFE_LIST_PROPS}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        </>
      )}
    </View>
  );
}
