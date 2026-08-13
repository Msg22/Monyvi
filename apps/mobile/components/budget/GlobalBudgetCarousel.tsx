import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { CurrencyType } from "@monyvi/db";

import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import type { BudgetDashboardItem } from "@/services/budget-list-read-model-service";
import { BudgetDashboardCard } from "./BudgetDashboardCard";
import {
  GLOBAL_BUDGET_CARD_GAP,
  calculateGlobalCarouselLayout,
  groupGlobalBudgets,
  resolveGlobalCarouselPage,
  type GlobalBudgetPage,
} from "./budget-dashboard-layout";

interface GlobalBudgetCarouselProps {
  readonly budgets: readonly BudgetDashboardItem[];
  readonly preferredCurrency: CurrencyType;
  readonly onBudgetPress: (budgetId: string) => void;
  readonly onResume?: (budgetId: string) => void;
  readonly onRenew?: (budgetId: string) => void;
}

export function GlobalBudgetCarousel({
  budgets,
  preferredCurrency,
  onBudgetPress,
  onResume,
  onRenew,
}: GlobalBudgetCarouselProps): React.JSX.Element {
  const { t } = useTranslation("budgets");
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const firstVisibleBudgetIdRef = useRef<string | null>(budgets[0]?.id ?? null);
  const listRef = useRef<FlatList<GlobalBudgetPage>>(null);
  const layout = useMemo(
    () => calculateGlobalCarouselLayout(containerWidth, budgets.length),
    [budgets.length, containerWidth, windowWidth]
  );
  const pages = useMemo(
    () => groupGlobalBudgets(budgets, layout.visibleCardCount),
    [budgets, layout.visibleCardCount]
  );

  useEffect(() => {
    const nextPage = resolveGlobalCarouselPage(
      pages,
      firstVisibleBudgetIdRef.current
    );
    setCurrentPage(nextPage);
    if (layout.containerWidth > 0 && pages.length > 0) {
      listRef.current?.scrollToOffset({
        offset: nextPage * layout.containerWidth,
        animated: false,
      });
    }
  }, [layout.containerWidth, pages]);

  const handleLayout = useCallback((event: LayoutChangeEvent): void => {
    setContainerWidth(Math.max(0, event.nativeEvent.layout.width));
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      if (layout.containerWidth <= 0 || pages.length === 0) return;
      const nextPage = Math.min(
        pages.length - 1,
        Math.max(
          0,
          Math.round(
            Math.abs(event.nativeEvent.contentOffset.x) / layout.containerWidth
          )
        )
      );
      firstVisibleBudgetIdRef.current = pages[nextPage]?.budgets[0]?.id ?? null;
      setCurrentPage(nextPage);
      AccessibilityInfo.announceForAccessibility(
        t("carousel_page_announcement", {
          current: nextPage + 1,
          total: pages.length,
        })
      );
    },
    [layout.containerWidth, pages, t]
  );

  const renderPage = useCallback(
    ({ item: page }: { readonly item: GlobalBudgetPage }) => (
      <View
        testID={`global-budget-page-${page.key}`}
        className="flex-row items-stretch"
        style={{ width: layout.containerWidth, gap: GLOBAL_BUDGET_CARD_GAP }}
      >
        {page.budgets.map((budget) => (
          <View
            key={budget.id}
            testID={`global-budget-card-${budget.id}`}
            style={{ width: layout.cardWidth }}
          >
            <BudgetDashboardCard
              item={budget}
              variant="global"
              preferredCurrency={preferredCurrency}
              onPress={onBudgetPress}
              onResume={onResume}
              onRenew={onRenew}
            />
          </View>
        ))}
      </View>
    ),
    [
      layout.cardWidth,
      layout.containerWidth,
      onBudgetPress,
      onRenew,
      onResume,
      preferredCurrency,
    ]
  );

  return (
    <View
      testID="global-budget-carousel-container"
      onLayout={handleLayout}
      accessibilityLabel={t("overall_budgets")}
    >
      {containerWidth > 0 ? (
        <FlatList
          ref={listRef}
          testID="global-budget-carousel"
          horizontal
          pagingEnabled
          data={pages}
          renderItem={renderPage}
          keyExtractor={(page) => page.key}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          getItemLayout={(_data, index) => ({
            index,
            length: layout.containerWidth,
            offset: layout.containerWidth * index,
          })}
          {...ANDROID_SAFE_LIST_PROPS}
        />
      ) : null}

      {pages.length > 1 ? (
        <View className="mt-3 flex-row justify-center gap-2">
          {pages.map((page, index) => (
            <View
              key={page.key}
              testID={`global-budget-page-dot-${index}`}
              accessible
              accessibilityLabel={t("carousel_page_announcement", {
                current: index + 1,
                total: pages.length,
              })}
              accessibilityState={{ selected: index === currentPage }}
              className={`h-2 rounded-full ${
                index === currentPage
                  ? "w-5 bg-nileGreen-500"
                  : "w-2 bg-slate-300 dark:bg-slate-600"
              }`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
