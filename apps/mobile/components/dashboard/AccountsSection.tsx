import { Account, AccountType } from "@monyvi/db";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  type ListRenderItemInfo,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { AccountsSectionSkeleton } from "@/components/dashboard/skeletons/AccountsSectionSkeleton";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { InstitutionLogoMark } from "@/components/institutions/InstitutionLogoMark";
import { useTheme } from "@/context/ThemeContext";
import { buildAccountDisplayNames } from "@/utils/account-display";
import { formatAccountBalance } from "@/utils/financial-display";
import { EmptyStateCard } from "../ui/EmptyStateCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// =============================================================================
// Constants
// =============================================================================

const CARD_GAP = 10;
const CARD_HEIGHT = 112;
const CARD_BORDER_RADIUS = 18;
const MIN_CARD_WIDTH = 116;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - CARD_GAP * 2) / 3;
const SCROLLABLE_CARD_PEEK_WIDTH = 18;
const SCROLLABLE_CARD_WIDTH =
  (SCREEN_WIDTH - 40 - CARD_GAP * 2 - SCROLLABLE_CARD_PEEK_WIDTH) / 3;

// =============================================================================
// Types
// =============================================================================

interface AccountsSectionProps {
  accounts: Account[];
  isLoading: boolean;
  readonly institutionLogosByAccountId?: ReadonlyMap<
    string,
    InstitutionLogo | null
  >;
  /** Optional ref to the cash-account card for tooltip anchoring. */
  readonly cashAccountRef?: React.RefObject<View | null>;
}

interface AccountCardData {
  id: string;
  name: string;
  balance: string;
  type: AccountType;
  cardGradient: readonly [string, string];
  iconName: string;
  institutionLogo: InstitutionLogo | null;
  labelColor: string;
  typeLabel: string;
}

interface AccountCardProps {
  data: AccountCardData;
  readonly cardWidth: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getAccountTypeConfig(type: AccountType): {
  color: string;
  iconName: string;
} {
  switch (type) {
    case "BANK":
      return {
        color: palette.blue[600],
        iconName: "university",
      };
    case "DIGITAL_WALLET":
      return {
        color: palette.nileGreen[600],
        iconName: "mobile-alt",
      };
    case "CASH":
    default:
      return {
        color: palette.nileGreen[600],
        iconName: "money-bill-wave",
      };
  }
}

function getAccountTypeLabel(
  type: AccountType,
  t: (key: string) => string
): string {
  switch (type) {
    case "BANK":
      return t("dashboard_type_bank");
    case "DIGITAL_WALLET":
      return t("dashboard_type_digital_wallet");
    case "CASH":
    default:
      return t("dashboard_type_cash");
  }
}

function getCardAccentColor({
  fallbackColor,
  institutionLogo,
  isDark,
}: {
  readonly fallbackColor: string;
  readonly institutionLogo: InstitutionLogo | null;
  readonly isDark: boolean;
}): string {
  const themeKey = isDark ? "dark" : "light";

  return (
    institutionLogo?.presentation?.cardAccentColorByMode?.[themeKey] ??
    institutionLogo?.presentation?.cardAccentColor ??
    fallbackColor
  );
}

function getCardGradient({
  accentColor,
  institutionLogo,
  isDark,
}: {
  readonly accentColor: string;
  readonly institutionLogo: InstitutionLogo | null;
  readonly isDark: boolean;
}): readonly [string, string] {
  const themeKey = isDark ? "dark" : "light";

  if (institutionLogo?.presentation?.cardGradientByMode?.[themeKey]) {
    return institutionLogo.presentation.cardGradientByMode[themeKey];
  }

  return [accentColor, isDark ? palette.slate[950] : palette.slate[800]];
}

function getCardLabelColor({
  accentColor,
  institutionLogo,
  isDark,
}: {
  readonly accentColor: string;
  readonly institutionLogo: InstitutionLogo | null;
  readonly isDark: boolean;
}): string {
  const themeKey = isDark ? "dark" : "light";

  return (
    institutionLogo?.presentation?.cardLabelColorByMode?.[themeKey] ??
    accentColor
  );
}

export function shouldEnableAccountsScroll({
  accountCount,
  cardWidth,
  cardGap,
  availableWidth,
}: {
  readonly accountCount: number;
  readonly cardWidth: number;
  readonly cardGap: number;
  readonly availableWidth: number;
}): boolean {
  if (accountCount <= 0) {
    return false;
  }

  const totalCardsWidth =
    accountCount * cardWidth + Math.max(accountCount - 1, 0) * cardGap;
  return totalCardsWidth > availableWidth;
}

function getResponsiveCardWidth(hasScrollableAccounts: boolean): number {
  const computedWidth = hasScrollableAccounts
    ? SCROLLABLE_CARD_WIDTH
    : CARD_WIDTH;

  return Math.max(computedWidth, MIN_CARD_WIDTH);
}

// =============================================================================
// Sub-Components
// =============================================================================

function AccountCard({ data, cardWidth }: AccountCardProps): React.JSX.Element {
  const handlePress = useCallback((): void => {
    router.push(`/edit-account?id=${data.id}`);
  }, [data.id]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={{ width: cardWidth }}
    >
      <LinearGradient
        colors={data.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: cardWidth,
          height: CARD_HEIGHT,
          borderRadius: CARD_BORDER_RADIUS,
        }}
        className="p-3 justify-between border border-white/10"
        testID={`dashboard-account-card-${data.id}`}
      >
        <View className="relative min-h-9">
          <InstitutionLogoMark
            logo={data.institutionLogo}
            size="dashboard"
            surfaceContext="colored-card"
            defaultSurfaceClassName="border-transparent bg-transparent"
            testID={
              data.institutionLogo
                ? `dashboard-account-provider-logo-${data.id}`
                : undefined
            }
            fallback={
              <FontAwesome5
                name={data.iconName}
                size={13}
                color={palette.slate[25]}
              />
            }
          />

          <View className="absolute end-0 top-0 w-14 items-center rounded-full border border-slate-950 bg-white px-1 py-0.5">
            <Text
              className="text-[9px] font-bold uppercase"
              numberOfLines={1}
              style={{ color: data.labelColor }}
            >
              {data.typeLabel}
            </Text>
          </View>
        </View>

        <View>
          <Text
            className="text-xs font-semibold"
            numberOfLines={1}
            style={{ color: palette.slate[100] }}
          >
            {data.name}
          </Text>
          <Text
            className="mt-1 text-sm font-black"
            numberOfLines={1}
            style={{ color: palette.slate[25] }}
          >
            {data.balance}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function AccountsListSeparator(): React.JSX.Element {
  return <View className="w-2.5" />;
}

function AccountsListFooter(): React.JSX.Element {
  return <View className="w-5" />;
}

// =============================================================================
// Main Component
// =============================================================================

function AccountsSectionComponent({
  accounts,
  isLoading,
  institutionLogosByAccountId,
  cashAccountRef,
}: AccountsSectionProps): React.JSX.Element {
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const { isDark } = useTheme();

  // Build the display-name map across the FULL account set so duplicates
  // outside the top-3 still get disambiguated when they happen to land in
  // the visible slice (per spec 026-followup, 2026-04-26).
  const displayNames = useMemo(
    (): Map<string, string> => buildAccountDisplayNames(accounts),
    [accounts]
  );

  const cardData: AccountCardData[] = useMemo(() => {
    return accounts.map((account) => {
      const config = getAccountTypeConfig(account.type);
      const institutionLogo =
        institutionLogosByAccountId?.get(account.id) ?? null;
      const accentColor = getCardAccentColor({
        fallbackColor: config.color,
        institutionLogo,
        isDark,
      });

      return {
        id: account.id,
        name: displayNames.get(account.id) ?? account.name,
        balance: formatAccountBalance({
          balance: account.balance,
          currency: account.currency,
          maximumFractionDigits: 0,
        }),
        type: account.type,
        cardGradient: getCardGradient({
          accentColor,
          institutionLogo,
          isDark,
        }),
        iconName: config.iconName,
        institutionLogo,
        labelColor: getCardLabelColor({
          accentColor,
          institutionLogo,
          isDark,
        }),
        typeLabel: getAccountTypeLabel(account.type, t),
      };
    });
  }, [accounts, displayNames, institutionLogosByAccountId, isDark, t]);

  const handleSeeAll = useCallback((): void => {
    router.push("/accounts");
  }, []);

  const handleAddAccount = useCallback((): void => {
    router.push("/add-account");
  }, []);

  const keyExtractor = useCallback((card: AccountCardData): string => {
    return card.id;
  }, []);
  const hasScrollableAccounts = shouldEnableAccountsScroll({
    accountCount: cardData.length,
    cardWidth: getResponsiveCardWidth(false),
    cardGap: CARD_GAP,
    availableWidth: SCREEN_WIDTH - 40,
  });
  const cardWidth = getResponsiveCardWidth(hasScrollableAccounts);

  const renderAccountCard = useCallback(
    ({
      item: card,
    }: ListRenderItemInfo<AccountCardData>): React.JSX.Element => {
      if (card.type === "CASH" && cashAccountRef) {
        return (
          <View ref={cashAccountRef} collapsable={false}>
            <AccountCard data={card} cardWidth={cardWidth} />
          </View>
        );
      }

      return <AccountCard data={card} cardWidth={cardWidth} />;
    },
    [cardWidth, cashAccountRef]
  );

  if (isLoading) {
    return <AccountsSectionSkeleton />;
  }

  return (
    <View className="my-4">
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold text-slate-800 dark:text-slate-50">
          {tc("accounts")}
        </Text>
        <TouchableOpacity
          onPress={handleSeeAll}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="flex-row items-center"
        >
          <Text className="text-sm font-semibold text-nileGreen-500">
            {tc("see_all")}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={palette.nileGreen[500]}
            className="ms-1"
          />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {cardData.length === 0 ? (
        <EmptyStateCard
          onPress={handleAddAccount}
          icon="wallet-outline"
          title={t("no_accounts_title")}
          description={tc("tap_to_add")}
          height={CARD_HEIGHT}
          borderRadius={CARD_BORDER_RADIUS}
        />
      ) : (
        <View>
          <FlatList
            {...ANDROID_SAFE_LIST_PROPS}
            data={cardData}
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            testID="dashboard-accounts-scroll"
            keyExtractor={keyExtractor}
            renderItem={renderAccountCard}
            ItemSeparatorComponent={AccountsListSeparator}
            ListFooterComponent={AccountsListFooter}
            scrollEnabled={hasScrollableAccounts}
          />
        </View>
      )}
    </View>
  );
}

export const AccountsSection = memo(AccountsSectionComponent);
