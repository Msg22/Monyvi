/**
 * Toast - Premium animated toast notifications
 *
 * Uses react-native-reanimated for smooth animations
 * Supports success, error, info, and warning variants
 */

import { palette } from "@/constants/colors";
import { TAB_BAR_HEIGHT } from "@/constants/ui";
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
import { Text, View, type ViewStyle } from "react-native";
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
  success: "checkmark-circle",
  error: "close-circle",
  info: "information-circle",
  warning: "warning",
};

const TOAST_COLORS: Record<
  ToastType,
  {
    accent: string;
    darkBorder: string;
    darkIcon: string;
    darkIconBg: string;
    darkIconBorder: string;
    lightBorder: string;
    lightIcon: string;
    lightIconBg: string;
    lightIconBorder: string;
  }
> = {
  success: {
    accent: palette.nileGreen[500],
    darkBorder: `${palette.nileGreen[500]}66`,
    darkIcon: palette.nileGreen[400],
    darkIconBg: `${palette.nileGreen[500]}1F`,
    darkIconBorder: `${palette.nileGreen[500]}33`,
    lightBorder: `${palette.nileGreen[500]}66`,
    lightIcon: palette.nileGreen[600],
    lightIconBg: palette.nileGreen[50],
    lightIconBorder: palette.nileGreen[100],
  },
  error: {
    accent: palette.red[500],
    darkBorder: `${palette.red[500]}66`,
    darkIcon: palette.red[400],
    darkIconBg: `${palette.red[500]}1F`,
    darkIconBorder: `${palette.red[500]}33`,
    lightBorder: `${palette.red[500]}33`,
    lightIcon: palette.red[600],
    lightIconBg: palette.red[100],
    lightIconBorder: `${palette.red[500]}33`,
  },
  info: {
    accent: palette.blue[500],
    darkBorder: `${palette.blue[500]}66`,
    darkIcon: palette.blue[100],
    darkIconBg: `${palette.blue[500]}1F`,
    darkIconBorder: `${palette.blue[500]}33`,
    lightBorder: `${palette.blue[500]}33`,
    lightIcon: palette.blue[600],
    lightIconBg: palette.blue[50],
    lightIconBorder: palette.blue[100],
  },
  warning: {
    accent: palette.orange[500],
    darkBorder: `${palette.orange[500]}66`,
    darkIcon: palette.orange[100],
    darkIconBg: `${palette.orange[500]}1F`,
    darkIconBorder: `${palette.orange[500]}33`,
    lightBorder: `${palette.orange[500]}33`,
    lightIcon: palette.orange[600],
    lightIconBg: palette.orange[100],
    lightIconBorder: `${palette.orange[500]}33`,
  },
};

const TOAST_ENTER_DURATION_MS = 180;
const TOAST_EXIT_DURATION_MS = 140;
const TOAST_ENTER_OFFSET_Y = 12;
const TOAST_ENTER_SCALE = 0.98;
const TOAST_BOTTOM_OFFSET = TAB_BAR_HEIGHT + 8;
const TOAST_DARK_BACKGROUND = `${palette.slate[950]}F2`;
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
  readonly accentStyle: Pick<ViewStyle, "backgroundColor">;
  readonly iconColor: string;
  readonly iconShellStyle: Pick<ViewStyle, "backgroundColor" | "borderColor">;
  readonly surfaceStyle: Pick<ViewStyle, "backgroundColor" | "borderColor">;
}

function getToastVisualStyle(
  type: ToastType,
  isDark: boolean
): ToastVisualStyle {
  const colors = TOAST_COLORS[type];

  return {
    accentStyle: {
      backgroundColor: colors.accent,
    },
    iconColor: isDark ? colors.darkIcon : colors.lightIcon,
    iconShellStyle: {
      backgroundColor: isDark ? colors.darkIconBg : colors.lightIconBg,
      borderColor: isDark ? colors.darkIconBorder : colors.lightIconBorder,
    },
    surfaceStyle: {
      backgroundColor: isDark ? TOAST_DARK_BACKGROUND : palette.slate[25],
      borderColor: isDark ? colors.darkBorder : colors.lightBorder,
    },
  };
}

function Toast({ config, onHide }: ToastProps): React.JSX.Element {
  const icon = TOAST_ICONS[config.type];
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const visualStyle = getToastVisualStyle(config.type, isDark);

  useEffect(() => {
    const timer = setTimeout(() => {
      onHide();
    }, config.duration || 3000);

    return () => clearTimeout(timer);
  }, [config, onHide]);

  return (
    <Animated.View
      entering={TOAST_ENTERING_ANIMATION}
      exiting={FadeOut.duration(TOAST_EXIT_DURATION_MS).easing(
        Easing.in(Easing.cubic)
      )}
      className="absolute start-4 end-4 z-50"
      style={{ bottom: insets.bottom + TOAST_BOTTOM_OFFSET }}
      testID="toast-container"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View
        className="relative flex-row items-center overflow-hidden rounded-2xl border py-3 pe-4 ps-5"
        style={[TOAST_SHADOW_STYLE, visualStyle.surfaceStyle]}
        testID="toast-surface"
      >
        <View
          className="absolute bottom-3 start-0 top-3 w-1 rounded-e-full"
          style={visualStyle.accentStyle}
          testID="toast-accent"
        />

        <View
          className="me-3 h-9 w-9 items-center justify-center rounded-full border"
          style={visualStyle.iconShellStyle}
          testID="toast-icon-shell"
        >
          <Ionicons name={icon} size={21} color={visualStyle.iconColor} />
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
