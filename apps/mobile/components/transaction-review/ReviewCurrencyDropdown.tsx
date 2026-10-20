/** Shared compact account-form currency trigger; the parent controls one modal. */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { palette } from "@/constants/colors";

export interface ReviewCurrencyDropdownProps {
  readonly testID: string;
  readonly label: string;
  readonly value: string | null;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly language: "en" | "ar";
  readonly onPress: () => void;
}

export function ReviewCurrencyDropdown(
  props: ReviewCurrencyDropdownProps
): React.JSX.Element {
  const rtl = props.language === "ar";
  return (
    <View className="gap-2">
      <Text
        className={
          "text-sm font-semibold leading-5 text-text-primary dark:text-text-primary-dark " +
          (rtl ? "text-right" : "text-left")
        }
      >
        {props.label}
        <Text className="text-red-500">{" *"}</Text>
      </Text>
      <TouchableOpacity
        testID={props.testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={[
          props.label,
          props.value ?? props.placeholder,
        ].join(", ")}
        accessibilityState={{ disabled: props.disabled }}
        disabled={props.disabled}
        onPress={props.onPress}
        className={
          "min-h-12 min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 dark:border-border-dark dark:bg-surface-dark " +
          (rtl ? "flex-row-reverse" : "flex-row")
        }
      >
        <Text
          className={
            "min-w-0 flex-1 text-base text-text-primary dark:text-text-primary-dark " +
            (rtl ? "text-right" : "text-left")
          }
        >
          {props.value ?? props.placeholder}
        </Text>
        <Ionicons
          name="chevron-down-outline"
          size={20}
          color={palette.slate[500]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
    </View>
  );
}
