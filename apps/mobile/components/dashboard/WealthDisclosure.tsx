import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text } from "react-native";

import { palette } from "@/constants/colors";

interface WealthDisclosureProps {
  readonly isExpanded: boolean;
  readonly label: string;
  readonly onPress: () => void;
}

export function WealthDisclosure({
  isExpanded,
  label,
  onPress,
}: WealthDisclosureProps): React.JSX.Element {
  return (
    <Pressable
      accessible
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      className="min-h-11 w-full flex-row items-center justify-between gap-3"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
      testID="wealth-breakdown-disclosure"
    >
      <Text className="min-w-0 flex-1 text-start text-base font-semibold text-white">
        {label}
      </Text>
      <Ionicons
        color={palette.slate[25]}
        name={isExpanded ? "chevron-up" : "chevron-down"}
        size={24}
      />
    </Pressable>
  );
}
