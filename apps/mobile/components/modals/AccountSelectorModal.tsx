import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useCallback, useMemo } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import type { Account, AccountType } from "@monyvi/db";
import { useTranslation } from "react-i18next";
import { buildAccountDisplayNames } from "@/utils/account-display";
import { formatAccountBalance } from "@/utils/financial-display";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface AccountSelectorModalProps {
  visible: boolean;
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const ACCOUNT_LIST_BOTTOM_SPACING = 40;

export function AccountSelectorModal({
  visible,
  accounts,
  selectedId,
  onSelect,
  onClose,
}: AccountSelectorModalProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { t } = useTranslation("common");
  const { t: tAccounts } = useTranslation("accounts");
  const bottomInset = useModalBottomInset();

  // Resolve display names so duplicate-named accounts (e.g. two "Cash"
  // accounts in different currencies) are visually disambiguated in the
  // picker — per spec 026-followup.
  const displayNames = useMemo(
    (): Map<string, string> => buildAccountDisplayNames(accounts),
    [accounts]
  );

  /** Map account type enum values to their translated display labels */
  const accountTypeLabel = useCallback(
    (type: AccountType): string => {
      const keyMap: Record<AccountType, string> = {
        CASH: "type_cash",
        BANK: "type_bank",
        DIGITAL_WALLET: "type_digital_wallet",
      };
      return tAccounts(keyMap[type]);
    },
    [tAccounts]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/60 justify-end">
          <View
            testID="account-selector-sheet"
            className="rounded-t-3xl overflow-hidden max-h-[80%] bg-white dark:bg-slate-900 z-50"
            style={{ marginBottom: bottomInset }}
          >
            <BlurView
              intensity={40}
              tint={isDark ? "dark" : "light"}
              className="absolute inset-0"
            />
            <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

            <View testID="account-selector-scroll-container" className="shrink">
              {/* Header */}
              <View className="flex-row justify-between items-center px-6 py-5 border-b border-slate-200 dark:border-slate-800">
                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {t("select_account_modal")}
                </Text>
                <TouchableOpacity onPress={onClose} className="p-1">
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? palette.slate[300] : palette.slate[500]}
                  />
                </TouchableOpacity>
              </View>

              {/* Account List */}
              <ScrollView
                testID="account-selector-scroll"
                className="shrink"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  gap: 12,
                  paddingBottom: ACCOUNT_LIST_BOTTOM_SPACING,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                }}
              >
                <View testID="account-selector-list-content" className="gap-3">
                  {accounts.map((account) => {
                    const isSelected = account.id === selectedId;

                    let iconName: keyof typeof Ionicons.glyphMap =
                      "wallet-outline";
                    if (account.type === "BANK") iconName = "business-outline";
                    if (account.type === "DIGITAL_WALLET")
                      iconName = "card-outline";

                    return (
                      <TouchableOpacity
                        key={account.id}
                        testID={`account-selector-option-${account.id}`}
                        className={`flex-row items-center p-4 rounded-2xl border ${
                          isSelected
                            ? "bg-nileGreen-50 dark:bg-nileGreen-900/20 border-nileGreen-500 dark:border-nileGreen-600"
                            : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                        }`}
                        onPress={() => {
                          onSelect(account.id);
                          onClose();
                        }}
                      >
                        <View
                          className={`w-12 h-12 rounded-2xl items-center justify-center me-4 ${
                            isSelected
                              ? "bg-nileGreen-500"
                              : "bg-slate-200 dark:bg-slate-700"
                          }`}
                        >
                          <Ionicons
                            name={iconName}
                            size={24}
                            color={
                              isSelected
                                ? "white"
                                : isDark
                                  ? palette.slate[400]
                                  : palette.slate[500]
                            }
                          />
                        </View>

                        <View className="flex-1">
                          <Text
                            className={`text-base font-bold ${
                              isSelected
                                ? "text-nileGreen-600 dark:text-nileGreen-400"
                                : "text-slate-800 dark:text-slate-100"
                            }`}
                          >
                            {displayNames.get(account.id) ?? account.name}
                          </Text>
                          <Text className="text-xs text-slate-500 dark:text-slate-400">
                            {account.currency} •{" "}
                            {accountTypeLabel(account.type)} •{" "}
                            {formatAccountBalance(account)}
                          </Text>
                        </View>

                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color={
                              isDark
                                ? palette.nileGreen[400]
                                : palette.nileGreen[600]
                            }
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
