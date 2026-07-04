/**
 * Toast - Premium animated toast notifications
 *
 * Uses react-native-reanimated for smooth animations
 * Supports success, error, info, and warning variants
 */

import { palette } from "@/constants/colors";
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
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
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
  { bg: string; icon: string; border: string }
> = {
  success: {
    bg: `${palette.slate[950]}F2`,
    icon: palette.nileGreen[400],
    border: `${palette.nileGreen[500]}66`,
  },
  error: {
    bg: `${palette.slate[950]}F2`,
    icon: palette.red[400],
    border: `${palette.red[500]}66`,
  },
  info: {
    bg: `${palette.slate[950]}F2`,
    icon: palette.blue[100],
    border: `${palette.blue[500]}66`,
  },
  warning: {
    bg: `${palette.slate[950]}F2`,
    icon: palette.orange[100],
    border: `${palette.orange[500]}66`,
  },
};

const TOAST_ENTER_DURATION_MS = 180;
const TOAST_EXIT_DURATION_MS = 140;
const TOAST_ENTER_OFFSET_Y = -8;
const TOAST_SHADOW_STYLE: ViewStyle = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.22,
  shadowRadius: 18,
  elevation: 6,
};

function Toast({ config, onHide }: ToastProps): React.JSX.Element {
  const colors = TOAST_COLORS[config.type];
  const icon = TOAST_ICONS[config.type];
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timer = setTimeout(() => {
      onHide();
    }, config.duration || 3000);

    return () => clearTimeout(timer);
  }, [config.duration, onHide]);

  return (
    <Animated.View
      entering={FadeIn.duration(TOAST_ENTER_DURATION_MS)
        .easing(Easing.out(Easing.cubic))
        .withInitialValues({
          opacity: 0,
          transform: [{ translateY: TOAST_ENTER_OFFSET_Y }],
        })}
      exiting={FadeOut.duration(TOAST_EXIT_DURATION_MS).easing(
        Easing.in(Easing.cubic)
      )}
      className="absolute start-4 end-4 z-50"
      style={{ top: insets.top + 12 }}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View
        className="flex-row items-center rounded-2xl border px-4 py-3"
        style={[
          TOAST_SHADOW_STYLE,
          { backgroundColor: colors.bg, borderColor: colors.border },
        ]}
      >
        <View className="me-3">
          <Ionicons name={icon} size={22} color={colors.icon} />
        </View>

        <View className="flex-1">
          <Text className="text-white text-sm font-semibold">
            {config.title}
          </Text>
          {config.message && (
            <Text className="text-white/80 text-xs mt-0.5">
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
