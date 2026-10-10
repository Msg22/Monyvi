import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DropdownItem<T> {
  value: T;
  label: string;
  icon?: string;
  iconType?: "emoji" | "ionicons";
  description?: string;
}

interface DropdownBaseProps<T> {
  variant?: "default" | "outlined";
  label: string;
  required?: boolean;
  accessibilityHint?: string;
  items: ReadonlyArray<DropdownItem<T>>;
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  error?: string;
  selectedAdornment?: ReactNode;
  triggerClassName?: string;
  labelClassName?: string;
  labelStyle?: StyleProp<TextStyle>;
  selectedTextClassName?: string;
  selectedTextStyle?: StyleProp<TextStyle>;
}

interface DropdownInlineProps<T> extends DropdownBaseProps<T> {
  /** When false or omitted, renders as an inline expandable dropdown */
  useModal?: false;
  isOpen: boolean;
  onToggle: () => void;
}

interface DropdownModalProps<T> extends DropdownBaseProps<T> {
  /** When true, renders items in a bottom-sheet modal */
  useModal: true;
  isOpen: boolean;
  onToggle: () => void;
}

type DropdownProps<T> = DropdownInlineProps<T> | DropdownModalProps<T>;

// ---------------------------------------------------------------------------
// Shared Sub-components
// ---------------------------------------------------------------------------

interface DropdownItemRowProps<T> {
  item: DropdownItem<T>;
  isSelected: boolean;
  isLast: boolean;
  isDark: boolean;
  onPress: () => void;
  testID?: string;
}

function DropdownItemRow<T extends string | number>({
  item,
  isSelected,
  isLast,
  isDark,
  onPress,
  testID,
}: DropdownItemRowProps<T>): React.JSX.Element {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.6}
      className={`relative flex-row items-center p-4 ${
        !isLast ? "border-b border-slate-50 dark:border-slate-700/50" : ""
      }`}
    >
      {isSelected ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 bg-nileGreen-50/50 dark:bg-nileGreen-900/10"
        />
      ) : null}
      {item.icon && (
        <View className="me-3 w-8 items-center">
          {item.iconType === "ionicons" ? (
            <Ionicons
              name={item.icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color={
                isSelected
                  ? palette.nileGreen[600]
                  : isDark
                    ? palette.slate[400]
                    : palette.slate[500]
              }
            />
          ) : (
            <Text className="text-xl">{item.icon}</Text>
          )}
        </View>
      )}
      <View className="flex-1">
        <Text
          className={`text-base ${
            isSelected
              ? "font-bold text-nileGreen-700 dark:text-nileGreen-400"
              : "text-slate-700 dark:text-slate-300"
          }`}
        >
          {item.label}
        </Text>
        {item.description && (
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {item.description}
          </Text>
        )}
      </View>
      {isSelected && (
        <Ionicons
          name="checkmark-circle"
          size={20}
          style={{ color: palette.nileGreen[600] }}
        />
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Modal Variant
// ---------------------------------------------------------------------------

interface DropdownModalViewProps<T> {
  label: string;
  items: ReadonlyArray<DropdownItem<T>>;
  value: T | null;
  isOpen: boolean;
  isDark: boolean;
  onChange: (value: T) => void;
  onToggle: () => void;
  testID?: string;
}

function DropdownModalView<T extends string | number>({
  label,
  items,
  value,
  isOpen,
  isDark,
  onChange,
  onToggle,
  testID,
}: DropdownModalViewProps<T>): React.JSX.Element {
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onToggle}
    >
      <TouchableWithoutFeedback onPress={onToggle}>
        <View className="flex-1 bg-black/60 justify-end">
          <View className="rounded-t-3xl overflow-hidden max-h-[70%] bg-white dark:bg-slate-900">
            <BlurView
              intensity={40}
              tint={isDark ? "dark" : "light"}
              className="absolute inset-0"
            />
            <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

            <View style={{ paddingBottom: bottomInset }}>
              <View className="flex-row justify-between items-center px-6 py-5 border-b border-slate-200 dark:border-slate-800">
                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {label}
                </Text>
                <TouchableOpacity onPress={onToggle} className="p-1">
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? palette.slate[300] : palette.slate[500]}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                testID={testID ? `${testID}-options-scroll` : undefined}
                className="max-h-80"
                showsVerticalScrollIndicator={false}
              >
                {items.map((item, index) => (
                  <DropdownItemRow
                    key={String(item.value)}
                    item={item}
                    isSelected={item.value === value}
                    isLast={index === items.length - 1}
                    isDark={isDark}
                    testID={
                      testID
                        ? `${testID}-option-${String(item.value)}`
                        : undefined
                    }
                    onPress={() => {
                      onChange(item.value);
                      onToggle();
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * A generic, reusable dropdown component with support for icons and descriptions.
 *
 * Supports two modes:
 * - Inline (default): expands items below the trigger.
 * - Modal: shows items in a bottom-sheet modal.
 *
 * A null value represents a true missing selection. Callers that own a separate
 * selector modal may keep isOpen=false and use onToggle to open that workflow.
 */
export function Dropdown<T extends string | number>({
  label,
  required,
  items,
  value,
  onChange,
  isOpen,
  onToggle,
  className = "",
  placeholder = "Select...",
  useModal = false,
  disabled = false,
  testID,
  accessibilityHint,
  error,
  selectedAdornment,
  triggerClassName,
  labelClassName,
  labelStyle,
  selectedTextClassName,
  selectedTextStyle,
  variant = "default",
}: DropdownProps<T>): React.JSX.Element {
  const { t } = useTranslation("common");
  const { isDark } = useTheme();
  const selectedItem = items.find((item) => item.value === value);
  const resolvedLabelClassName =
    labelClassName ??
    (variant === "outlined"
      ? "mb-1 text-sm font-normal text-text-secondary dark:text-text-secondary-dark"
      : "input-label mb-2");
  const resolvedSelectedTextClassName =
    selectedTextClassName ??
    `text-base ${
      variant === "outlined" ? "font-normal" : "font-medium"
    } text-slate-900 dark:text-white`;
  const resolvedTriggerClassName =
    variant === "outlined"
      ? `${triggerClassName ?? "min-h-11"} justify-center px-3 py-2`
      : `p-4 ${triggerClassName ?? ""}`.trim();

  return (
    <View
      collapsable={false}
      className={`${variant === "outlined" ? "" : "mb-3"} ${className} ${
        disabled ? "opacity-50" : ""
      }`.trim()}
    >
      <Text className={resolvedLabelClassName} style={labelStyle}>
        {label}
        {required ? <Text className="text-red-500">{" *"}</Text> : null}
      </Text>

      <View
        testID={testID ? `${testID}-control` : undefined}
        className={
          variant === "outlined"
            ? `overflow-hidden rounded-lg border bg-slate-25 dark:bg-slate-900 ${
                error
                  ? "border-red-500"
                  : "border-slate-200 dark:border-slate-700"
              }`
            : `overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-800 ${
                error
                  ? "border-red-500"
                  : "border-slate-200 dark:border-slate-700"
              }`
        }
      >
        <TouchableOpacity
          testID={testID ? `${testID}-trigger` : undefined}
          onPress={onToggle}
          activeOpacity={0.7}
          disabled={disabled}
          accessibilityHint={
            accessibilityHint ?? (required ? t("required_field") : undefined)
          }
          className={resolvedTriggerClassName}
        >
          <View className="flex-row items-center justify-between">
            <View className="min-w-0 flex-1 flex-row items-center">
              {selectedItem && selectedAdornment ? (
                <View className="me-3">{selectedAdornment}</View>
              ) : selectedItem?.icon ? (
                <View className="me-3 w-8 items-center">
                  {selectedItem.iconType === "ionicons" ? (
                    <Ionicons
                      name={selectedItem.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={
                        isDark ? palette.nileGreen[400] : palette.nileGreen[600]
                      }
                    />
                  ) : (
                    <Text className="text-xl">{selectedItem.icon}</Text>
                  )}
                </View>
              ) : null}
              <Text
                numberOfLines={1}
                className={resolvedSelectedTextClassName}
                style={selectedTextStyle}
              >
                {selectedItem?.label || placeholder}
              </Text>
            </View>
            <Ionicons
              name={!useModal && isOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={isDark ? palette.slate[400] : palette.slate[500]}
            />
          </View>
        </TouchableOpacity>

        {!useModal && isOpen && (
          <View className="border-t border-slate-100 dark:border-slate-700 max-h-60">
            {items.map((item, index) => (
              <DropdownItemRow
                key={String(item.value)}
                item={item}
                isSelected={item.value === value}
                isLast={index === items.length - 1}
                isDark={isDark}
                testID={
                  testID
                    ? `${testID}-option-${String(item.value)}`
                    : undefined
                }
                onPress={() => {
                  onChange(item.value);
                  onToggle();
                }}
              />
            ))}
          </View>
        )}
      </View>

      {error ? (
        <Text
          testID={testID ? `${testID}-error` : undefined}
          accessibilityRole="alert"
          accessibilityLabel={error}
          className="input-error"
        >
          {error}
        </Text>
      ) : null}

      {useModal && (
        <DropdownModalView
          label={label}
          items={items}
          value={value}
          isOpen={isOpen}
          isDark={isDark}
          onChange={onChange}
          onToggle={onToggle}
          testID={testID}
        />
      )}
    </View>
  );
}
