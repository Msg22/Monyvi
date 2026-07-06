import { Platform } from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export function useModalBottomInset(): number {
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android") {
    return insets.bottom;
  }

  return Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
}
