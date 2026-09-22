import { palette } from "@/constants/colors";
import type { CurrencyType } from "@monyvi/db";
import React from "react";
import { IconLibrary } from "../common/CategoryIcon";
import { BaseCard } from "./BaseCard";

interface TransactionCardProps {
  id: string;
  signedFormattedAmount: string;
  date: Date;
  isExpense: boolean;
  isIncome: boolean;
  counterparty?: string;
  note?: string;
  source?: string;
  accountName: string;
  categoryName: string;
  categoryIconName: string;
  categoryIconLibrary: IconLibrary;
  displayNetWorth: number | null;
  currencyCode: CurrencyType;
  isSelectionMode: boolean;
  isSelected: boolean;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
  /** Optional formatted equivalent amount in preferred currency */
  equivalentAmountText?: string;
}

/**
 * Render a transaction card configured for a specific transaction.
 *
 * @param id - Unique transaction identifier
 * @param signedFormattedAmount - The already-formatted amount string including sign (e.g., "-$12.34" or "+$10.00")
 * @param date - Transaction date
 * @param isExpense - Whether the transaction is an expense
 * @param isIncome - Whether the transaction is an income
 * @param counterparty - Optional counterparty name to show on the card
 * @param note - Optional note or details for the transaction
 * @param accountName - Name of the account associated with the transaction
 * @param categoryName - Category label to display as the card title
 * @param categoryIconName - Icon name for the category
 * @param categoryIconLibrary - Icon library identifier for the category icon
 * @param displayNetWorth - Whether to display net worth information on the card
 * @param currencyCode - Currency code for the transaction
 * @param isSelectionMode - Whether the card is rendered in selection mode
 * @param isSelected - Whether the card is currently selected
 * @param onPress - Press handler for the card
 * @param onLongPress - Long-press handler for the card
 * @param index - Optional index used for ordering or animations
 * @param onSwipeDelete - Optional handler invoked with the transaction `id` when a swipe-to-delete occurs
 * @param onCategoryPress - Optional handler invoked with the transaction `id` when the category area is pressed
 * @param onAmountPress - Optional handler invoked with the transaction `id` when the amount area is pressed
 * @returns A JSX element representing the transaction card
 */
export const TransactionCard = React.memo(function TransactionCard({
  id,
  signedFormattedAmount,
  date,
  isExpense,
  isIncome,
  counterparty,
  note,
  accountName,
  categoryName,
  categoryIconName,
  categoryIconLibrary,
  displayNetWorth,
  currencyCode,
  isSelectionMode,
  isSelected,
  onPress,
  onLongPress,
  equivalentAmountText,
  // New Props
  index,
  onSwipeDelete,
  onCategoryPress,
  onAmountPress,
}: TransactionCardProps & {
  index?: number;
  onSwipeDelete?: (id: string) => void;
  onCategoryPress?: (id: string) => void;
  onAmountPress?: (id: string) => void;
}): React.JSX.Element {
  // Compute derived values
  const mainColor = isExpense
    ? palette.red[500]
    : isIncome
      ? palette.nileGreen[500]
      : palette.slate[500];

  return (
    <BaseCard
      id={id}
      isSelectionMode={isSelectionMode}
      isSelected={isSelected}
      onPress={onPress}
      onLongPress={onLongPress}
      mainColor={mainColor}
      iconName={categoryIconName}
      iconLibrary={categoryIconLibrary}
      title={categoryName}
      amount={signedFormattedAmount}
      subtitle={accountName}
      counterparty={counterparty}
      isExpense={isExpense}
      isIncome={isIncome}
      details={note}
      displayNetWorth={displayNetWorth}
      currencyCode={currencyCode}
      date={date}
      index={index}
      onSwipeDelete={onSwipeDelete}
      onCategoryPress={onCategoryPress}
      onAmountPress={onAmountPress}
      equivalentAmountText={equivalentAmountText}
    />
  );
});
