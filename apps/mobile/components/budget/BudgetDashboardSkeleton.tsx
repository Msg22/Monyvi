import React from "react";
import { View } from "react-native";

import { Skeleton } from "@/components/ui/Skeleton";

export function BudgetDashboardSkeleton(): React.JSX.Element {
  return (
    <View testID="budget-dashboard-skeleton" className="flex-1 px-5 pt-4">
      <View testID="budget-filter-skeletons" className="flex-row gap-2">
        <Skeleton width={64} height={40} borderRadius={20} />
        <Skeleton width={82} height={40} borderRadius={20} />
        <Skeleton width={92} height={40} borderRadius={20} />
        <Skeleton width={82} height={40} borderRadius={20} />
      </View>
      <View className="mt-8">
        <Skeleton width="100%" height={264} borderRadius={24} />
      </View>
      <View className="mt-8">
        <Skeleton width={164} height={24} borderRadius={8} />
      </View>
      <View
        testID="budget-row-skeleton-group"
        className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
      >
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            testID={`budget-row-skeleton-${index}`}
            className={`h-20 bg-white px-3 py-3 dark:bg-slate-800 ${
              index < 2 ? "border-b border-slate-200 dark:border-slate-700" : ""
            }`}
          >
            <Skeleton width="100%" height={56} borderRadius={16} />
          </View>
        ))}
      </View>
    </View>
  );
}
