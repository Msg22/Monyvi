import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";

cssInterop(LinearGradient, {
  className: "style",
});

export interface VoiceGradientProps {
  readonly children: React.ReactNode;
  readonly colors: readonly [string, string, ...string[]];
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * Adapter component wrapping expo-linear-gradient with NativeWind cssInterop.
 * Translates Tailwind utility classes (e.g. flex-1 items-center justify-center)
 * directly into native style properties.
 */
export function VoiceGradient({
  children,
  colors,
  className = "flex-1 items-center justify-center",
  style,
  testID,
}: VoiceGradientProps): React.JSX.Element {
  return (
    <LinearGradient
      testID={testID}
      colors={colors}
      className={className}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
