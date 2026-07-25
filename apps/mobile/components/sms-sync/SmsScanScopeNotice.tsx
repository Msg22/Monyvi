import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

interface SmsScanScopeNoticeProps {
  readonly label: string;
}

export function SmsScanScopeNotice({
  label,
}: SmsScanScopeNoticeProps): React.JSX.Element {
  return (
    <View
      accessibilityRole="text"
      className="mx-4 mb-2 self-start flex-row items-center gap-2 rounded-lg border border-slate-300 bg-slate-25 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
    >
      <Ionicons name="calendar-outline" size={18} color={palette.slate[400]} />
      <Text className="text-sm font-medium text-text-secondary">{label}</Text>
    </View>
  );
}
