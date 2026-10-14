import { Ionicons } from "@expo/vector-icons";
import type { Account, Category } from "@monyvi/db";
import React, { type RefObject } from "react";
import { Text, View } from "react-native";

import { CategoryIconFromModel } from "@/components/common/CategoryIcon";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { palette } from "@/constants/colors";
import { useLocale } from "@/context/LocaleContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "react-i18next";

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
  const { isDark } = useTheme();
  const { fontFamily } = useLocale();

  const accountItems: ReadonlyArray<DropdownItem<string>> = selectedAccount
    ? [{ value: selectedAccount.id, label: selectedAccount.name }]
    : [];
  const categoryItems: ReadonlyArray<DropdownItem<string>> = selectedCategory
    ? [{ value: selectedCategory.id, label: selectedCategory.displayName }]
    : [];

  const labelClassName =
    "mb-2 text-sm leading-5 font-normal text-text-secondary dark:text-text-secondary-dark";
  const selectedTextClassName =
    "text-sm leading-[22px] font-normal text-slate-900 dark:text-white";

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
        {hasAccounts ? (
          <Dropdown
            variant="outlined"
            label={t("account")}
            required
            items={accountItems}
            value={selectedAccount?.id ?? null}
            onChange={() => undefined}
            isOpen={false}
            onToggle={onOpenAccount}
            placeholder={t("select")}
            testID="manual-account-selector"
            error={accountError}
            triggerClassName="min-h-14"
            labelClassName={labelClassName}
            labelStyle={{ fontFamily: fontFamily.regular }}
            selectedTextClassName={selectedTextClassName}
            selectedTextStyle={{ fontFamily: fontFamily.regular }}
            selectedAdornment={
              selectedAccount ? (
                <View className="h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  <Ionicons
                    name={
                      selectedAccount.type === "BANK"
                        ? "business-outline"
                        : selectedAccount.type === "DIGITAL_WALLET"
                          ? "card-outline"
                          : "wallet-outline"
                    }
                    size={18}
                    color={isDark ? palette.slate[300] : palette.slate[600]}
                  />
                </View>
              ) : undefined
            }
          />
        ) : (
          <>
            <Text
              className={labelClassName}
              style={{ fontFamily: fontFamily.regular }}
            >
              {t("account")}
              <Text className="text-red-500">{" *"}</Text>
            </Text>
            <EmptyStateCard
              onPress={onAddAccount}
              icon="wallet-outline"
              title={t("no_accounts_found")}
              description={t("tap_here_to_add_one")}
              height={56}
              borderRadius={8}
              className="mt-0.5"
            />
          </>
        )}
      </View>

      <View
        ref={categoryFieldRef}
        collapsable={false}
        className={isStacked ? "w-full" : "flex-1"}
      >
        <Dropdown
          variant="outlined"
          label={t("category")}
          required
          items={categoryItems}
          value={selectedCategory?.id ?? null}
          onChange={() => undefined}
          isOpen={false}
          onToggle={onOpenCategory}
          placeholder={t("select_category")}
          testID="manual-category-selector"
          error={categoryError}
          triggerClassName="min-h-14"
          labelClassName={labelClassName}
          labelStyle={{ fontFamily: fontFamily.regular }}
          selectedTextClassName={selectedTextClassName}
          selectedTextStyle={{ fontFamily: fontFamily.regular }}
          selectedAdornment={
            selectedCategory ? (
              <View className="h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <CategoryIconFromModel category={selectedCategory} size={18} />
              </View>
            ) : undefined
          }
        />
      </View>
    </View>
  );
}
