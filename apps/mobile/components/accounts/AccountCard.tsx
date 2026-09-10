import { palette } from "@/constants/colors";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { InstitutionLogoMark } from "@/components/institutions/InstitutionLogoMark";
import { formatAccountBalance } from "@/utils/financial-display";
import type { Account } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import { convertSelectedCurrentAmount } from "@/services/current-market-snapshot-calculations";
import type { SelectedMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/context/ThemeContext";

interface AccountCardProps {
  account: Account;
  selectedSnapshot: SelectedMarketRateSnapshot | null;
  /**
   * Press handler. Receives the account id so list parents can pass a single
   * stable `useCallback` reference instead of creating a new closure per item.
   */
  onPress?: (id: string) => void;
  /**
   * Resolved display name (per `account-display.ts`). Parents that render
   * a list SHOULD compute the map once via `buildAccountDisplayNames` /
   * `useAccountDisplayNames` and pass the resolved string down to avoid
   * duplicate-name confusion (e.g. two "Cash" accounts in EGP and USD).
   * Falls back to the raw `account.name` when omitted.
   */
  displayName?: string;
  providerLabel?: string | null;
  institutionLogo?: InstitutionLogo | null;
}

/**
 * Render a tappable account summary card showing an icon, account name, contextual subtitle, and formatted balance.
 *
 * The subtitle shows an approximate USD value when the account currency is not USD and `selectedSnapshot` is provided; otherwise it shows a type-based label (e.g., "Bank Account", "Digital Wallet", "Physical money").
 *
 * @param account - The account to display (provides name, type, currency, and balance).
 * @param selectedSnapshot - Market rates used to convert the account balance to USD for the approximate subtitle; may be null to disable conversion.
 * @param onPress - Optional press handler invoked when the card is tapped.
 * @returns A JSX element representing the account card.
 */
export function AccountCard({
  account,
  selectedSnapshot,
  onPress,
  displayName,
  providerLabel = null,
  institutionLogo = null,
}: AccountCardProps): React.JSX.Element {
  const { t } = useTranslation("accounts");
  const { isDark } = useTheme();
  const handlePress = useCallback(() => {
    onPress?.(account.id);
  }, [onPress, account.id]);

  const config: { icon: keyof typeof Ionicons.glyphMap; color: string } =
    useMemo(() => {
      switch (account.type) {
        case "CASH":
          return { icon: "cash", color: palette.nileGreen[500] };
        case "BANK":
          return { icon: "business", color: palette.blue[500] };
        case "DIGITAL_WALLET":
          return { icon: "phone-portrait", color: palette.violet[500] };
        default:
          return { icon: "wallet", color: palette.nileGreen[500] };
      }
    }, [account.type]);
  const accentColor =
    institutionLogo?.presentation?.cardLabelColorByMode?.[
      isDark ? "dark" : "light"
    ] ??
    institutionLogo?.presentation?.cardAccentColorByMode?.[
      isDark ? "dark" : "light"
    ] ??
    institutionLogo?.presentation?.cardAccentColor ??
    config.color;
  const subtitle = useMemo(() => {
    if (account.currency !== "USD" && selectedSnapshot) {
      const usdValue = convertSelectedCurrentAmount({
        amount: account.balance,
        fromCurrency: account.currency,
        toCurrency: "USD",
        currentSnapshot: selectedSnapshot,
      });
      if (usdValue !== null) {
        return `≈ ${formatCurrency({
          amount: usdValue,
          currency: "USD",
        })}`;
      }
    }

    switch (account.type) {
      case "BANK":
        return providerLabel ?? t("type_bank");
      case "DIGITAL_WALLET":
        return providerLabel ?? t("type_digital_wallet");
      case "CASH":
        return t("type_cash");
      default:
        return "";
    }
  }, [
    account.currency,
    account.balance,
    account.type,
    selectedSnapshot,
    providerLabel,
    t,
  ]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      className="mb-3 mx-5 rounded-2xl overflow-hidden bg-white dark:bg-slate-800 border-l-[4px] border-slate-100 dark:border-slate-700"
      // shadow-* classes moved to inline style to avoid NativeWind v4
      // race condition with React Navigation context (known bug)
      style={{
        borderLeftColor: accentColor,
        shadowColor: palette.slate[900],
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View className="flex-row items-center p-4">
        {/* Icon Container with subtle background */}
        <View className="me-4">
          <InstitutionLogoMark
            logo={institutionLogo}
            size="account-list"
            testID={
              institutionLogo
                ? `account-provider-logo-${account.id}`
                : undefined
            }
            fallback={
              <Ionicons name={config.icon} size={24} color={accentColor} />
            }
          />
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-center">
            {account.isDefault && (
              <Ionicons
                name="star"
                size={14}
                color={palette.nileGreen[500]}
                accessibilityLabel={t("default_account_badge")}
                style={{ marginEnd: 6 }}
              />
            )}
            <Text className="flex-shrink text-base font-bold text-slate-800 dark:text-white">
              {displayName ?? account.name}
            </Text>
          </View>
          <Text className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">
            {subtitle}
          </Text>
        </View>

        {/* Balance Display */}
        <View className="items-end">
          <Text className="text-lg font-black text-slate-900 dark:text-white">
            {formatAccountBalance(account)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
