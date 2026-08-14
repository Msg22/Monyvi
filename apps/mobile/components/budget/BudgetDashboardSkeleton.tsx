import React from "react";
import { View } from "react-native";

import { Skeleton } from "@/components/ui/Skeleton";

const ROW_SKELETON_COUNT = 3;

function SectionHeadingSkeleton({
  testID,
}: {
  readonly testID: string;
}): React.JSX.Element {
  return (
    <View testID={testID} className="pb-3 pt-6">
      <Skeleton width={164} height={22} borderRadius={8} />
    </View>
  );
}

function GlobalCardSkeleton(): React.JSX.Element {
  return (
    <View
      testID="budget-global-card-skeleton"
      className="h-64 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
    >
      <View
        testID="budget-global-card-title-skeleton"
        className="flex-row items-start justify-between gap-3"
      >
        <Skeleton width={44} height={44} borderRadius={12} />
        <View className="min-w-0 flex-1">
          <Skeleton width="72%" height={20} borderRadius={7} />
          <View className="mt-2">
            <Skeleton width={64} height={12} borderRadius={6} />
          </View>
        </View>
        <Skeleton width={88} height={28} borderRadius={14} />
      </View>

      <View
        testID="budget-global-card-progress-skeleton"
        className="mt-5 flex-row items-center gap-3"
      >
        <View className="flex-1">
          <Skeleton width="100%" height={8} borderRadius={4} />
        </View>
        <Skeleton width={48} height={24} borderRadius={7} />
      </View>

      <View className="mt-4">
        <Skeleton width={184} height={14} borderRadius={7} />
      </View>
      <View className="mt-3 flex-row items-center justify-between gap-3">
        <Skeleton width={152} height={14} borderRadius={7} />
        <Skeleton width={96} height={12} borderRadius={6} />
      </View>
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
      className={`min-h-20 flex-row items-center bg-white px-3 py-2.5 dark:bg-slate-800 ${
        index < ROW_SKELETON_COUNT - 1
          ? "border-b border-slate-200 dark:border-slate-700"
          : ""
      }`}
    >
      <View testID={`budget-row-icon-skeleton-${index}`}>
        <Skeleton width={36} height={36} borderRadius={18} />
      </View>

      <View
        testID={`budget-row-copy-skeleton-${index}`}
        className="ms-2.5 min-w-0 flex-1"
      >
        <Skeleton width="72%" height={11} borderRadius={5} />
        <View className="mt-2">
          <Skeleton width="88%" height={12} borderRadius={6} />
        </View>
      </View>

      <View
        testID={`budget-row-metric-skeleton-${index}`}
        className="ms-2 w-32 items-end"
      >
        <View className="flex-row items-center justify-end gap-1">
          <Skeleton width={42} height={20} borderRadius={6} />
          <Skeleton width={66} height={24} borderRadius={12} />
        </View>
        <View className="mt-1.5 w-full">
          <Skeleton width="100%" height={6} borderRadius={3} />
        </View>
      </View>

      <View
        testID={`budget-row-chevron-skeleton-${index}`}
        className="ms-1 min-h-11 min-w-6 items-end justify-center"
      >
        <Skeleton width={8} height={20} borderRadius={4} />
      </View>
    </View>
  );
}

export function BudgetDashboardSkeleton(): React.JSX.Element {
  return (
    <View testID="budget-dashboard-skeleton" className="flex-1 px-5">
      <View testID="budget-filter-skeleton-shell" className="-mx-5 py-2 pt-4">
        <View
          testID="budget-filter-skeletons"
          className="flex-row items-center gap-2 px-4"
        >
          <Skeleton width={64} height={40} borderRadius={20} />
          <Skeleton width={82} height={40} borderRadius={20} />
          <Skeleton width={92} height={40} borderRadius={20} />
          <Skeleton width={82} height={40} borderRadius={20} />
        </View>
      </View>

      <View className="pt-4">
        <SectionHeadingSkeleton testID="budget-overall-heading-skeleton" />
        <GlobalCardSkeleton />
        <View
          testID="budget-carousel-dot-skeletons"
          className="mt-3 flex-row justify-center gap-2"
        >
          <Skeleton width={20} height={8} borderRadius={4} />
          <Skeleton width={8} height={8} borderRadius={4} />
        </View>
      </View>

      <SectionHeadingSkeleton testID="budget-attention-heading-skeleton" />
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
