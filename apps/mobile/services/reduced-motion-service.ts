import { AccessibilityInfo } from "react-native";

export function readReducedMotion(): Promise<boolean> {
  return AccessibilityInfo.isReduceMotionEnabled();
}

export function subscribeReducedMotion(
  onChange: (enabled: boolean) => void
): () => void {
  const subscription = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    onChange
  );
  return (): void => subscription.remove();
}
