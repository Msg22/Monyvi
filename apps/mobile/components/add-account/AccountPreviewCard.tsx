import { Ionicons } from "@expo/vector-icons";
import type { AccountType } from "@monyvi/db";
import { LinearGradient } from "expo-linear-gradient";
import type { JSX } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { palette } from "@/constants/colors";
import { AccountIdentityMark } from "@/components/institutions/AccountIdentityMark";
import { useTheme } from "@/context/ThemeContext";
import {
  formatAccountPreviewBalance,
  getAccountPreviewCardGradient,
  getAccountPreviewFallbackIcon,
  getAccountPreviewInstitutionLogo,
  getAccountPreviewProviderName,
} from "@/utils/account-preview-presentation";

interface AccountPreviewCardProps {
  readonly accountType: AccountType;
  readonly accountName: string;
  readonly balance: string;
  readonly currency: string;
  readonly institutionId: string | null;
  readonly providerDisplayName: string;
}

export function AccountPreviewCard({
  accountType,
  accountName,
  balance,
  currency,
  institutionId,
  providerDisplayName,
}: AccountPreviewCardProps): JSX.Element {
  const { t } = useTranslation("accounts");
  const { isDark } = useTheme();
  const displayName = accountName.trim() || t("account_preview");
  const providerName = getAccountPreviewProviderName(
    accountType,
    institutionId,
    providerDisplayName,
    (type) => t(`account_type_${type.toLowerCase()}`)
  );
  const logo = getAccountPreviewInstitutionLogo(accountType, institutionId);
  const gradient = getAccountPreviewCardGradient({ accountType, logo, isDark });

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="mb-5 overflow-hidden rounded-[30px] px-5 py-4"
      style={{
        borderColor: `${palette.slate[25]}33`,
        borderWidth: 1,
        elevation: 4,
        shadowColor: palette.slate[950],
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.28 : 0.14,
        shadowRadius: 18,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center">
          <AccountIdentityMark
            account={{ type: accountType, institutionId, providerDisplayName }}
            size="preview"
            surfaceContext="colored-card"
            testID="account-preview-institution-logo"
            defaultSurfaceClassName="border-transparent bg-transparent"
            fallback={
              <Ionicons
                name={getAccountPreviewFallbackIcon(accountType)}
                size={24}
                color={palette.nileGreen[700]}
              />
            }
          />
          <View className="ms-3 flex-1">
            <Text className="text-base font-black text-white" numberOfLines={1}>
              {displayName}
            </Text>
            <Text
              className="mt-0.5 text-xs font-bold text-nileGreen-100"
              numberOfLines={1}
            >
              {providerName}
            </Text>
          </View>
        </View>
        <View className="ms-3 items-end">
          <Text className="text-xs font-bold text-nileGreen-100">
            {currency}
          </Text>
          <Text className="mt-0.5 text-lg font-black text-white">
            {formatAccountPreviewBalance(balance)}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}
