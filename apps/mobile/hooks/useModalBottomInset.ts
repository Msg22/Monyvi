import { createContext, useContext, type Context } from "react";
import { Platform } from "react-native";
import {
  initialWindowMetrics,
  SafeAreaInsetsContext,
} from "react-native-safe-area-context";

interface ModalSafeAreaInsets {
  readonly bottom: number;
}

const fallbackSafeAreaInsetsContext =
  createContext<ModalSafeAreaInsets | null>(null);
const ANDROID_MODAL_BOTTOM_INSET_FALLBACK = 48;

export function useModalBottomInset(): number {
  const safeAreaInsetsContext = SafeAreaInsetsContext as
    | Context<ModalSafeAreaInsets | null>
    | undefined;
  const insets = useContext(
    safeAreaInsetsContext ?? fallbackSafeAreaInsetsContext
  );
  const bottomInset = insets?.bottom ?? 0;
  const initialBottomInset = initialWindowMetrics?.insets.bottom ?? 0;

  if (Platform.OS !== "android") {
    return bottomInset || initialBottomInset;
  }

  if (bottomInset === 0) {
    return Math.max(initialBottomInset, ANDROID_MODAL_BOTTOM_INSET_FALLBACK);
  }

  return Math.max(bottomInset, initialBottomInset);
}
