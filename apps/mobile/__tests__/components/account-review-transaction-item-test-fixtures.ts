/**
 * #395 T021/T039 TESTS-ONLY shaped row fixture.
 * The actual TransactionItem is never mocked. The additional props below
 * describe a proposed parent-owned presentation seam; no domain/business union.
 */
import type { AccountReviewRow } from "@monyvi/logic";
import type { ComponentProps } from "react";
import { TransactionItem } from "@/components/transaction-review/TransactionItem";
import { makeDefaultInfoSession } from "./account-review-default-info-test-fixtures";
import {
  makeSharedPresentation,
  requireGroup,
  type SharedGroupViewFixture,
} from "./shared-account-suggestions-test-fixtures";

export interface ShapedAccountReviewRow {
  readonly rowId: AccountReviewRow["rowId"];
  readonly accountActionLabel: string | null;
  readonly accountStatusLabel: string | null;
  readonly sharedSelectionDisclosure: string | null;
  readonly currencyActionLabel: string | null;
  readonly currencyContextLabel: string | null;
  readonly isBusy: boolean;
  readonly onChooseAccount: (rowId: AccountReviewRow["rowId"]) => void;
  readonly onChooseCurrency: (
    rowId: AccountReviewRow["rowId"],
    contextLabel: string
  ) => void;
}

export type ReviewItemProps = ComponentProps<typeof TransactionItem> & {
  readonly accountReview: ShapedAccountReviewRow;
};

type ItemBase = ComponentProps<typeof TransactionItem>;

function requireCanonicalRow(
  scene: "r3-default-only" | "r3-combined-en",
  index: number
): AccountReviewRow {
  const row = makeDefaultInfoSession(scene).rows[index];
  if (!row) throw new Error("Missing canonical B1 transaction row");
  return row;
}

export function makeRowActions(
  rowId: AccountReviewRow["rowId"],
  overrides: Partial<ShapedAccountReviewRow> = {}
): ShapedAccountReviewRow {
  return {
    rowId,
    accountActionLabel: "Change",
    accountStatusLabel: null,
    sharedSelectionDisclosure: null,
    currencyActionLabel: null,
    currencyContextLabel: null,
    isBusy: false,
    onChooseAccount: jest.fn<void, [rowId: AccountReviewRow["rowId"]]>(),
    onChooseCurrency: jest.fn<
      void,
      [rowId: AccountReviewRow["rowId"], contextLabel: string]
    >(),
    ...overrides,
  };
}

/** Canonical B1 row carries true category/amount/source fields as-is. */
export function makeDefaultItem(
  base: Partial<ItemBase> = {},
  action: Partial<ShapedAccountReviewRow> = {}
): ReviewItemProps {
  const row = requireCanonicalRow("r3-default-only", 0);
  return {
    transaction: row.transaction,
    index: 0,
    isSelected: row.selected,
    accountName: "Cash",
    hasMissingInfo: false,
    onToggleSelect: jest.fn<void, [index: number]>(),
    onPress: jest.fn<void, [index: number]>(),
    ...base,
    accountReview: makeRowActions(row.rowId, action),
  };
}

export function makeCombinedItem(
  rowIndex: number,
  base: Partial<ItemBase> = {},
  action: Partial<ShapedAccountReviewRow> = {}
): ReviewItemProps {
  const row = requireCanonicalRow("r3-combined-en", rowIndex);
  return {
    transaction: row.transaction,
    index: rowIndex,
    isSelected: row.selected,
    accountName: null,
    hasMissingInfo: row.reviewReasons.length > 0,
    onToggleSelect: jest.fn<void, [index: number]>(),
    onPress: jest.fn<void, [index: number]>(),
    ...base,
    accountReview: makeRowActions(row.rowId, action),
  };
}

export function requireReviewGroup(
  name: "QNB" | "CIB",
  scene: "r3-combined-en" | "r3-confirmed-feedback" = "r3-combined-en"
): SharedGroupViewFixture {
  return requireGroup(makeSharedPresentation(scene), name);
}

export function requireArabicQnb(): SharedGroupViewFixture {
  return requireGroup(makeSharedPresentation("r3-combined-ar", "ar"), "QNB");
}
