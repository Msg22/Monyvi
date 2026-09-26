import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { palette } from "@/constants/colors";

import type {
  MetalHoldingFormCopy,
  MetalHoldingFormProps,
  MetalHoldingFormValues,
} from "./MetalHoldingForm";
import { MetalHoldingRender } from "./MetalHoldingRender";

export function MetalSelector({
  copy,
  value,
  onChange,
  isLocked,
  isDisabled,
}: {
  readonly copy: MetalHoldingFormCopy;
  readonly value: "GOLD" | "SILVER";
  readonly onChange: MetalHoldingFormProps["onChange"];
  readonly isLocked: boolean;
  readonly isDisabled: boolean;
}): React.JSX.Element {
  return (
    <View
      testID="metal-holding-metal-field"
      accessibilityState={{ disabled: isDisabled || isLocked }}
    >
      <Text className="mb-1 text-sm font-normal text-text-secondary dark:text-text-secondary-dark">
        {copy.metal}
      </Text>
      {isLocked ? (
        <>
          <View
            testID="metal-holding-metal-locked"
            className="min-h-11 flex-row items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-800"
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={palette.gold[500]}
            />
            <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
              {value === "GOLD" ? copy.gold : copy.silver}
            </Text>
          </View>
          <Text
            testID="metal-holding-metal-locked-guidance"
            className="mt-2 text-xs leading-5 text-text-muted dark:text-text-muted-dark"
          >
            {copy.lockedMetalHint ??
              "Metal can’t be changed. Delete this holding, then add the correct one."}
          </Text>
        </>
      ) : (
        <View className="flex-row gap-2">
          {(["GOLD", "SILVER"] as const).map((metal) => {
            const isSelected = value === metal;
            return (
              <TouchableOpacity
                key={metal}
                testID={`metal-holding-metal-option-${metal}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                disabled={isDisabled}
                onPress={() => onChange("metal", metal)}
                className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg border ${
                  isSelected
                    ? "border-nileGreen-700 bg-slate-25 dark:border-nileGreen-400 dark:bg-slate-900"
                    : "border-slate-300 bg-slate-25 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <View
                  className={`h-3 w-3 rounded-full ${metal === "GOLD" ? "bg-gold-400" : "bg-slate-400"}`}
                />
                <Text
                  className={
                    isSelected
                      ? "font-semibold text-nileGreen-800 dark:text-nileGreen-400"
                      : "text-text-secondary dark:text-text-secondary-dark"
                  }
                >
                  {metal === "GOLD" ? copy.gold : copy.silver}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function PhysicalFormSelector({
  copy,
  value,
  metal,
  isStacked,
  isDisabled,
  onChange,
}: {
  readonly copy: MetalHoldingFormCopy;
  readonly value: MetalHoldingFormValues["physicalForm"];
  readonly metal: "GOLD" | "SILVER";
  readonly isStacked: boolean;
  readonly isDisabled: boolean;
  readonly onChange: MetalHoldingFormProps["onChange"];
}): React.JSX.Element {
  const forms = [
    { value: "COIN" as const, label: copy.coin },
    { value: "BAR" as const, label: copy.bar },
    { value: "JEWELRY" as const, label: copy.jewelry },
  ];
  return (
    <View testID="metal-holding-physical-form-field">
      <Text className="mb-1 text-sm font-normal text-text-secondary dark:text-text-secondary-dark">
        {copy.physicalForm}
      </Text>
      <View className={isStacked ? "gap-2" : "flex-row gap-2"}>
        {forms.map((form) => {
          const isSelected = value === form.value;
          return (
            <TouchableOpacity
              key={form.value}
              testID={`metal-holding-physical-form-option-${form.value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() =>
                onChange("physicalForm", isSelected ? null : form.value)
              }
              className={`min-h-20 items-center justify-center rounded-lg border px-2 py-2 ${
                isStacked ? "w-full" : "flex-1"
              } ${
                isSelected
                  ? "border-nileGreen-700 bg-slate-25 dark:border-nileGreen-400 dark:bg-slate-900"
                  : "border-slate-300 bg-slate-25 dark:border-slate-700 dark:bg-slate-900"
              }`}
            >
              <MetalHoldingRender
                size="form"
                itemForm={
                  form.value.toLowerCase() as "coin" | "bar" | "jewelry"
                }
                metalType={metal}
              />
              <View
                testID={`metal-holding-physical-form-radio-${form.value}`}
                className={`absolute start-3 top-3 h-5 w-5 items-center justify-center rounded-full border ${
                  isSelected
                    ? "border-nileGreen-700 dark:border-nileGreen-400"
                    : "border-slate-500 dark:border-slate-400"
                }`}
              >
                {isSelected ? (
                  <View className="h-2.5 w-2.5 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400" />
                ) : null}
              </View>
              <Text
                className={`text-sm ${isSelected ? "font-semibold text-nileGreen-800 dark:text-nileGreen-400" : "text-text-secondary dark:text-text-secondary-dark"}`}
              >
                {form.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
