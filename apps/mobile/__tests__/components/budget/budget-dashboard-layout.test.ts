import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";
import {
  GLOBAL_BUDGET_CARD_GAP,
  GLOBAL_BUDGET_MIN_CARD_WIDTH,
  calculateGlobalCarouselLayout,
  groupGlobalBudgets,
  resolveGlobalCarouselPage,
} from "@/components/budget/budget-dashboard-layout";

function item(id: string): BudgetDashboardItem {
  const dashboardItem: BudgetDashboardItem = {
    id,
    displayName: id,
    period: "MONTHLY",
    currency: "EGP",
    scope: "GLOBAL",
    lifecycle: "HEALTHY",
    sectionId: "OVERALL",
    metrics: {
      spent: 0,
      limit: 100,
      remaining: 100,
      percentage: 0,
      dailyAverage: 0,
      status: "safe",
    },
    daysLeft: 1,
    daysElapsed: 1,
    expiresAt: null,
    categoryLabel: { kind: "not-applicable" },
    categoryIcon: null,
    availableAction: null,
  };
  return dashboardItem;
}

describe("budget dashboard layout", () => {
  it("uses the approved geometry constants", () => {
    expect(GLOBAL_BUDGET_MIN_CARD_WIDTH).toBe(320);
    expect(GLOBAL_BUDGET_CARD_GAP).toBe(16);
  });

  it.each([
    { width: -1, itemCount: 3, visible: 1, cardWidth: 0, pages: 0 },
    { width: 0, itemCount: 3, visible: 1, cardWidth: 0, pages: 0 },
    { width: 319, itemCount: 3, visible: 1, cardWidth: 319, pages: 3 },
    { width: 320, itemCount: 3, visible: 1, cardWidth: 320, pages: 3 },
    { width: 655, itemCount: 3, visible: 1, cardWidth: 655, pages: 3 },
    { width: 656, itemCount: 3, visible: 2, cardWidth: 320, pages: 2 },
    { width: 1000, itemCount: 2, visible: 2, cardWidth: 492, pages: 1 },
  ])(
    "calculates complete whole-card pages at $width dp",
    ({ width, itemCount, visible, cardWidth, pages }) => {
      expect(calculateGlobalCarouselLayout(width, itemCount)).toEqual({
        containerWidth: Math.max(0, width),
        visibleCardCount: visible,
        cardWidth,
        pageCount: pages,
      });
    }
  );

  it("groups immutable pages without stretching the final page", () => {
    const budgets = [item("a"), item("b"), item("c"), item("d"), item("e")];

    const pages = groupGlobalBudgets(budgets, 2);

    expect(
      pages.map((page) => page.budgets.map((budget) => budget.id))
    ).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(pages.map((page) => page.key)).toEqual(["a:b", "c:d", "e"]);
    expect(Object.isFrozen(pages)).toBe(true);
    expect(Object.isFrozen(pages[0])).toBe(true);
    expect(Object.isFrozen(pages[0]?.budgets)).toBe(true);
  });

  it("recovers the page containing the stable first-visible budget", () => {
    const pages = groupGlobalBudgets(
      [item("a"), item("b"), item("c"), item("d")],
      2
    );

    expect(resolveGlobalCarouselPage(pages, "c")).toBe(1);
    expect(resolveGlobalCarouselPage(pages, "missing")).toBe(0);
    expect(resolveGlobalCarouselPage(pages, null)).toBe(0);
  });
});
