import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Account } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { buildAccountDisplayNames } from "@/utils/account-display";
import { AccountIdentityMark } from "@/components/institutions/AccountIdentityMark";

interface AccountSelectorProps {
  accounts: Account[];
  selectedId: string;
  onSelect: (id: string) => void;
  label?: string;
  mainColor?: string;
}

export function AccountSelector({
  accounts,
  selectedId,
  onSelect,
  label,
  mainColor = palette.nileGreen[600],
}: AccountSelectorProps): React.JSX.Element {
  const { isDark } = useTheme();
  // Resolve display names so duplicate-named accounts (e.g. two "Cash"
  // accounts in different currencies) are visually disambiguated in the
  // picker — per spec 026-followup.
  const displayNames = useMemo(
    (): Map<string, string> => buildAccountDisplayNames(accounts),
    [accounts]
  );
  return (
    <View className="mb-4">
      {label && (
        <Text className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 px-1">
          {label}
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
      >
        {accounts.map((account) => {
          const isSelected = account.id === selectedId;

          return (
            <TouchableOpacity
              key={account.id}
              onPress={() => onSelect(account.id)}
              activeOpacity={0.7}
              className={`flex-row items-center px-5 py-4 rounded-2xl border ${
                isSelected
                  ? "border-transparent bg-white dark:bg-slate-800"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              }`}
              style={
                isSelected
                  ? // TODO(nativewind-v4): Remove this eslint override after NativeWind fixes shadow/opacity class handling for TouchableOpacity.
                    // eslint-disable-next-line react-native/no-inline-styles
                    {
                      borderColor: mainColor,
                      borderWidth: 2,
                      shadowColor: mainColor,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.1,
                      shadowRadius: 8,
                      elevation: 4,
                    }
                  : {}
              }
            >
              <View
                className="w-10 h-10 rounded-2xl items-center justify-center me-3 bg-slate-100 dark:bg-slate-700/50"
                style={{
                  backgroundColor: isSelected ? mainColor : undefined,
                }}
              >
                <AccountIdentityMark
                  account={account}
                  size="group"
                  surfaceContext={isSelected ? "colored-card" : "default"}
                  testID={"manual-account-selector-logo-" + account.id}
                  fallbackColor={
                    isSelected
                      ? "white"
                      : isDark
                        ? palette.slate[400]
                        : palette.slate[500]
                  }
                />
              </View>
              <View>
                <Text
                  className={`text-sm font-semibold ${
                    isSelected
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {displayNames.get(account.id) ?? account.name}
                </Text>
                {isSelected && (
                  <Text className="text-[10px] text-slate-400 dark:text-slate-500">
                    {account.currency}
                  </Text>
                )}
              </View>

              {isSelected && (
                <View className="ms-2 bg-white dark:bg-slate-900 rounded-full">
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={mainColor}
                  />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
