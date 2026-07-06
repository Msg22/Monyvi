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

  return Math.max(bottomInset, initialBottomInset);
}
