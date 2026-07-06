/**
 * IconPicker Component
 *
 * A modal component for selecting icons for custom user categories.
 * Features:
 * - Curated icons organized by category type
 * - Search functionality
 * - Preview with customizable color
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  ALL_ICONS,
  ICON_GROUPS,
  type IconLibrary,
  type IconOption,
} from "@/constants/category-icons";
import { palette } from "@/constants/colors";
import { CategoryIcon } from "../common/CategoryIcon";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface IconPickerProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when an icon is selected */
  onSelect: (iconName: string, iconLibrary: IconLibrary) => void;
  /** Currently selected icon name */
  selectedIcon?: string;
  /** Color to preview the icons with */
  previewColor?: string;
}

interface IconGridItemProps {
  icon: IconOption;
  isSelected: boolean;
  previewColor: string;
  onSelect: () => void;
}

function IconGridItem({
  icon,
  isSelected,
  previewColor,
  onSelect,
}: IconGridItemProps): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onSelect}
      className="m-1 items-center justify-center rounded-xl p-3"
      // eslint-disable-next-line react-native/no-inline-styles
      style={{
        backgroundColor: isSelected
          ? `${previewColor}30`
          : "rgba(100, 116, 139, 0.1)",
        borderWidth: isSelected ? 2 : 0,
        borderColor: isSelected ? previewColor : "transparent",
      }}
    >
      <CategoryIcon
        iconName={icon.name}
        iconLibrary={icon.library}
        size={24}
        color={isSelected ? previewColor : palette.slate[500]}
      />
    </TouchableOpacity>
  );
}

export function IconPicker({
  visible,
  onClose,
  onSelect,
  selectedIcon,
  previewColor = palette.nileGreen[500],
}: IconPickerProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation("common");
  const bottomInset = useModalBottomInset();

  // Filter icons based on search query
  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) return null; // Show grouped view when not searching

    const query = searchQuery.toLowerCase();
    return ALL_ICONS.filter((icon) => icon.name.toLowerCase().includes(query));
  }, [searchQuery]);

  const handleSelect = useCallback(
    (icon: IconOption) => {
      onSelect(icon.name, icon.library);
      onClose();
    },
    [onSelect, onClose]
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: IconOption }) => (
      <IconGridItem
        icon={item}
        isSelected={selectedIcon === item.name}
        previewColor={previewColor}
        onSelect={() => handleSelect(item)}
      />
    ),
    [selectedIcon, previewColor, handleSelect]
  );

  const searchKeyExtractor = useCallback(
    (item: IconOption) => `${item.library}-${item.name}`,
    []
  );

  const renderGroupedIcons = (): React.ReactElement => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
    >
      {Object.entries(ICON_GROUPS).map(([groupName, icons]) => (
        <View key={groupName} className="mb-4">
          <Text className="mb-2 px-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            {groupName}
          </Text>
          <View className="flex-row flex-wrap">
            {icons.map((icon) => (
              <IconGridItem
                key={`${icon.library}-${icon.name}`}
                icon={icon}
                isSelected={selectedIcon === icon.name}
                previewColor={previewColor}
                onSelect={() => handleSelect(icon)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const renderSearchResults = (): React.ReactElement => (
    <FlatList
      data={filteredIcons}
      numColumns={5}
      keyExtractor={searchKeyExtractor}
      // eslint-disable-next-line react-native/no-inline-styles
      contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
      renderItem={renderSearchItem}
      removeClippedSubviews
      maxToRenderPerBatch={20}
      windowSize={5}
      ListEmptyComponent={
        <View className="items-center py-8">
          <Ionicons
            name="search-outline"
            size={48}
            color={palette.slate[400]}
          />
          <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {t("no_icons_found", { query: searchQuery })}
          </Text>
        </View>
      }
    />
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white dark:bg-slate-900">
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-slate-200 px-4 pb-3 pt-4 dark:border-slate-700">
          <Text className="text-lg font-semibold text-slate-800 dark:text-white">
            {t("select_icon")}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="rounded-full p-2"
            style={{ backgroundColor: `${palette.slate[500]}20` }}
          >
            <Ionicons name="close" size={20} color={palette.slate[500]} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View className="px-4 py-3">
          <View className="flex-row items-center rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <Ionicons
              name="search-outline"
              size={20}
              color={palette.slate[400]}
            />
            <TextInput
              className="ms-2 flex-1 text-base text-slate-800 dark:text-white"
              placeholder={t("search_icons")}
              placeholderTextColor={palette.slate[400]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={palette.slate[400]}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Icon Grid */}
        <View className="flex-1 px-4">
          {filteredIcons ? renderSearchResults() : renderGroupedIcons()}
        </View>
      </View>
    </Modal>
  );
}
