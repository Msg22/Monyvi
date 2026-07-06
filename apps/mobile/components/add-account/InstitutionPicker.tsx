import {
  getSelectableEgyptianInstitutions,
  type SelectableEgyptianInstitutionId,
} from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";
import { useTranslation } from "react-i18next";

import { getEgyptianInstitutionAsset } from "@/constants/egyptian-institution-assets";
import { InstitutionLogoMark } from "@/components/institutions/InstitutionLogoMark";
import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

type InstitutionPickerType = "bank" | "wallet";
type SelectableEgyptianInstitution = ReturnType<
  typeof getSelectableEgyptianInstitutions
>[number];
const INSTITUTION_ROW_HEIGHT = 80;
const INSTITUTION_ROW_MARGIN_BOTTOM = 8;
const INSTITUTION_ROW_LAYOUT_HEIGHT =
  INSTITUTION_ROW_HEIGHT + INSTITUTION_ROW_MARGIN_BOTTOM;

interface InstitutionPickerProps {
  readonly type: InstitutionPickerType;
  readonly selectedInstitutionId: SelectableEgyptianInstitutionId | null;
  readonly isOtherSelected?: boolean;
  readonly onSelectInstitution: (
    institutionId: SelectableEgyptianInstitutionId
  ) => void;
  readonly onSelectOther: () => void;
}

export function getInstitutionPickerLogoTestId(
  type: InstitutionPickerType,
  institutionId: string | null
): string {
  return `institution-picker-logo-${type}-${institutionId ?? "other"}`;
}

function getInstitutionLabel(institution: {
  readonly shortName: string;
  readonly fullName: string;
  readonly nameAr?: string;
  readonly language: string;
}): string {
  const fullName =
    institution.language.startsWith("ar") && institution.nameAr
      ? institution.nameAr
      : institution.fullName;

  if (isRedundantInstitutionFullName(institution.shortName, fullName)) {
    return institution.shortName;
  }

  return `${institution.shortName} (${fullName})`;
}

function normalizeInstitutionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isRedundantInstitutionFullName(
  shortName: string,
  fullName: string
): boolean {
  const normalizedShortName = normalizeInstitutionName(shortName);
  const normalizedFullName = normalizeInstitutionName(fullName);

  if (!normalizedShortName || !normalizedFullName) {
    return false;
  }

  if (normalizedShortName === normalizedFullName) {
    return true;
  }

  if (!normalizedFullName.startsWith(`${normalizedShortName} `)) {
    return false;
  }

  const remainingWords = normalizedFullName
    .slice(normalizedShortName.length)
    .trim()
    .split(" ")
    .filter(Boolean);
  const genericInstitutionWords = new Set(["bank", "egypt", "misr", "plc"]);

  return (
    remainingWords.length > 0 &&
    remainingWords.every((word) => genericInstitutionWords.has(word))
  );
}

function getPickerTitleKey(type: InstitutionPickerType): string {
  return type === "bank"
    ? "institution_bank_label"
    : "institution_wallet_label";
}

function getPickerPlaceholderKey(type: InstitutionPickerType): string {
  return type === "bank"
    ? "institution_bank_dropdown_placeholder"
    : "institution_wallet_dropdown_placeholder";
}

function getPickerAccessibilityKey(type: InstitutionPickerType): string {
  return type === "bank"
    ? "institution_bank_dropdown_accessibility"
    : "institution_wallet_dropdown_accessibility";
}

function getPickerCloseKey(type: InstitutionPickerType): string {
  return type === "bank"
    ? "institution_bank_dropdown_close"
    : "institution_wallet_dropdown_close";
}

export function InstitutionPicker({
  type,
  selectedInstitutionId,
  isOtherSelected = false,
  onSelectInstitution,
  onSelectOther,
}: InstitutionPickerProps): JSX.Element {
  const { t, i18n } = useTranslation("accounts");
  const bottomInset = useModalBottomInset();
  const language = i18n?.language ?? "en";
  const { height: windowHeight } = useWindowDimensions();
  const [searchText, setSearchText] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const institutions = getSelectableEgyptianInstitutions(type);
  const normalizedSearch = searchText.trim().toLowerCase();
  const selectedInstitution =
    selectedInstitutionId === null
      ? null
      : (institutions.find(
          (institution) => institution.id === selectedInstitutionId
        ) ?? null);
  const otherLogo = getEgyptianInstitutionAsset(null, type).logo;
  const selectedLabel =
    selectedInstitution === null
      ? isOtherSelected
        ? t("institution_other")
        : null
      : getInstitutionLabel({
          ...selectedInstitution,
          language,
        });
  const selectedLogo =
    selectedInstitution === null
      ? isOtherSelected
        ? otherLogo
        : null
      : getEgyptianInstitutionAsset(selectedInstitution.id, type).logo;

  useEffect(() => {
    setSearchText("");
    setIsDropdownOpen(false);
  }, [type]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) =>
      setKeyboardHeight(event.endCoordinates.height)
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const filteredInstitutions = useMemo(
    () =>
      institutions.filter((institution) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          institution.shortName.toLowerCase().includes(normalizedSearch) ||
          institution.fullName.toLowerCase().includes(normalizedSearch) ||
          (institution.nameAr?.toLowerCase().includes(normalizedSearch) ??
            false)
        );
      }),
    [institutions, normalizedSearch]
  );
  const pickerTitle = t(getPickerTitleKey(type));
  const sheetMaxHeight =
    keyboardHeight > 0
      ? Math.max(windowHeight - keyboardHeight - 96, windowHeight * 0.38)
      : windowHeight * 0.72;
  const androidKeyboardOffset = Platform.OS === "android" ? keyboardHeight : 0;
  const institutionKeyExtractor = useCallback(
    (item: SelectableEgyptianInstitution): string => item.id,
    []
  );
  const getInstitutionItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: INSTITUTION_ROW_LAYOUT_HEIGHT,
      offset: INSTITUTION_ROW_LAYOUT_HEIGHT * index,
      index,
    }),
    []
  );
  const renderInstitutionItem = useCallback<
    ListRenderItem<SelectableEgyptianInstitution>
  >(
    ({ item }) => {
      const label = getInstitutionLabel({
        ...item,
        language,
      });
      const isSelected = item.id === selectedInstitutionId;
      const asset = getEgyptianInstitutionAsset(item.id, type);

      return (
        <TouchableOpacity
          onPress={() => {
            if (isSelected) {
              setIsDropdownOpen(false);
              return;
            }
            onSelectInstitution(item.id);
            setIsDropdownOpen(false);
          }}
          className={`mb-2 h-20 flex-row items-center rounded-xl border px-4 py-3 ${
            isSelected
              ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-slate-800"
              : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          }`}
          accessibilityLabel={label}
        >
          <InstitutionLogoMark
            logo={asset.logo}
            accessibilityLabel={`${label} logo`}
            testID={getInstitutionPickerLogoTestId(type, item.id)}
            size="row"
            containerClassName="me-3"
          />
          <Text
            className="flex-1 font-bold text-text-primary dark:text-text-primary-dark"
            numberOfLines={2}
          >
            {label}
          </Text>
          {isSelected ? (
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={palette.nileGreen[600]}
            />
          ) : null}
        </TouchableOpacity>
      );
    },
    [language, onSelectInstitution, selectedInstitutionId, type]
  );
  const renderOtherInstitution = useCallback(
    (): JSX.Element => (
      <TouchableOpacity
        onPress={() => {
          if (!isOtherSelected) {
            onSelectOther();
          }
          setIsDropdownOpen(false);
        }}
        className={`mt-1 h-20 flex-row items-center rounded-xl border border-dashed px-4 py-3 ${
          isOtherSelected
            ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-slate-800"
            : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
        }`}
        accessibilityLabel={t("institution_other")}
      >
        <InstitutionLogoMark
          logo={otherLogo}
          accessibilityLabel={`${t("institution_other")} logo`}
          testID={getInstitutionPickerLogoTestId(type, null)}
          size="row"
          containerClassName="me-3"
        />
        <Text className="flex-1 font-bold text-text-primary dark:text-text-primary-dark">
          {t("institution_other")}
        </Text>
        {isOtherSelected ? (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={palette.nileGreen[600]}
          />
        ) : null}
      </TouchableOpacity>
    ),
    [isOtherSelected, onSelectOther, otherLogo, t, type]
  );

  return (
    <View className="mb-3">
      <TouchableOpacity
        onPress={() => {
          setSearchText("");
          setIsDropdownOpen(true);
        }}
        testID={`institution-picker-trigger-${type}`}
        accessibilityRole="button"
        accessibilityLabel={t(getPickerAccessibilityKey(type))}
        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center">
            {selectedLogo ? (
              <InstitutionLogoMark
                logo={selectedLogo}
                accessibilityLabel={`${selectedLabel ?? ""} logo`}
                testID={getInstitutionPickerLogoTestId(
                  type,
                  selectedInstitutionId
                )}
                containerClassName="me-3"
              />
            ) : null}
            <Text
              className={`flex-1 text-base font-semibold ${
                selectedLabel
                  ? "text-text-primary dark:text-text-primary-dark"
                  : "text-slate-400 dark:text-slate-500"
              }`}
              numberOfLines={2}
            >
              {selectedLabel ?? t(getPickerPlaceholderKey(type))}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={palette.slate[500]} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={isDropdownOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsDropdownOpen(false)}>
          <View
            testID="institution-picker-overlay"
            className="flex-1 justify-end bg-black/60"
            style={{ paddingBottom: androidKeyboardOffset }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1 justify-end"
            >
              <TouchableWithoutFeedback>
                <View
                  testID="institution-picker-sheet"
                  className="rounded-t-3xl bg-white px-5 pt-5 dark:bg-slate-900"
                  style={{
                    maxHeight: sheetMaxHeight,
                    paddingBottom: Math.max(bottomInset + 24, 24),
                  }}
                >
                  <View className="relative mb-4 min-h-10 flex-row items-center justify-center">
                    <Text
                      testID="institution-picker-title"
                      className="px-12 text-center text-lg font-black text-text-primary dark:text-text-primary-dark"
                    >
                      {pickerTitle}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setIsDropdownOpen(false)}
                      accessibilityRole="button"
                      accessibilityLabel={t(getPickerCloseKey(type))}
                      className="absolute end-0 top-0 p-2"
                    >
                      <Ionicons
                        name="close"
                        size={22}
                        color={palette.slate[500]}
                      />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    placeholder={t("institution_search_placeholder")}
                    placeholderTextColor={palette.slate[400]}
                    value={searchText}
                    onChangeText={setSearchText}
                    testID={`institution-picker-search-${type}`}
                    className="mb-3 rounded-xl border border-slate-300 bg-slate-25 px-4 py-3 text-text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-text-primary-dark"
                  />

                  <FlatList
                    data={filteredInstitutions}
                    keyExtractor={institutionKeyExtractor}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    getItemLayout={getInstitutionItemLayout}
                    contentContainerStyle={{
                      paddingBottom: Math.max(bottomInset, 12),
                    }}
                    renderItem={renderInstitutionItem}
                    ListFooterComponent={renderOtherInstitution}
                  />
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
