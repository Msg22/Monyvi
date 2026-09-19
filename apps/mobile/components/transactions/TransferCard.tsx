import { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import React from "react";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { BaseCard } from "./BaseCard";

interface TransferCardProps {
  id: string;
  amount: number;
  currency: CurrencyType;
  date: Date;
  fromAccountName: string;
  toAccountName: string;
  notes?: string;
  displayNetWorth: number | null;
  currencyCode: CurrencyType;
  isSelectionMode: boolean;
  isSelected: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
}

/**
 * Render a transaction card representing a transfer between two accounts.
 *
 * @returns A JSX element: a configured BaseCard that displays transfer details (title, amount, accounts, date, notes, selection state, and currency code).
 */
export const TransferCard = React.memo(function TransferCard({
  id,
  amount,
  currency,
  date,
  fromAccountName,
  toAccountName,
  notes,
  displayNetWorth,
  currencyCode,
  isSelectionMode,
  isSelected,
  index,
  onPress,
  onLongPress,
  onSwipeDelete,
}: TransferCardProps & {
  index?: number;
  onSwipeDelete?: (id: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation("common");
  const mainColor = palette.blue[500];
  const formattedAmount = formatCurrency({
    amount: Math.abs(amount),
    currency,
  });
  const subtitle = `${fromAccountName} → ${toAccountName}`;

  return (
    <BaseCard
      id={id}
      isSelectionMode={isSelectionMode}
      isSelected={isSelected}
      onPress={onPress}
      onLongPress={onLongPress}
      mainColor={mainColor}
      iconName="swap-horizontal"
      iconLibrary="Ionicons"
      title={t("transfer")}
      amount={formattedAmount}
      subtitle={subtitle}
      isExpense={false}
      isIncome={false}
      details={notes}
      displayNetWorth={displayNetWorth}
      currencyCode={currencyCode}
      date={date}
      index={index}
      onSwipeDelete={onSwipeDelete}
      onCategoryPress={undefined}
      onAmountPress={undefined}
    />
  );
});
