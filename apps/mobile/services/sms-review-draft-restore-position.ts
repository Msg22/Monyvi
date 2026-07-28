export interface SmsReviewDraftPositionedItem {
  readonly position: number;
}

export function getSmsReviewDraftItemsToShiftForRestore<
  TItem extends SmsReviewDraftPositionedItem,
>(items: readonly TItem[], restoredPosition: number): readonly TItem[] {
  return items
    .filter((item) => item.position >= restoredPosition)
    .sort((left, right) => right.position - left.position);
}
