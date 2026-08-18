import { Skeleton } from "@/components/ui/Skeleton";
import React from "react";
import { View } from "react-native";

interface BudgetDetailSkeletonProps {
  readonly showCategoryBreakdown?: boolean;
}

export function BudgetDetailSkeleton({
  showCategoryBreakdown = true,
}: BudgetDetailSkeletonProps): React.JSX.Element {
  return (
    <View accessible={false} importantForAccessibility="no" className="pb-6">
      <View testID="detail-skeleton-identity" className="mx-5 mb-4 flex-row items-center gap-3">
        <Skeleton width={48} height={48} borderRadius={24} />
        <View className="flex-1 gap-2">
          <Skeleton width="62%" height={22} borderRadius={6} />
          <Skeleton width="84%" height={14} borderRadius={5} />
        </View>
        <Skeleton width={78} height={44} borderRadius={22} />
      </View>

      <SkeletonCard testID="detail-skeleton-overview" height={260}>
        <View className="flex-row justify-between">
          <View className="gap-2"><Skeleton width={74} height={14} /><Skeleton width={130} height={28} /><Skeleton width={110} height={14} /></View>
          <View className="items-end gap-2"><Skeleton width={62} height={28} /><Skeleton width={54} height={14} /></View>
        </View>
        <View className="mt-6 gap-2"><Skeleton width="100%" height={8} borderRadius={4} /><View className="flex-row justify-between"><Skeleton width={20} height={12} /><Skeleton width={30} height={12} /></View></View>
        <View className="mt-6 flex-row justify-between"><Skeleton width="28%" height={42} /><Skeleton width="28%" height={42} /><Skeleton width="28%" height={42} /></View>
      </SkeletonCard>

      <SkeletonCard testID="detail-skeleton-trend" height={270}>
        <View className="flex-row justify-between"><Skeleton width={150} height={18} /><Skeleton width={120} height={14} /></View>
        <View className="mt-5 flex-row">
          <View testID="detail-skeleton-trend-axis" className="w-[70px] justify-between pe-2">
            <Skeleton width={54} height={10} />
            <Skeleton width={46} height={10} />
            <Skeleton width={38} height={10} />
          </View>
          <View className="h-32 flex-1 flex-row items-end justify-around">
            {[64, 96, 78, 48].map((height) => (
              <View key={height} className="flex-row items-end gap-1">
                <View testID="detail-skeleton-trend-actual"><Skeleton width={18} height={height} borderRadius={4} /></View>
                <View testID="detail-skeleton-trend-pace"><Skeleton width={18} height={88} borderRadius={4} /></View>
              </View>
            ))}
          </View>
        </View>
        <View className="mt-5"><Skeleton width="100%" height={42} borderRadius={10} /></View>
      </SkeletonCard>

      {showCategoryBreakdown ? <ListCard testID="detail-skeleton-breakdown" rowCount={3} /> : null}
      <ListCard testID="detail-skeleton-recent" rowCount={4} />

      <View testID="detail-skeleton-danger" className="mx-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <Skeleton width={100} height={18} />
        <View className="mt-2"><Skeleton width="90%" height={34} /></View>
        <View className="mt-3"><Skeleton width="100%" height={48} borderRadius={12} /></View>
      </View>
    </View>
  );
}

function SkeletonCard({ testID, height, children }: { readonly testID: string; readonly height: number; readonly children: React.ReactNode }): React.JSX.Element {
  return <View testID={testID} className="mx-5 mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" style={{ minHeight: height }}>{children}</View>;
}

function ListCard({ testID, rowCount }: { readonly testID: string; readonly rowCount: number }): React.JSX.Element {
  return (
    <View testID={testID} className="mx-5 mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Skeleton width={160} height={18} />
      {Array.from({ length: rowCount }, (_, index) => (
        <View key={index} className="mt-4 flex-row items-center gap-3">
          <Skeleton width={44} height={44} borderRadius={22} />
          <View className="flex-1 gap-2"><Skeleton width="62%" height={15} /><Skeleton width="42%" height={12} /></View>
          <View className="items-end gap-2"><Skeleton width={72} height={15} /><Skeleton width={38} height={12} /></View>
        </View>
      ))}
    </View>
  );
}
