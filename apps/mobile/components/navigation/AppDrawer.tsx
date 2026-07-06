/**
 * App Drawer Navigation
 *
 * Slide-out drawer with navigation menu sections, theme toggle, and logout.
 * Implements sync-first logout flow with confirmation modal for sync failures.
 *
 * @module AppDrawer
 */

import { palette } from "@/constants/colors";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import {
  DrawerMenuSection,
  type DrawerMenuItem,
} from "@/components/navigation/DrawerMenuSection";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useLogoutFlow } from "@/hooks/useLogoutFlow";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { useProfile } from "@/hooks/useProfile";
import {
  getProfileDisplayName,
  getProfileAvatarUrl,
  getProfileInitials,
} from "@/utils/profile-helpers";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// =============================================================================
// Types
// =============================================================================

interface MenuSection {
  titleKey: string;
  items: DrawerMenuItem[];
}

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DRAWER_WIDTH = Dimensions.get("window").width * 0.8;

const MENU_SECTIONS: MenuSection[] = [
  {
    titleKey: "menu_section_main",
    items: [
      { id: "home", labelKey: "home", icon: "home-outline", route: "/" },
      {
        id: "accounts",
        labelKey: "accounts",
        icon: "wallet-outline",
        route: "/accounts",
      },
      {
        id: "transactions",
        labelKey: "transactions",
        icon: "swap-horizontal-outline",
        route: "/transactions",
      },
    ],
  },
  {
    titleKey: "menu_section_assets",
    items: [
      {
        id: "metals",
        labelKey: "metals",
        icon: "diamond-outline",
        route: "/metals",
      },
      {
        id: "live-rates",
        labelKey: "live_rates",
        icon: "trending-up-outline",
        route: "/live-rates",
      },
      {
        id: "stats",
        labelKey: "stats",
        icon: "stats-chart-outline",
        route: "/stats",
      },
    ],
  },
  {
    titleKey: "menu_section_management",
    items: [
      {
        id: "bills",
        labelKey: "bills",
        icon: "receipt-outline",
        route: "/recurring-payments",
      },
      {
        id: "budgets",
        labelKey: "budgets",
        icon: "pie-chart-outline",
        route: "/budgets",
      },
    ],
  },
];

// =============================================================================
// Component
// =============================================================================

export function AppDrawer({
  visible,
  onClose,
}: AppDrawerProps): React.JSX.Element {
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { t: tDrawer } = useTranslation("drawer");

  // Derive display properties from raw profile using pure helpers
  const displayName = useMemo(
    () => getProfileDisplayName(profile, user?.email),
    [profile, user?.email]
  );
  const avatarUrl = useMemo(() => getProfileAvatarUrl(profile), [profile]);
  const initials = useMemo(
    () => getProfileInitials(profile, user?.email),
    [profile, user?.email]
  );

  const insets = useSafeAreaInsets();
  const bottomInset = useModalBottomInset();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // Avatar image loading state
  const [avatarError, setAvatarError] = useState(false);

  // Reset avatar error when URL changes (e.g., user updates their profile photo)
  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  const {
    isLoggingOut,
    showSyncWarning,
    requestLogout,
    forceLogout,
    dismissSyncWarning,
  } = useLogoutFlow({
    onSuccess: onClose,
  });

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const handleNavigation = useCallback(
    (route: string): void => {
      onClose();
      setTimeout(() => {
        router.push(route as never);
      }, 100);
    },
    [onClose]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable className="flex-1 bg-black/50" onPress={onClose}>
        {/* Drawer */}
        <Animated.View
          style={{
            width: DRAWER_WIDTH,
            height: "100%",
            transform: [{ translateX: slideAnim }],
          }}
        >
          <Pressable
            className="flex-1 bg-background dark:bg-background-dark"
            style={{ paddingTop: insets.top }}
          >
            {/* Header with gradient */}
            <LinearGradient
              colors={[palette.nileGreen[700], palette.slate[900]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="p-5 pb-6"
            >
              {/* Avatar */}
              {isProfileLoading ? (
                <View className="w-16 h-16 rounded-full bg-nileGreen-500/20 items-center justify-center mb-3 border-2 border-nileGreen-500/30">
                  <ActivityIndicator
                    size="small"
                    color={palette.nileGreen[400]}
                  />
                </View>
              ) : avatarUrl && !avatarError ? (
                <Image
                  source={{ uri: avatarUrl }}
                  resizeMode="cover"
                  className="w-16 h-16 rounded-full mb-3 border-2 border-nileGreen-500/30"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <View className="w-16 h-16 rounded-full bg-nileGreen-500/20 items-center justify-center mb-3 border-2 border-nileGreen-500/30">
                  <Text className="text-nileGreen-400 text-xl font-bold">
                    {initials || "?"}
                  </Text>
                </View>
              )}
              {/* User info */}
              {isProfileLoading ? (
                <>
                  <View className="h-5 w-32 rounded bg-slate-700/50 mb-1" />
                  <View className="h-4 w-44 rounded bg-slate-700/30" />
                </>
              ) : (
                <>
                  <Text
                    className="text-white text-lg font-bold"
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                  {user?.email && displayName !== user.email ? (
                    <Text className="text-slate-400 text-sm" numberOfLines={1}>
                      {user.email}
                    </Text>
                  ) : null}
                </>
              )}
            </LinearGradient>

            {/* Menu sections */}
            <View className="flex-1 p-4">
              {MENU_SECTIONS.map((section) => (
                <DrawerMenuSection
                  key={section.titleKey}
                  titleKey={section.titleKey}
                  items={section.items}
                  onItemPress={handleNavigation}
                />
              ))}
            </View>

            {/* Settings section */}
            <View
              className="border-t p-4 border-slate-200 dark:border-slate-800"
              style={{ paddingBottom: bottomInset + 16 }}
            >
              {/* Dark mode toggle */}
              <View className="flex-row items-center justify-between py-3">
                <View className="flex-row items-center">
                  <Ionicons
                    name="moon-outline"
                    size={22}
                    color={isDark ? palette.slate[300] : palette.slate[600]}
                  />
                  <Text className="ms-4 text-base text-slate-800 dark:text-white">
                    {t("dark_mode")}
                  </Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{
                    false: palette.slate[300],
                    true: palette.nileGreen[500],
                  }}
                  thumbColor="white"
                />
              </View>

              {/* Logout */}
              <TouchableOpacity
                onPress={() => {
                  requestLogout().catch(() => {
                    // The hook logs and handles failures internally.
                  });
                }}
                disabled={isLoggingOut}
                className="flex-row items-center py-3"
              >
                {isLoggingOut ? (
                  <ActivityIndicator size={22} color={palette.red[400]} />
                ) : (
                  <Ionicons
                    name="log-out-outline"
                    size={22}
                    color={palette.red[400]}
                  />
                )}
                <Text className="ms-4 text-base text-red-400">
                  {isLoggingOut ? tDrawer("logging_out") : t("logout")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>

      {/* Sync failure warning modal (FR-013) */}
      <ConfirmationModal
        visible={showSyncWarning}
        variant="warning"
        icon="cloud-offline-outline"
        title={t("sync_failed_title")}
        message={t("sync_failed_message")}
        confirmLabel={t("proceed_anyway")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          forceLogout().catch(() => {
            // The hook logs and handles failures internally.
          });
        }}
        onCancel={dismissSyncWarning}
      />
    </Modal>
  );
}

export default AppDrawer;
