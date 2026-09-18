import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { palette } from "@/constants/colors";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function BudgetFieldIcon({
  name,
}: {
  readonly name: IconName;
}): React.JSX.Element {
  return (
    <View className="me-3 h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-nileGreen-100 dark:bg-nileGreen-700/50">
      <Ionicons name={name} size={20} color={palette.nileGreen[400]} />
    </View>
  );
}

export function BudgetRequiredFieldLabel({
  label,
  testID,
  className,
}: {
  readonly label: string;
  readonly testID: string;
  readonly className: string;
}): React.JSX.Element {
  return (
    <Text className={className}>
      {label}
      <Text testID={testID} className="text-red-500">
        {" *"}
      </Text>
    </Text>
  );
}
