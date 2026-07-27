import React from "react";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

interface SmsReviewAnimatedItemProps {
  readonly children: React.ReactNode;
}

const SMS_REVIEW_ITEM_LAYOUT = LinearTransition.duration(180).reduceMotion(
  ReduceMotion.System
);
const SMS_REVIEW_ITEM_ENTERING = FadeIn.duration(180).reduceMotion(
  ReduceMotion.System
);
const SMS_REVIEW_ITEM_EXITING = FadeOut.duration(150).reduceMotion(
  ReduceMotion.System
);

export function SmsReviewAnimatedItem({
  children,
}: SmsReviewAnimatedItemProps): React.JSX.Element {
  return (
    <Animated.View
      layout={SMS_REVIEW_ITEM_LAYOUT}
      entering={SMS_REVIEW_ITEM_ENTERING}
      exiting={SMS_REVIEW_ITEM_EXITING}
    >
      {children}
    </Animated.View>
  );
}
