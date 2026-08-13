import React from "react";
import { View } from "react-native";

import { Skeleton } from "@/components/ui/Skeleton";

export function BudgetDashboardSkeleton(): React.JSX.Element {
  return (
    <View testID="budget-dashboard-skeleton" className="flex-1 px-5 pt-4">
      <View className="flex-row gap-2">
        <Skeleton width={64} height={40} borderRadius={20} />
        <Skeleton width={82} height={40} borderRadius={20} />
        <Skeleton width={92} height={40} borderRadius={20} />
      </View>
      <View className="mt-8">
        <Skeleton width="100%" height={264} borderRadius={24} />
      </View>
      <View className="mt-8">
        <Skeleton width={164} height={24} borderRadius={8} />
      </View>
      <View className="mt-4 flex-row gap-3">
        <View className="flex-1">
          <Skeleton width="100%" height={208} borderRadius={24} />
        </View>
        <View className="flex-1">
          <Skeleton width="100%" height={208} borderRadius={24} />
        </View>
      </View>
    </View>
  );
}
