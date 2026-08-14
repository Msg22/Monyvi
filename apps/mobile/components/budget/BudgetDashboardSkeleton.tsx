import React from "react";
import { View } from "react-native";

import { Skeleton } from "@/components/ui/Skeleton";

const ROW_SKELETON_COUNT = 3;

function FilterCardSkeleton(): React.JSX.Element {
  return (
    <View className="min-h-24 flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800">
      <Skeleton width={29} height={29} borderRadius={8} />
      <View className="ms-3 min-w-0 flex-1">
        <Skeleton width="58%" height={12} borderRadius={6} />
        <View className="mt-2">
          <Skeleton width="76%" height={18} borderRadius={7} />
        </View>
      </View>
      <Skeleton width={18} height={18} borderRadius={6} />
    </View>
  );
}

function BudgetRowSkeleton({
  index,
}: {
  readonly index: number;
}): React.JSX.Element {
  return (
    <View
      testID={`budget-row-skeleton-${index}`}
      className={`min-h-28 flex-row items-center bg-white px-4 py-4 dark:bg-slate-800 ${
        index < ROW_SKELETON_COUNT - 1
          ? "border-b border-slate-200 dark:border-slate-700"
          : ""
      }`}
    >
      <View testID={`budget-row-icon-skeleton-${index}`}>
        <Skeleton width={48} height={48} borderRadius={24} />
      </View>
      <View
        testID={`budget-row-copy-skeleton-${index}`}
        className="ms-3 min-w-0 flex-1"
      >
        <Skeleton width="78%" height={17} borderRadius={7} />
        <View className="mt-2">
          <Skeleton width="62%" height={13} borderRadius={6} />
        </View>
        <View className="mt-3">
          <Skeleton width="92%" height={13} borderRadius={6} />
        </View>
        <View className="mt-3">
          <Skeleton width="100%" height={6} borderRadius={3} />
        </View>
      </View>
      <View
        testID={`budget-row-metric-skeleton-${index}`}
        className="ms-3 w-28 items-end"
      >
        <Skeleton width={52} height={26} borderRadius={7} />
        <View className="mt-2">
          <Skeleton width={80} height={14} borderRadius={6} />
        </View>
      </View>
      <View
        testID={`budget-row-chevron-skeleton-${index}`}
        className="ms-1 min-h-11 min-w-7 items-end justify-center"
      >
        <Skeleton width={9} height={22} borderRadius={4} />
      </View>
    </View>
  );
}

export function BudgetDashboardSkeleton(): React.JSX.Element {
  return (
    <View testID="budget-dashboard-skeleton" className="flex-1 px-5 pt-4">
      <View testID="budget-filter-skeleton-shell">
        <View
          testID="budget-scope-tab-skeletons"
          className="h-12 flex-row items-center justify-around overflow-hidden rounded-full border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-800"
        >
          <Skeleton width="28%" height={32} borderRadius={16} />
          <Skeleton width="28%" height={18} borderRadius={7} />
          <Skeleton width="28%" height={18} borderRadius={7} />
        </View>
        <View
          testID="budget-filter-card-skeletons"
          className="mt-4 flex-row gap-3"
        >
          <FilterCardSkeleton />
          <FilterCardSkeleton />
        </View>
      </View>

      <View testID="budget-result-count-skeleton" className="pb-4 pt-6">
        <Skeleton width={132} height={14} borderRadius={7} />
      </View>

      <View
        testID="budget-row-skeleton-group"
        className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
      >
        {Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
          <BudgetRowSkeleton key={index} index={index} />
        ))}
      </View>
    </View>
  );
}
