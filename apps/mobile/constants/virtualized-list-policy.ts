import type { FlatListProps } from "react-native";

// Android's native clipping child array can become inconsistent as dynamic rows change.
export const ANDROID_SAFE_LIST_PROPS = {
  removeClippedSubviews: false,
} as const satisfies Pick<FlatListProps<unknown>, "removeClippedSubviews">;
