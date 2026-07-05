/**
 * Toast - Premium animated toast notifications
 *
 * Uses react-native-reanimated for smooth animations
 * Supports success, error, info, and warning variants
 */

import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Keyboard,
  Text,
  View,
  type KeyboardEvent,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeOut,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// =============================================================================
// Types
// =============================================================================

type ToastType = "success" | "error" | "info" | "warning";

interface ToastConfig {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (config: ToastConfig) => void;
}

// =============================================================================
// Context
// =============================================================================

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

// =============================================================================
// Toast Component
// =============================================================================

interface ToastProps {
  config: ToastConfig;
  onHide: () => void;
}

const TOAST_ICONS: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark",
  error: "close-circle",
  info: "information-circle",
  warning: "warning",
};

const TOAST_COLORS: Record<
  ToastType,
  {
    darkIcon: string;
    lightIcon: string;
    accentClassName: string;
    iconShellClassName: string;
    surfaceClassName: string;
  }
> = {
  success: {
    darkIcon: palette.nileGreen[400],
    lightIcon: palette.nileGreen[600],
    accentClassName: "bg-nileGreen-500",
    iconShellClassName:
      "bg-nileGreen-50 border-nileGreen-100 dark:bg-nileGreen-500/10 dark:border-nileGreen-500/20",
    surfaceClassName:
      "bg-nileGreen-50/95 border-nileGreen-500/40 dark:bg-slate-950/95 dark:border-nileGreen-500/40",
  },
  error: {
    darkIcon: palette.red[400],
    lightIcon: palette.red[600],
    accentClassName: "bg-red-500",
    iconShellClassName:
      "bg-red-100 border-red-500/20 dark:bg-red-500/10 dark:border-red-500/20",
    surfaceClassName:
      "bg-slate-25/95 border-red-500/20 dark:bg-slate-950/95 dark:border-red-500/40",
  },
  info: {
    darkIcon: palette.blue[100],
    lightIcon: palette.blue[600],
    accentClassName: "bg-blue-500",
    iconShellClassName:
      "bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20",
    surfaceClassName:
      "bg-slate-25/95 border-blue-500/20 dark:bg-slate-950/95 dark:border-blue-500/40",
  },
  warning: {
    darkIcon: palette.orange[100],
    lightIcon: palette.orange[600],
    accentClassName: "bg-orange-500",
    iconShellClassName:
      "bg-orange-100 border-orange-500/20 dark:bg-orange-500/10 dark:border-orange-500/20",
    surfaceClassName:
      "bg-slate-25/95 border-orange-500/20 dark:bg-slate-950/95 dark:border-orange-500/40",
  },
};

const TOAST_ENTER_DURATION_MS = 180;
const TOAST_EXIT_DURATION_MS = 140;
const TOAST_ENTER_OFFSET_Y = -10;
const TOAST_ENTER_SCALE = 0.98;
const TOAST_TOP_GAP = 12;
const TOAST_KEYBOARD_GAP = 16;
const TOAST_SHADOW_STYLE: ViewStyle = {
  shadowColor: palette.slate[950],
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.22,
  shadowRadius: 18,
  elevation: 6,
};

const TOAST_ENTERING_ANIMATION: EntryExitAnimationFunction = () => {
  "worklet";

  const animationConfig = {
    duration: TOAST_ENTER_DURATION_MS,
    easing: Easing.out(Easing.cubic),
  };

  return {
    animations: {
      opacity: withTiming(1, animationConfig),
      transform: [
        { translateY: withTiming(0, animationConfig) },
        { scale: withTiming(1, animationConfig) },
      ],
    },
    initialValues: {
      opacity: 0,
      transform: [
        { translateY: TOAST_ENTER_OFFSET_Y },
        { scale: TOAST_ENTER_SCALE },
      ],
    },
  };
};

interface ToastVisualStyle {
  readonly accentClassName: string;
  readonly iconColor: string;
  readonly iconShellClassName: string;
  readonly surfaceClassName: string;
}

function getToastVisualStyle(
  type: ToastType,
  isDark: boolean
): ToastVisualStyle {
  const colors = TOAST_COLORS[type];

  return {
    accentClassName: colors.accentClassName,
    iconColor: isDark ? colors.darkIcon : colors.lightIcon,
    iconShellClassName: colors.iconShellClassName,
    surfaceClassName: colors.surfaceClassName,
  };
}

function Toast({ config, onHide }: ToastProps): React.JSX.Element {
  const icon = TOAST_ICONS[config.type];
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(
    getVisibleKeyboardHeight
  );
  const visualStyle = getToastVisualStyle(config.type, isDark);
  const containerPositionStyle =
    keyboardHeight > 0
      ? { bottom: keyboardHeight + TOAST_KEYBOARD_GAP }
      : { top: insets.top + TOAST_TOP_GAP };

  useEffect(() => {
    const handleKeyboardShow = (event: KeyboardEvent): void => {
      setKeyboardHeight(event.endCoordinates.height);
    };
    const handleKeyboardHide = (): void => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      handleKeyboardShow
    );
    const hideSubscription = Keyboard.addListener(
      "keyboardDidHide",
      handleKeyboardHide
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      onHide();
    }, config.duration ?? 3000);

    return () => clearTimeout(timer);
  }, [config, onHide]);

  return (
    <Animated.View
      entering={TOAST_ENTERING_ANIMATION}
      exiting={FadeOut.duration(TOAST_EXIT_DURATION_MS).easing(
        Easing.in(Easing.cubic)
      )}
      className="absolute start-4 end-4 z-[110]"
      style={containerPositionStyle}
      testID="toast-container"
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View
        className={`relative flex-row items-center overflow-hidden rounded-2xl border py-3 pe-4 ps-5 ${visualStyle.surfaceClassName}`}
        style={TOAST_SHADOW_STYLE}
        testID="toast-surface"
      >
        <View
          className={`absolute bottom-3 start-0 top-3 w-1 rounded-e-full ${visualStyle.accentClassName}`}
          testID="toast-accent"
        />

        <View
          className={`ms-1 me-3 h-10 w-10 items-center justify-center rounded-full border ${visualStyle.iconShellClassName}`}
          testID="toast-icon-shell"
        >
          <Ionicons
            name={icon}
            size={19}
            color={visualStyle.iconColor}
            testID="toast-icon"
          />
        </View>

        <View className="flex-1">
          <Text className="text-slate-900 dark:text-slate-25 text-sm font-semibold">
            {config.title}
          </Text>
          {config.message && (
            <Text className="text-slate-500 dark:text-slate-300 text-xs mt-0.5">
              {config.message}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function getVisibleKeyboardHeight(): number {
  return Keyboard.metrics()?.height ?? 0;
}

// =============================================================================
// Provider
// =============================================================================

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({
  children,
}: ToastProviderProps): React.JSX.Element {
  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);

  const showToast = useCallback((config: ToastConfig) => {
    setToastConfig(config);
  }, []);

  const hideToast = useCallback(() => {
    setToastConfig(null);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toastConfig && <Toast config={toastConfig} onHide={hideToast} />}
    </ToastContext.Provider>
  );
}
