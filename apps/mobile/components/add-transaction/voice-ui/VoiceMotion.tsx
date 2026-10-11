import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { palette } from "@/constants/colors";
import { useReactiveReducedMotion } from "@/hooks/useReactiveReducedMotion";

const RIPPLE_DURATION_MS = 1400;
const RIPPLE_STAGGER_MS = 700;
const ACTIVITY_DURATION_MS = 1200;
const PARSING_DURATION_MS = 1600;
const RIPPLE_MAX_SCALE = 172 / 104;

/** Decorative motion signals capture activity; it does not represent volume. */
export function RecordingRipples({
  isActive,
}: {
  readonly isActive: boolean;
}): React.JSX.Element {
  const first = useSharedValue(0);
  const second = useSharedValue(0);
  const reducedMotion = useReactiveReducedMotion();
  useEffect(() => {
    first.value = 0;
    second.value = 0;
    if (isActive && !reducedMotion) {
      first.value = withRepeat(
        withTiming(1, { duration: RIPPLE_DURATION_MS }),
        -1,
        false
      );
      second.value = withDelay(
        RIPPLE_STAGGER_MS,
        withRepeat(withTiming(1, { duration: RIPPLE_DURATION_MS }), -1, false)
      );
    }
    return () => {
      cancelAnimation(first);
      cancelAnimation(second);
    };
  }, [first, second, isActive, reducedMotion]);
  const firstStyle = useAnimatedStyle(() => ({
    opacity: isActive && !reducedMotion ? 1 - first.value : 0.35,
    transform: [
      {
        scale:
          isActive && !reducedMotion
            ? 1 + first.value * (RIPPLE_MAX_SCALE - 1)
            : 140 / 104,
      },
    ],
  }));
  const secondStyle = useAnimatedStyle(() => ({
    opacity: isActive && !reducedMotion ? 1 - second.value : 0.2,
    transform: [
      {
        scale:
          isActive && !reducedMotion
            ? 1 + second.value * (RIPPLE_MAX_SCALE - 1)
            : RIPPLE_MAX_SCALE,
      },
    ],
  }));
  return (
    <>
      <Animated.View
        testID="voice-recording-ripple-first"
        accessible={false}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        className="absolute h-[104px] w-[104px] rounded-[52px] border border-nileGreen-500"
        style={firstStyle}
      />
      <Animated.View
        testID="voice-recording-ripple-second"
        accessible={false}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        className="absolute h-[104px] w-[104px] rounded-[52px] border border-nileGreen-500"
        style={secondStyle}
      />
    </>
  );
}

export function RecordingActivity({
  isActive,
}: {
  readonly isActive: boolean;
}): React.JSX.Element {
  const progress = useSharedValue(0);
  const reducedMotion = useReactiveReducedMotion();
  useEffect(() => {
    progress.value = 0;
    if (isActive && !reducedMotion)
      progress.value = withRepeat(
        withTiming(1, { duration: ACTIVITY_DURATION_MS }),
        -1,
        true
      );
    return () => cancelAnimation(progress);
  }, [isActive, progress, reducedMotion]);
  return (
    <View
      testID="voice-recording-activity"
      accessible={false}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      className="mt-2 h-8 flex-row items-center justify-center gap-1"
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <ActivityBar key={index} index={index} progress={progress} />
      ))}
    </View>
  );
}

function ActivityBar({
  index,
  progress,
}: {
  readonly index: number;
  readonly progress: { readonly value: number };
}): React.JSX.Element {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scaleY:
          0.35 + (index % 2 === 0 ? progress.value : 1 - progress.value) * 0.65,
      },
    ],
  }));
  return (
    <Animated.View
      className="h-6 w-1 rounded-full bg-nileGreen-500"
      style={animatedStyle}
    />
  );
}

/** Indeterminate processing illustration, without invented stages or amounts. */
export function ParsingIllustration({
  isArabic,
}: {
  readonly isArabic: boolean;
}): React.JSX.Element {
  const progress = useSharedValue(0);
  const reducedMotion = useReactiveReducedMotion();
  useEffect(() => {
    progress.value = 0;
    if (!reducedMotion)
      progress.value = withRepeat(
        withTiming(1, { duration: PARSING_DURATION_MS }),
        -1,
        true
      );
    return () => cancelAnimation(progress);
  }, [progress, reducedMotion]);
  const dotsStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : 0.4 + progress.value * 0.6,
    transform: [{ translateX: reducedMotion ? 0 : progress.value * 6 }],
  }));
  const receiptStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : 0.65 + progress.value * 0.35,
    transform: [{ scale: reducedMotion ? 1 : 0.95 + progress.value * 0.05 }],
  }));
  return (
    <View
      testID="voice-parsing-illustration"
      accessible={false}
      accessibilityElementsHidden
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      className={`h-[172px] w-[172px] items-center justify-center gap-3 ${isArabic ? "flex-row-reverse" : "flex-row"}`}
    >
      <View className="h-12 flex-row items-center gap-1">
        {[0, 1, 2, 3, 4].map((index) => (
          <ActivityBar key={index} index={index} progress={progress} />
        ))}
      </View>
      <Animated.View className="flex-row items-center gap-1" style={dotsStyle}>
        <View className="h-1 w-1 rounded-full bg-nileGreen-500" />
        <View className="h-1 w-1 rounded-full bg-nileGreen-500" />
        <View className="h-1 w-1 rounded-full bg-nileGreen-500" />
      </Animated.View>
      <Animated.View
        className="h-20 w-14 items-center justify-center rounded-xl border border-nileGreen-500/40 bg-nileGreen-50 dark:bg-slate-800"
        style={receiptStyle}
      >
        <Ionicons
          name="receipt-outline"
          size={36}
          color={palette.nileGreen[600]}
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}
