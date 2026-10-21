import {
  Breadcrumb,
  CategoryListItem,
  CategorySearchBar,
} from "@/components/category-selector";
import { palette } from "@/constants/colors";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { useTheme } from "@/context/ThemeContext";
import { useOptionalCategoryCatalogue } from "@/context/CategoriesContext";
import { useCategoryChildren } from "@/hooks/useCategoryChildren";
import { useCategoriesWithChildren } from "@/hooks/useCategoriesWithChildren";
import {
  useCategoryNavigation,
  type NavigationDirection,
} from "@/hooks/useCategoryNavigation";
import type { Category, TransactionType } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { requestCatalogueSync } from "@/utils/category-catalogue-retry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration of slide animations in ms */
const SLIDE_ANIMATION_DURATION_MS = 250;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategorySelectorModalProps {
  /** Whether the modal is visible */
  readonly visible: boolean;
  /** L1 root categories filtered by type (expense/income) */
  readonly rootCategories: readonly Category[];
  /** Currently selected category ID */
  readonly selectedId: string | null;
  /** Transaction type for filtering subcategories */
  readonly type: TransactionType;
  /** Callback with the selected category's ID */
  readonly onSelect: (id: string) => void;
  /** Close the modal */
  readonly onClose: () => void;
  /** Optional caller-owned feedback below the fixed header, outside the list. */
  readonly inlineNotice?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Drill-down category selector modal.
 *
 * Supports 3-level hierarchy navigation with breadcrumbs, search, and
 * slide animations. Each row uses the Split Touch Target pattern:
 * - Tap row body → select category
 * - Tap chevron → drill into children
 */
export function CategorySelectorModal({
  visible,
  rootCategories,
  selectedId,
  type,
  onSelect,
  onClose,
  inlineNotice,
}: CategorySelectorModalProps): React.JSX.Element {
  const { isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const bottomInset = useModalBottomInset();
  const { t } = useTranslation("common");
  const [noticeHeight, setNoticeHeight] = React.useState(0);
  const catalogueState = useOptionalCategoryCatalogue();
  const catalogue = catalogueState?.catalogue ?? null;
  const handleCatalogueRetry = useCallback(async (): Promise<void> => {
    // A local read cannot create a missing manifest: the retry requests the
    // ordinary protected sync and then re-reads the accepted manifest.
    try {
      await requestCatalogueSync();
    } catch {
      // The sync failure is reported by the sync layer; the catalogue stays
      // unavailable and the picker keeps offering a retry.
    }
    if (catalogueState) await catalogueState.reloadCatalogue();
  }, [catalogueState]);
  useEffect(() => {
    if (!inlineNotice) setNoticeHeight(0);
  }, [inlineNotice]);

  // Navigation state machine
  const navigation = useCategoryNavigation();
  const {
    stack,
    currentLevel,
    depth,
    searchQuery,
    direction,
    drillInto,
    goBack,
    jumpToLevel,
    reset,
    setSearchQuery,
  } = navigation;

  // Approximate height reserved for header (~68px), breadcrumb (~42px), search (~48px), padding
  const HEADER_AREA_HEIGHT = depth > 0 ? 180 : 140;
  const listMaxHeight = Math.max(
    0,
    height * 0.8 - HEADER_AREA_HEIGHT - (inlineNotice ? noticeHeight : 0)
  );

  // Fetch children for the current parent (null at root → returns [])
  const parentId = currentLevel.category?.id ?? null;
  const { children, isLoading } = useCategoryChildren(parentId, type);

  // The categories to display: root at depth 0, children otherwise
  const displayCategories = depth === 0 ? rootCategories : children;

  // Filter by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return displayCategories;
    const query = searchQuery.toLowerCase().trim();
    return displayCategories.filter((cat) =>
      cat.displayName.toLowerCase().includes(query)
    );
  }, [displayCategories, searchQuery]);

  // Determine which displayed categories actually have children in the DB
  const childrenParentIds = useCategoriesWithChildren(filteredCategories);

  // Auto-skip L1 when there are fewer than MIN_ROOT_FOR_L1 root categories.
  // This avoids a single-item list (e.g., income with 1 L1 category).
  const MIN_ROOT_FOR_L1 = 2;
  const hasAutoSkippedRef = useRef(false);

  useEffect(() => {
    if (
      visible &&
      !hasAutoSkippedRef.current &&
      depth === 0 &&
      rootCategories.length > 0 &&
      rootCategories.length < MIN_ROOT_FOR_L1
    ) {
      hasAutoSkippedRef.current = true;
      drillInto(rootCategories[0]);
    }
  }, [visible, depth, rootCategories, drillInto]);

  // Reset the auto-skip flag when the modal closes
  useEffect(() => {
    if (!visible) {
      hasAutoSkippedRef.current = false;
    }
  }, [visible]);

  // ---[ Slide animation ]---
  const translateX = useSharedValue(0);
  const prevDirectionRef = useRef<NavigationDirection>("forward");

  useEffect(() => {
    // Skip animation on initial mount
    if (depth === 0 && prevDirectionRef.current === "forward") return;

    const slideFrom = direction === "forward" ? width : -width;
    translateX.value = slideFrom;
    translateX.value = withTiming(0, {
      duration: SLIDE_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    prevDirectionRef.current = direction;
  }, [depth, direction, width, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // ---[ Handlers ]---

  const handleSelect = useCallback(
    (categoryId: string) => {
      onSelect(categoryId);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleDrillIn = useCallback(
    (category: Category) => {
      drillInto(category);
    },
    [drillInto]
  );

  const handleClose = useCallback(() => {
    onClose();
    // Reset navigation after a small delay to avoid visual glitch
    setTimeout(reset, 300);
  }, [onClose, reset]);

  const searchPlaceholder =
    depth === 0
      ? t("search_categories")
      : t("search_category_level", { label: currentLevel.label });

  // ---[ FlatList helpers ]---

  const keyExtractor = useCallback((item: Category) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Category }) => {
      const hasChildren = childrenParentIds.has(item.id);
      const isSelected = item.id === selectedId;

      return (
        <CategoryListItem
          category={item}
          hasChildren={hasChildren}
          isSelected={isSelected}
          onSelect={() => handleSelect(item.id)}
          onDrillIn={() => handleDrillIn(item)}
        />
      );
    },
    [childrenParentIds, selectedId, handleSelect, handleDrillIn]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View className="flex-1 bg-black/60 justify-end">
          <TouchableWithoutFeedback>
            <View
              testID="category-selector-sheet"
              className="rounded-t-3xl overflow-hidden bg-white dark:bg-slate-900"
              style={{ marginBottom: bottomInset }}
            >
              {/* Header */}
              <View className="flex-row justify-between items-center px-6 py-5 border-b border-slate-200 dark:border-slate-800">
                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {t("select_category_modal")}
                </Text>
                <TouchableOpacity onPress={handleClose} className="p-1">
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? palette.slate[300] : palette.slate[500]}
                  />
                </TouchableOpacity>
              </View>

              {inlineNotice ? (
                <View
                  testID="category-selector-inline-notice-region"
                  onLayout={(event) => {
                    const measured = Math.max(
                      0,
                      event.nativeEvent.layout.height
                    );
                    setNoticeHeight((previous) =>
                      previous === measured ? previous : measured
                    );
                  }}
                >
                  {inlineNotice}
                </View>
              ) : null}

              {/* Breadcrumb (only when drilled in) */}
              {depth > 0 && (
                <Breadcrumb
                  stack={stack}
                  onJumpToLevel={jumpToLevel}
                  onGoBack={goBack}
                />
              )}

              {/* Search bar */}
              <CategorySearchBar
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {/* Category list with slide animation */}
              <Animated.View
                testID="category-selector-list-viewport"
                style={[animatedStyle, { maxHeight: listMaxHeight }]}
              >
                {catalogue?.status === "loading" ? (
                  <View className="items-center justify-center py-12">
                    <Text className="text-sm text-slate-400 dark:text-slate-500">
                      {t("loading")}
                    </Text>
                  </View>
                ) : catalogue?.status === "unavailable" ? (
                  <View className="items-center justify-center py-12 px-6">
                    <Text className="text-sm text-center text-slate-500 dark:text-slate-400">
                      {t("categories_unavailable")}
                    </Text>
                    <TouchableOpacity
                      testID="category-catalogue-retry"
                      onPress={handleCatalogueRetry}
                      activeOpacity={0.7}
                      className="mt-3 rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2"
                    >
                      <Text className="text-sm font-medium text-nileGreen-600 dark:text-nileGreen-400">
                        {t("retry")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : isLoading && depth > 0 ? (
                  <View className="items-center justify-center py-12">
                    <ActivityIndicator
                      size="small"
                      color={palette.nileGreen[500]}
                    />
                  </View>
                ) : filteredCategories.length === 0 ? (
                  <View className="items-center justify-center py-12">
                    <Text className="text-sm text-slate-400 dark:text-slate-500">
                      {searchQuery.trim()
                        ? t("no_categories_match_search")
                        : t("no_categories_found")}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    testID="category-selector-list"
                    data={filteredCategories}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    contentContainerStyle={{
                      paddingBottom: bottomInset + 40,
                      paddingHorizontal: 16,
                      paddingTop: 4,
                    }}
                    showsVerticalScrollIndicator={false}
                    {...ANDROID_SAFE_LIST_PROPS}
                    maxToRenderPerBatch={15}
                    windowSize={5}
                  />
                )}
              </Animated.View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
