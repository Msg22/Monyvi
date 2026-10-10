import { Ionicons } from "@expo/vector-icons";
import type { Account, Category } from "@monyvi/db";
import React, { type RefObject } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CategoryIcon, type IconLibrary } from "@/components/common/CategoryIcon";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

interface ManualAccountCategoryRowProps {
  readonly selectedAccount: Account | undefined;
  readonly selectedCategory: Category | null;
  readonly hasAccounts: boolean;
  readonly isStacked: boolean;
  readonly accountError?: string;
  readonly categoryError?: string;
  readonly accountFieldRef: RefObject<View | null>;
  readonly categoryFieldRef: RefObject<View | null>;
  readonly onOpenAccount: () => void;
  readonly onOpenCategory: () => void;
  readonly onAddAccount: () => void;
}

export function ManualAccountCategoryRow({
  selectedAccount,
  selectedCategory,
  hasAccounts,
  isStacked,
  accountError,
  categoryError,
  accountFieldRef,
  categoryFieldRef,
  onOpenAccount,
  onOpenCategory,
  onAddAccount,
}: ManualAccountCategoryRowProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const { t: tCommon } = useTranslation("common");
  const { isDark } = useTheme();

  return (
    <View
      testID="manual-account-category-row"
      className={`mb-3 ${isStacked ? "flex-col gap-3" : "flex-row gap-3"}`}
    >
      <View
        ref={accountFieldRef}
        collapsable={false}
        className={isStacked ? "w-full" : "flex-1"}
      >
        <Text className="mb-1 text-sm font-normal text-text-secondary dark:text-text-secondary-dark">
          {t("account")}
          <Text className="text-red-500">{" *"}</Text>
        </Text>

        {hasAccounts ? (
          <TouchableOpacity
            testID="manual-account-selector"
            accessibilityRole="button"
            accessibilityLabel={t("account")}
            accessibilityHint={tCommon("required_field")}
            onPress={onOpenAccount}
            activeOpacity={0.7}
            className={`min-h-14 flex-row items-center rounded-lg border bg-slate-25 px-3 dark:bg-slate-900 ${
              accountError
                ? "border-red-500"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <View className="me-2 h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Ionicons
                name={
                  selectedAccount?.type === "BANK"
                    ? "business-outline"
                    : selectedAccount?.type === "DIGITAL_WALLET"
                      ? "card-outline"
                      : "wallet-outline"
                }
                size={18}
                color={isDark ? palette.slate[300] : palette.slate[600]}
              />
            </View>
            <Text
              numberOfLines={1}
              className="flex-1 text-base font-normal text-slate-900 dark:text-slate-25"
            >
              {selectedAccount?.name ?? t("select")}
            </Text>
            <Ionicons
              name="chevron-down"
              size={18}
              color={isDark ? palette.slate[400] : palette.slate[500]}
            />
          </TouchableOpacity>
        ) : (
          <EmptyStateCard
            onPress={onAddAccount}
            icon="wallet-outline"
            title={t("no_accounts_found")}
            description={t("tap_here_to_add_one")}
            height={56}
            borderRadius={8}
            className="mt-0.5"
          />
        )}

        {accountError ? (
          <Text className="input-error">{accountError}</Text>
        ) : null}
      </View>

      <View
        ref={categoryFieldRef}
        collapsable={false}
        className={isStacked ? "w-full" : "flex-1"}
      >
        <Text className="mb-1 text-sm font-normal text-text-secondary dark:text-text-secondary-dark">
          {t("category")}
          <Text className="text-red-500">{" *"}</Text>
        </Text>
        <TouchableOpacity
          testID="manual-category-selector"
          accessibilityRole="button"
          accessibilityLabel={t("category")}
          accessibilityHint={tCommon("required_field")}
          onPress={onOpenCategory}
          activeOpacity={0.7}
          className={`min-h-14 flex-row items-center rounded-lg border bg-slate-25 px-3 dark:bg-slate-900 ${
            categoryError
              ? "border-red-500"
              : "border-slate-200 dark:border-slate-700"
          }`}
        >
          <View className="me-2 h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            {selectedCategory ? (
              <CategoryIcon
                iconName={selectedCategory.icon}
                iconLibrary={selectedCategory.iconLibrary as IconLibrary}
                size={18}
                color={selectedCategory.color}
              />
            ) : (
              <Ionicons
                name="grid-outline"
                size={18}
                color={isDark ? palette.slate[400] : palette.slate[500]}
              />
            )}
          </View>
          <Text
            numberOfLines={1}
            className="flex-1 text-base font-normal text-slate-900 dark:text-slate-25"
          >
            {selectedCategory?.displayName ?? t("select_category")}
          </Text>
          <Ionicons
            name="chevron-down"
            size={18}
            color={isDark ? palette.slate[400] : palette.slate[500]}
          />
        </TouchableOpacity>

        {categoryError ? (
          <Text className="input-error">{categoryError}</Text>
        ) : null}
      </View>
    </View>
  );
}
