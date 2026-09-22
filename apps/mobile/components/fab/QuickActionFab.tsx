/**
 * QuickActionFab - Floating Action Button with expandable quick actions
 *
 * Layout: Actions stack vertically above the FAB button
 * Each action has: [Label] [Icon Button]
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/constants/colors";
import { QUICK_ACTION_FAB_SIZE, TAB_BAR_HEIGHT } from "@/constants/ui";
import { useIsQuickActionFabSuppressed } from "@/hooks/useQuickActionFabVisibility";

const ACTION_SIZE = 44;
const FAB_RIGHT_MARGIN = 10;
const FAB_BOTTOM_OFFSET = 0;

interface QuickAction {
  readonly id: string;
  readonly iconName: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly route: string;
  readonly color: string;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "transfer",
    iconName: "swap-horizontal",
    label: "Transfer",
    route: "/add-transfer",
    color: palette.violet[500],
  },
  {
    id: "metals",
    iconName: "diamond-outline",
    label: "Add Metals",
    route: "/add-metal",
    color: palette.gold[600],
  },
  {
    id: "account",
    iconName: "wallet-outline",
    label: "Add Account",
    route: "/add-account",
    color: palette.blue[500],
  },
  {
    id: "transaction",
    iconName: "add-circle",
    label: "Add Transaction",
    route: "/add-transaction",
    color: palette.nileGreen[500],
  },
];

interface QuickActionFabProps {
  /** When true, the FAB is hidden (e.g. during voice recording). */
  readonly isRecordingActive?: boolean;
}

export function QuickActionFab({
  isRecordingActive = false,
}: QuickActionFabProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const isSuppressed = useIsQuickActionFabSuppressed();
  const [isExpanded, setIsExpanded] = useState(false);

  const fabRotation = useSharedValue(0);
  const fabBottom = TAB_BAR_HEIGHT + insets.bottom + FAB_BOTTOM_OFFSET;

  const toggleExpanded = useCallback(() => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    fabRotation.value = withSpring(newState ? 45 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [isExpanded, fabRotation]);

  const closeAndNavigate = useCallback(
    (route: string) => {
      setIsExpanded(false);
      fabRotation.value = withSpring(0, { damping: 15, stiffness: 150 });
      setTimeout(() => router.push(route as never), 100);
    },
    [fabRotation]
  );

  const fabIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fabRotation.value}deg` }],
  }));

  const isHidden = shouldHideQuickActionFab(isRecordingActive, isSuppressed);

  useEffect(() => {
    if (isHidden && isExpanded) {
      setIsExpanded(false);
      fabRotation.value = 0;
    }
  }, [fabRotation, isExpanded, isHidden]);

  if (isHidden) return null;

  return (
    <>
      {isExpanded ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="absolute inset-0 z-[99] bg-black/50"
        >
          <Pressable className="absolute inset-0" onPress={toggleExpanded} />
        </Animated.View>
      ) : null}

      <View
        className="absolute z-[100] items-end"
        style={{ bottom: fabBottom, right: FAB_RIGHT_MARGIN }}
      >
        {isExpanded ? (
          <Animated.View
            entering={SlideInDown.duration(250)}
            exiting={SlideOutDown.duration(150)}
            className="mb-3"
          >
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                testID={`fab-${action.id}`}
                onPress={() => closeAndNavigate(action.route)}
                className="mb-3 flex-row items-center justify-end"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                accessibilityLabel={action.label}
                accessibilityRole="button"
              >
                <Text
                  className="me-2.5 text-sm font-semibold text-white"
                  // eslint-disable-next-line react-native/no-inline-styles
                  style={{
                    textShadowColor: "rgba(0,0,0,0.3)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }}
                >
                  {action.label}
                </Text>
                <View
                  className="elevation-5 items-center justify-center shadow-sm shadow-black/20"
                  style={{
                    width: ACTION_SIZE,
                    height: ACTION_SIZE,
                    borderRadius: ACTION_SIZE / 2,
                    backgroundColor: action.color,
                  }}
                >
                  <Ionicons
                    name={action.iconName}
                    size={22}
                    color={palette.slate[50]}
                  />
                </View>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}

        <Pressable
          testID="fab-button"
          onPress={toggleExpanded}
          className="elevation-8"
          style={({ pressed }) => ({
            width: QUICK_ACTION_FAB_SIZE,
            height: QUICK_ACTION_FAB_SIZE,
            borderRadius: QUICK_ACTION_FAB_SIZE / 2,
            opacity: pressed ? 0.9 : 1,
            shadowColor: palette.nileGreen[700],
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          })}
          accessibilityLabel={isExpanded ? "Close" : "Quick actions"}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[palette.nileGreen[500], palette.nileGreen[600]]}
            className="items-center justify-center"
            style={{
              width: QUICK_ACTION_FAB_SIZE,
              height: QUICK_ACTION_FAB_SIZE,
              borderRadius: QUICK_ACTION_FAB_SIZE / 2,
            }}
          >
            <Animated.View style={fabIconStyle}>
              {/* eslint-disable-next-line no-restricted-syntax */}
              <Ionicons name="add" size={30} color={palette.slate[50]} />
            </Animated.View>
          </LinearGradient>
        </Pressable>
      </View>
    </>
  );
}

export function shouldHideQuickActionFab(
  isRecordingActive: boolean,
  isSuppressed: boolean
): boolean {
  return isRecordingActive || isSuppressed;
}
