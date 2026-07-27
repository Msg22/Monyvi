import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";

interface SmsEditIconProps {
  readonly name: keyof typeof Ionicons.glyphMap;
  readonly color: string;
}

export function SmsEditIcon({
  name,
  color,
}: SmsEditIconProps): React.JSX.Element {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}
