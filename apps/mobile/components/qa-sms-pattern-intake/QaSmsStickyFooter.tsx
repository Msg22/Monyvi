import React from "react";
import { View } from "react-native";

interface QaSmsStickyFooterProps {
  readonly testID: string;
  readonly bottomInset: number;
  readonly children: React.ReactNode;
  readonly className?: string;
}

const MINIMUM_BOTTOM_PADDING = 12;

export function QaSmsStickyFooter({
  testID,
  bottomInset,
  children,
  className = "",
}: QaSmsStickyFooterProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      className={className}
      style={{
        paddingBottom: Math.max(bottomInset, MINIMUM_BOTTOM_PADDING),
      }}
    >
      {children}
    </View>
  );
}

export type { QaSmsStickyFooterProps };
