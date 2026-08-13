import { palette } from "@/constants/colors";
import { MIC_BUTTON_SIZE, TAB_BAR_HEIGHT } from "@/constants/ui";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useContext, useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "react-i18next";
import { IconConfig, TabIcon } from "./TabIcon";

interface CustomBottomTabBarProps extends BottomTabBarProps {
  /** Callback when the mic button is pressed. */
  readonly onMicPress?: () => void;
  /** Whether voice recording is currently active. */
  readonly isRecording?: boolean;
  /** Optional ref to the mic button View for tooltip anchoring. */
  readonly micButtonRef?: React.RefObject<View | null>;
}

/**
 * Tab icon configuration
 * Maps route names to their icon config (library, name, outlineName)
 * This allows using different icon libraries for different tabs cleanly
 */
const TAB_ICON_CONFIG: Record<string, IconConfig> = {
  index: { library: "ionicons", name: "home", outlineName: "home-outline" },
  accounts: { library: "material", name: "account-balance" },
  transactions: {
    library: "ionicons",
    name: "swap-horizontal",
    outlineName: "swap-horizontal-outline",
  },
  metals: { library: "material-community", name: "gold" },
};

/**
 * Tab labels for display
 * Maps route names to their display labels
 */
const TAB_LABELS: Record<string, string> = {
  index: "Home",
  accounts: "Accounts",
  transactions: "Transactions",
  metals: "Metals",
};

/**
 * Order of tabs in the tab bar (with placeholder for center mic)
 * The center position (index 2) is reserved for the mic button
 */
const TAB_ORDER = ["index", "accounts", "__mic__", "transactions", "metals"];

function CustomBottomTabBarComponent({
  state,
  navigation,
  onMicPress,
  isRecording = false,
  micButtonRef,
}: CustomBottomTabBarProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { language } = useLocale();
  const { t } = useTranslation("common");
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);

  // Calculate safe bottom padding
  const bottomPadding = Math.max(insets.bottom);
  const tabBarHeight = TAB_BAR_HEIGHT + bottomPadding;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent): void => {
      onHeightChange?.(event.nativeEvent.layout.height);
    },
    [onHeightChange]
  );

  const handleMicPress = useCallback(() => {
    if (onMicPress) {
      onMicPress();
    }
  }, [onMicPress]);

  // Pulse animation for recording state (T020)
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.6, { duration: 1200, easing: Easing.out(Easing.ease) }),
        -1, // infinite
        true // reverse
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isRecording, pulseScale, pulseOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  /**
   * Render a single tab item
   */
  const renderTabItem = (routeName: string): React.ReactElement | null => {
    // Skip the mic placeholder
    if (routeName === "__mic__") {
      return null;
    }

    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return null;

    const routeIndex = state.routes.findIndex((r) => r.name === routeName);
    const isFocused = state.index === routeIndex;
    const iconConfig = TAB_ICON_CONFIG[routeName];
    const label = TAB_LABELS[routeName] || routeName;

    const onPress = (): void => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    const onLongPress = (): void => {
      navigation.emit({
        type: "tabLongPress",
        target: route.key,
      });
    };

    return (
      <TouchableOpacity
        key={routeName}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        accessibilityLanguage={language}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        className="flex-1 items-center justify-center py-2"
      >
        <TabIcon
          config={iconConfig}
          focused={isFocused}
          size={24}
          label={label}
        />
      </TouchableOpacity>
    );
  };

  return (
    <>
      {/* Main tab bar */}
      <View
        testID="custom-bottom-tab-bar"
        onLayout={handleLayout}
        className="absolute bottom-0 start-0 end-0 z-[25]"
        style={{ paddingBottom: bottomPadding, height: tabBarHeight }}
      >
        <BlurView
          intensity={80}
          tint="light"
          className="flex-1 overflow-hidden rounded-t-3xl dark:hidden"
        >
          <View className="flex-1 flex-row items-center bg-white/80">
            {/* Left tabs: Home, Accounts */}
            <View className="flex-1 flex-row">
              {TAB_ORDER.slice(0, 2).map((routeName) =>
                renderTabItem(routeName)
              )}
            </View>

            {/* Center: Mic button placeholder */}
            <View style={{ width: MIC_BUTTON_SIZE + 16 }} />

            {/* Right tabs: Transactions, Metals */}
            <View className="flex-1 flex-row">
              {TAB_ORDER.slice(3).map((routeName) => renderTabItem(routeName))}
            </View>
          </View>
        </BlurView>
        <BlurView
          intensity={60}
          tint="dark"
          className="hidden dark:flex flex-1 overflow-hidden rounded-t-3xl"
        >
          <View className="flex-1 flex-row items-center bg-slate-900/80">
            {/* Left tabs: Home, Accounts */}
            <View className="flex-1 flex-row">
              {TAB_ORDER.slice(0, 2).map((routeName) =>
                renderTabItem(routeName)
              )}
            </View>

            {/* Center: Mic button placeholder */}
            <View style={{ width: MIC_BUTTON_SIZE + 16 }} />

            {/* Right tabs: Transactions, Metals */}
            <View className="flex-1 flex-row">
              {TAB_ORDER.slice(3).map((routeName) => renderTabItem(routeName))}
            </View>
          </View>
        </BlurView>

        {/* Center microphone button (elevated above tab bar) */}
        <View
          ref={micButtonRef}
          collapsable={false}
          className="absolute start-1/2 z-[30]"
          style={{
            top: -MIC_BUTTON_SIZE / 2 + 8,
            marginStart: -MIC_BUTTON_SIZE / 2,
          }}
        >
          {/* T020: Pulse ring behind mic button */}
          <Animated.View style={[styles.pulseRing, pulseAnimatedStyle]} />
          <Pressable
            onPress={handleMicPress}
            accessibilityLabel={t("voice_recording_label")}
            accessibilityRole="button"
            accessibilityHint={t("voice_recording_hint")}
            accessibilityLanguage={language}
            accessibilityState={{ busy: isRecording }}
            accessible
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              shadowColor: palette.nileGreen[500],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            })}
          >
            <LinearGradient
              colors={[palette.nileGreen[500], palette.nileGreen[600]]}
              className="items-center justify-center"
              style={{
                width: MIC_BUTTON_SIZE,
                height: MIC_BUTTON_SIZE,
                borderRadius: MIC_BUTTON_SIZE / 2,
              }}
            >
              <Ionicons name="mic" size={28} color={palette.slate[50]} />
            </LinearGradient>
          </Pressable>
          {isRecording && (
            <Text
              className="mt-1 text-center text-[10px] font-semibold"
              style={{ color: palette.nileGreen[500] }}
            >
              {t("voice_listening")}
            </Text>
          )}
        </View>
      </View>
    </>
  );
}

export const CustomBottomTabBar = memo(CustomBottomTabBarComponent);

const styles = StyleSheet.create({
  pulseRing: {
    position: "absolute",
    width: MIC_BUTTON_SIZE,
    height: MIC_BUTTON_SIZE,
    borderRadius: MIC_BUTTON_SIZE / 2,
    backgroundColor: palette.nileGreen[500],
  },
});
