import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";

export const GLOBAL_BUDGET_MIN_CARD_WIDTH = 320;
export const GLOBAL_BUDGET_CARD_GAP = 16;

export interface GlobalCarouselLayout {
  readonly containerWidth: number;
  readonly visibleCardCount: number;
  readonly cardWidth: number;
  readonly pageCount: number;
}

export interface GlobalBudgetPage {
  readonly key: string;
  readonly budgets: readonly BudgetDashboardItem[];
}

export function calculateGlobalCarouselLayout(
  containerWidth: number,
  itemCount: number
): GlobalCarouselLayout {
  const safeWidth = Math.max(0, containerWidth);
  if (safeWidth === 0) {
    return Object.freeze({
      containerWidth: 0,
      visibleCardCount: 1,
      cardWidth: 0,
      pageCount: 0,
    });
  }

  const wholeCardCount = Math.max(
    1,
    Math.floor(
      (safeWidth + GLOBAL_BUDGET_CARD_GAP) /
        (GLOBAL_BUDGET_MIN_CARD_WIDTH + GLOBAL_BUDGET_CARD_GAP)
    )
  );
  const visibleCardCount =
    itemCount > 0 ? Math.min(itemCount, wholeCardCount) : 1;
  const cardWidth =
    (safeWidth - GLOBAL_BUDGET_CARD_GAP * (visibleCardCount - 1)) /
    visibleCardCount;

  return Object.freeze({
    containerWidth: safeWidth,
    visibleCardCount,
    cardWidth,
    pageCount: itemCount > 0 ? Math.ceil(itemCount / visibleCardCount) : 0,
  });
}

export function groupGlobalBudgets(
  budgets: readonly BudgetDashboardItem[],
  visibleCardCount: number
): readonly GlobalBudgetPage[] {
  const groupSize = Math.max(1, Math.floor(visibleCardCount));
  const pages: GlobalBudgetPage[] = [];

  for (let index = 0; index < budgets.length; index += groupSize) {
    const pageBudgets = Object.freeze(budgets.slice(index, index + groupSize));
    pages.push(
      Object.freeze({
        key: pageBudgets.map((budget) => budget.id).join(":"),
        budgets: pageBudgets,
      })
    );
  }

  return Object.freeze(pages);
}

export function resolveGlobalCarouselPage(
  pages: readonly GlobalBudgetPage[],
  firstVisibleBudgetId: string | null
): number {
  if (!firstVisibleBudgetId) return 0;
  const pageIndex = pages.findIndex((page) =>
    page.budgets.some((budget) => budget.id === firstVisibleBudgetId)
  );
  return pageIndex >= 0 ? pageIndex : 0;
}
