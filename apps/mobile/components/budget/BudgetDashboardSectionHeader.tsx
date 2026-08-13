import React from "react";
import { Text, View } from "react-native";

interface BudgetDashboardSectionHeaderProps {
  readonly title: string;
  readonly testID?: string;
}

export function BudgetDashboardSectionHeader({
  title,
  testID,
}: BudgetDashboardSectionHeaderProps): React.JSX.Element {
  return (
    <View testID={testID} className="pb-3 pt-6">
      <Text className="text-lg font-bold text-text-primary dark:text-slate-25">
        {title}
      </Text>
    </View>
  );
}
