/** #395 canonical transaction-row presentation; source data and commands stay in the parent. */
import React from "react";
import type { AccountReviewRow, AccountReviewSession } from "@monyvi/logic";
import type { UseAccountReviewResult } from "@/hooks/useAccountReview";
import { useTranslation } from "react-i18next";
import type { TransactionReviewProps } from "./TransactionReview";
import { TransactionItem } from "./TransactionItem";
import { AtmDestinationStatus } from "./account-review-row-presentation";
import { getExpandedContent } from "./get-expanded-content";
import {
  presentCanonicalRowDetails,
  presentReviewTransactionContext,
  type ReviewDisplayLanguage,
} from "./shared-account-presentation";
import { View } from "react-native";
import type { AccountChoiceLinkedRow } from "./AccountChoiceSheet";

interface CanonicalReviewRowProps {
  readonly row: AccountReviewRow;
  readonly index: number;
  readonly isLast: boolean;
  readonly groups: ReadonlyMap<string, AccountReviewSession["groups"][number]>;
  readonly accounts: UseAccountReviewResult["choiceAccounts"];
  readonly language: ReviewDisplayLanguage;
  readonly transactions: TransactionReviewProps["transactions"];
  readonly workspaceVariant: TransactionReviewProps["workspaceVariant"];
  readonly onDiscardItem: TransactionReviewProps["onDiscardItem"];
  readonly isBusy: boolean;
  readonly onToggleRow: (rowId: string) => void;
  readonly onEditRow: (rowId: string) => void;
  readonly onChooseAccount: (
    rowId: string,
    role?: "source" | "destination"
  ) => void;
  readonly onEditCategory: (rowId: string) => void;
}

export function CanonicalReviewRow({
  row,
  index,
  isLast,
  groups,
  accounts,
  language,
  transactions,
  workspaceVariant,
  onDiscardItem,
  isBusy,
  onToggleRow,
  onEditRow,
  onChooseAccount,
  onEditCategory,
}: CanonicalReviewRowProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const sourceGroup =
    row.assignment.state === "suggested"
      ? (groups.get(row.assignment.groupId) ?? null)
      : null;
  const destinationGroup =
    row.toAssignment?.state === "suggested"
      ? (groups.get(row.toAssignment.groupId) ?? null)
      : null;
  const details = presentCanonicalRowDetails(
    row,
    sourceGroup,
    accounts,
    language,
    destinationGroup
  );
  const content = getExpandedContent(row.transaction);
  const smsIndex =
    row.source === "SMS"
      ? transactions.findIndex(
          (transaction) =>
            "smsFingerprint" in transaction &&
            transaction.smsFingerprint === row.sourceFingerprint
        )
      : -1;
  const discard =
    row.source === "SMS" &&
    workspaceVariant === "sms" &&
    onDiscardItem &&
    smsIndex >= 0
      ? (_visibleIndex: number, wasSelected: boolean): void => {
          if (!isBusy) void onDiscardItem(smsIndex, wasSelected);
        }
      : undefined;
  return (
    <View>
      <TransactionItem
        transaction={row.transaction}
        index={index}
        isLastCanonicalRow={isLast}
        isSelected={row.selected}
        accountName={details.accountName}
        expandedContentTitle={content?.title}
        expandedContentBody={content?.body}
        onToggleSelect={() => onToggleRow(row.rowId)}
        onPress={() => onEditRow(row.rowId)}
        hasMissingInfo={
          row.reviewReasons.length > 0 ||
          row.currency.state === "unconfirmed" ||
          row.assignment.state === "unresolved"
        }
        isSmsWorkspace={workspaceVariant === "sms"}
        onDiscard={discard}
        accountReview={{
          rowId: row.rowId,
          accountActionLabel: details.accountActionLabel,
          accountStatusLabel: details.accountStatusLabel,
          accountType: details.accountType,
          sharedSelectionDisclosure: null,
          currencyActionLabel: details.currencyActionLabel,
          currencyContextLabel: details.currencyContextLabel,
          accountStatusTone: details.accountStatusTone,
          isBusy,
          onChooseAccount,
          onChooseCurrency: (rowId) => onChooseAccount(rowId),
          canEditCategory: !(
            row.source === "SMS" && row.transaction.isAtmWithdrawal === true
          ),
          onEditCategory,
        }}
      />
      {details.isSmsAtm ? (
        <AtmDestinationStatus
          label={t("to_account")}
          destinationName={details.destinationName}
          missingLabel={t("please_select_destination_account")}
          disabled={isBusy}
          onChoose={() => onChooseAccount(row.rowId, "destination")}
        />
      ) : null}
    </View>
  );
}

/** Live linked scope from canonical source order; never from the active filter. */
export function presentLinkedChoiceRows(
  session: AccountReviewSession,
  group: AccountReviewSession["groups"][number] | null,
  summaries: ReadonlyArray<{
    readonly groupId: string;
    readonly liveLinkedRowIds: readonly string[];
  }>,
  language: ReviewDisplayLanguage
): readonly AccountChoiceLinkedRow[] {
  if (!group) return [];
  const linked = new Set(
    summaries.find((item) => item.groupId === group.groupId)
      ?.liveLinkedRowIds ?? []
  );
  return session.rows
    .filter((row) => linked.has(row.rowId))
    .map((row) => ({
      rowId: row.rowId,
      title: presentReviewTransactionContext(row.transaction, language),
      amountLabel:
        String(row.transaction.amount) +
        " " +
        (row.currency.state === "known" ? row.currency.code : group.currency),
    }));
}
