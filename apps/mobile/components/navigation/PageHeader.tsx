import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useLocale } from "@/context/LocaleContext";
import { AppDrawer } from "./AppDrawer";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  variant?: "default" | "review";
  includeTopSafeAreaInset?: boolean;
  centerTitle?: boolean;
  showDrawer?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  selectionMode?: {
    count: number;
    totalCount: number;
    onClear: () => void;
    onSelectAll?: () => void;
    onDelete?: () => void;
  };
  backIcon?: "close" | "arrow";
  rightAction?: {
    icon?: keyof typeof Ionicons.glyphMap;
    label?: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    transparent?: boolean;
    testID?: string;
  };
  /** Optional secondary icon action rendered before the primary rightAction. */
  secondaryAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    color?: string;
  };
  children?: React.ReactNode;
}

const REVIEW_HEADER_VERTICAL_PADDING = 8;

function ReviewPageHeader({
  title,
  subtitle,
  showBackButton,
  onBack,
  backAccessibilityLabel,
  topInset,
}: Pick<
  PageHeaderProps,
  "title" | "subtitle" | "showBackButton" | "onBack" | "backAccessibilityLabel"
> & { readonly topInset: number }): React.ReactElement {
  const router = useRouter();
  const { isDark } = useTheme();

  return (
    <View
      testID="review-page-header"
      className="bg-background px-5 pb-2 dark:bg-background-dark"
      style={{ paddingTop: topInset + REVIEW_HEADER_VERTICAL_PADDING }}
    >
      <View className="flex-row items-center">
        {showBackButton && (
          <TouchableOpacity
            testID="header-back"
            onPress={onBack ?? router.back}
            activeOpacity={0.75}
            className="me-2 h-9 w-9 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={isDark ? palette.slate[25] : palette.slate[900]}
            />
          </TouchableOpacity>
        )}
        <View className="flex-1">
          <Text
            className="text-xl font-bold text-text-primary dark:text-text-primary-dark"
            accessibilityRole="header"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              numberOfLines={1}
              className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark"
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ActiveSelection({
  selectionMode,
  isDark,
}: {
  selectionMode: {
    count: number;
    totalCount: number;
    onClear: () => void;
    onSelectAll?: () => void;
  };
  isDark: boolean;
}): React.ReactElement {
  const isAllSelected =
    selectionMode.count === selectionMode.totalCount &&
    selectionMode.totalCount > 0;

  return (
    <>
      <TouchableOpacity onPress={selectionMode.onClear} className="me-3 p-1">
        <Ionicons
          name="close-outline"
          size={28}
          color={isDark ? palette.slate[50] : palette.slate[800]}
        />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-slate-800 dark:text-white flex-1">
        {selectionMode.count} Selected
      </Text>
      {selectionMode.onSelectAll && (
        <TouchableOpacity onPress={selectionMode.onSelectAll} className="me-4">
          <Text className="text-sm font-bold text-nileGreen-600 dark:text-nileGreen-400">
            {isAllSelected ? "Deselect All" : "Select All"}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

function BackButton({
  backIcon,
  isDark,
}: {
  backIcon: "close" | "arrow";
  isDark: boolean;
}): React.ReactElement {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.back()}
      testID="header-back"
      className="me-2 p-1"
    >
      <Ionicons
        name={backIcon === "close" ? "close-outline" : "arrow-back-outline"}
        size={28}
        color={isDark ? palette.slate[50] : palette.slate[800]}
      />
    </TouchableOpacity>
  );
}

function HamburgerButton({
  isDark,
  setIsDrawerOpen,
}: {
  isDark: boolean;
  setIsDrawerOpen: (open: boolean) => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={() => setIsDrawerOpen(true)}
      activeOpacity={0.7}
      className="me-3 p-1"
    >
      <Ionicons
        name="menu-outline"
        size={32}
        color={isDark ? "white" : palette.slate[800]}
      />
    </TouchableOpacity>
  );
}

function RightAction({
  rightAction,
  isDark,
}: {
  rightAction: NonNullable<PageHeaderProps["rightAction"]>;
  isDark: boolean;
}): React.ReactElement {
  return (
    <TouchableOpacity
      testID={
        rightAction.testID ??
        (rightAction.label ? "header-save" : "header-right-action")
      }
      onPress={rightAction.onPress}
      activeOpacity={0.7}
      disabled={rightAction.disabled || rightAction.loading}
      className={`flex-row rounded-full items-center justify-center ${
        rightAction.icon
          ? rightAction.transparent
            ? "w-10 h-10 bg-transparent"
            : "w-14 h-10 bg-white elevation-[2] dark:bg-slate-800 shadow-sm"
          : "px-4 py-2"
      } ${rightAction.disabled ? "opacity-50" : ""}`}
    >
      {rightAction.loading ? (
        <>
          <ActivityIndicator
            size="small"
            color={palette.nileGreen[500]}
            style={rightAction.label ? { marginEnd: 6 } : undefined}
          />
          {rightAction.label ? (
            <Text className="text-base font-bold text-nileGreen-600 dark:text-nileGreen-400">
              {rightAction.label}
            </Text>
          ) : null}
        </>
      ) : rightAction.icon ? (
        <Ionicons
          name={rightAction.icon}
          size={24}
          color={isDark ? palette.slate[50] : palette.slate[800]}
        />
      ) : (
        <Text className="text-base font-bold text-nileGreen-600 dark:text-nileGreen-400">
          {rightAction.label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function PageHeader({
  title,
  subtitle,
  variant = "default",
  includeTopSafeAreaInset = false,
  centerTitle = false,
  showDrawer = true,
  showBackButton = false,
  onBack,
  backAccessibilityLabel,
  selectionMode,
  backIcon = "arrow",
  rightAction,
  secondaryAction,
  children,
}: PageHeaderProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { language } = useLocale();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const shouldShowSelectionMode = selectionMode && selectionMode.count > 0;
  const shouldShowRightAction = rightAction && !shouldShowSelectionMode;
  const shouldShowDrawerButton = showDrawer && !showBackButton;

  if (variant === "review") {
    return (
      <ReviewPageHeader
        title={title}
        subtitle={subtitle}
        showBackButton={showBackButton}
        onBack={onBack}
        backAccessibilityLabel={backAccessibilityLabel}
        topInset={includeTopSafeAreaInset ? insets.top : 0}
      />
    );
  }

  return (
    <>
      <View
        className="px-5 pb-4 mt-2 bg-background dark:bg-background-dark"
        style={{
          paddingTop: insets.top + 10,
        }}
      >
        {/* Top Navigation Row */}
        <View className="flex-row items-center justify-between h-10 mb-4 z-10">
          {/* Centered Title */}
          {centerTitle && !shouldShowSelectionMode && (
            <View
              className="absolute start-0 end-0 h-full items-center justify-center"
              pointerEvents="none"
              style={{ zIndex: -1 }}
            >
              <Text
                className="text-2xl font-bold text-slate-800 dark:text-white px-12"
                numberOfLines={1}
                accessibilityRole="header"
                accessibilityLanguage={language}
              >
                {title}
              </Text>
            </View>
          )}

          <View className="flex-row items-center flex-1">
            {shouldShowSelectionMode ? (
              <ActiveSelection selectionMode={selectionMode} isDark={isDark} />
            ) : (
              <>
                {showBackButton && (
                  <BackButton backIcon={backIcon} isDark={isDark} />
                )}
                {shouldShowDrawerButton && (
                  <HamburgerButton
                    isDark={isDark}
                    setIsDrawerOpen={setIsDrawerOpen}
                  />
                )}
                {!centerTitle && (
                  <Text
                    className="text-2xl font-bold text-slate-800 dark:text-white flex-1"
                    numberOfLines={1}
                    accessibilityRole="header"
                    accessibilityLanguage={language}
                  >
                    {title}
                  </Text>
                )}
              </>
            )}
          </View>

          <View className="flex-row items-center gap-2">
            {secondaryAction && !shouldShowSelectionMode && (
              <TouchableOpacity
                testID="header-secondary"
                onPress={secondaryAction.onPress}
                activeOpacity={0.7}
                className="p-1.5"
              >
                <Ionicons
                  name={secondaryAction.icon}
                  size={22}
                  color={
                    secondaryAction.color ??
                    (isDark ? palette.slate[400] : palette.slate[500])
                  }
                />
              </TouchableOpacity>
            )}

            {shouldShowRightAction && (
              <RightAction rightAction={rightAction} isDark={isDark} />
            )}
          </View>

          {shouldShowSelectionMode && selectionMode.onDelete && (
            <TouchableOpacity
              testID="header-delete"
              onPress={selectionMode.onDelete}
              className="w-10 h-10 rounded-full items-center justify-center bg-red-50 dark:bg-red-900/20"
            >
              <Ionicons
                name="trash-outline"
                size={24}
                color={palette.red[500]}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Customizable Children Content (e.g., Total Balance Card) */}
        {children}
      </View>

      <AppDrawer
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </>
  );
}
