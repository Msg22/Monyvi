import { useContext } from "react";
import { Platform } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaInsetsContext,
} from "react-native-safe-area-context";

export function useModalBottomInset(): number {
  const insets = useContext(SafeAreaInsetsContext);
  const initialBottomInset = initialWindowMetrics?.insets.bottom ?? 0;

  if (Platform.OS !== "android") {
    return insets?.bottom ?? initialBottomInset;
  }

  return Math.max(insets?.bottom ?? 0, initialBottomInset);
}
