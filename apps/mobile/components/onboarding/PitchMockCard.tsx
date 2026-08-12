import React from "react";
import { View } from "react-native";

interface PitchMockCardProps {
  readonly children: React.ReactNode;
  readonly density?: "default" | "compact";
}

/**
 * Shared visual wrapper for pitch-slide illustrations.
 * Compact density removes the legacy double top margin and gives dense
 * review content enough room on short devices.
 */
export function PitchMockCard({
  children,
  density = "default",
}: PitchMockCardProps): React.ReactElement {
  const spacingClassName = density === "compact" ? "mt-0 p-3" : "mt-8 p-4";

  return (
    <View
      className={`w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-800 ${spacingClassName}`}
    >
      {children}
    </View>
  );
}
