import { Ionicons } from "@expo/vector-icons";
import React, { type Ref } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { DisposeReasonIcon } from "@/components/metals/DisposeReasonIcon";
import type {
  DisposeCategory,
  DisposeTreatment,
} from "@/services/dispose-metal-holding-command-service";

export type DisposeChoiceButtonHandle = React.ComponentRef<
  typeof TouchableOpacity
>;

export const DISPOSE_CATEGORIES: readonly DisposeCategory[] = Object.freeze([
  "lost_or_stolen",
  "destroyed_or_damaged",
  "given_away",
  "donated",
  "other",
]);

export const DISPOSE_TREATMENTS: readonly DisposeTreatment[] = Object.freeze([
  "write_off",
  "external_transfer",
]);

export const DISPOSE_CONSEQUENCE_ORDER = Object.freeze([
  "treatment",
  "ownership",
  "sale-money-account",
  "sale-profit-loss",
  "history",
]);

export function RequiredMark({
  testID,
}: {
  readonly testID: string;
}): React.JSX.Element {
  return (
    <Text testID={testID} className="text-sm font-bold text-red-500">
      {" *"}
    </Text>
  );
}

export function RadioDot({
  isSelected,
}: {
  readonly isSelected: boolean;
}): React.JSX.Element {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
        isSelected
          ? "border-nileGreen-700 dark:border-nileGreen-400"
          : "border-slate-300 dark:border-slate-600"
      }`}
    >
      {isSelected ? (
        <View className="h-2.5 w-2.5 rounded-full bg-nileGreen-700 dark:bg-nileGreen-400" />
      ) : null}
    </View>
  );
}

export function CategoryTile(props: {
  readonly id: string;
  readonly iconTestID: string;
  readonly showsSelectedIndicator: boolean;
  readonly label: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly isStacked: boolean;
  readonly iconColor: string;
  readonly reason: DisposeCategory;
  readonly buttonRef?: Ref<DisposeChoiceButtonHandle>;
  readonly onPress: () => void;
}): React.JSX.Element {
  const className = props.isStacked
    ? "min-h-12 w-full flex-row items-center gap-3 rounded-2xl border px-4 py-3"
    : "min-h-12 w-[48%] flex-row items-center gap-3 rounded-2xl border px-4 py-3";
  return (
    <TouchableOpacity
      ref={props.buttonRef}
      testID={props.id}
      accessibilityRole="radio"
      accessibilityState={{
        selected: props.isSelected,
        disabled: props.isDisabled,
      }}
      disabled={props.isDisabled}
      onPress={props.onPress}
      className={`${className} ${
        props.isSelected
          ? "border-nileGreen-700 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-slate-800"
          : "border-slate-300 bg-slate-25 dark:border-slate-700 dark:bg-slate-900"
      }`}
      style={props.isDisabled ? { opacity: 0.55 } : undefined}
    >
      {props.isSelected && props.showsSelectedIndicator ? (
        <View testID="dispose-category-selected-indicator">
          <RadioDot isSelected />
        </View>
      ) : null}
      <DisposeReasonIcon
        testID={props.iconTestID}
        reason={props.reason}
        color={props.iconColor}
      />
      <Text
        includeFontPadding={props.isSelected ? false : undefined}
        className={
          props.isSelected
            ? "min-w-0 flex-1 text-sm leading-5 font-semibold text-nileGreen-800 dark:text-nileGreen-400"
            : "min-w-0 flex-1 text-sm font-medium text-text-primary dark:text-text-primary-dark"
        }
      >
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

export function TreatmentOption(props: {
  readonly id: string;
  readonly descriptionTestID: string;
  readonly label: string;
  readonly description: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly buttonRef?: Ref<DisposeChoiceButtonHandle>;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      ref={props.buttonRef}
      testID={props.id}
      accessibilityRole="radio"
      accessibilityState={{
        selected: props.isSelected,
        disabled: props.isDisabled,
      }}
      disabled={props.isDisabled}
      onPress={props.onPress}
      className={`min-h-12 w-full flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
        props.isSelected
          ? "border-nileGreen-700 bg-nileGreen-50 dark:border-nileGreen-400 dark:bg-slate-800"
          : "border-slate-300 bg-slate-25 dark:border-slate-700 dark:bg-slate-900"
      }`}
      style={props.isDisabled ? { opacity: 0.55 } : undefined}
    >
      <RadioDot isSelected={props.isSelected} />
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            props.isSelected
              ? "text-sm font-semibold text-nileGreen-800 dark:text-nileGreen-400"
              : "text-sm font-medium text-text-primary dark:text-text-primary-dark"
          }
        >
          {props.label}
        </Text>
        <Text
          testID={props.descriptionTestID}
          className="text-xs leading-5 text-text-secondary dark:text-text-secondary-dark"
        >
          {props.description}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function SummaryRow({
  checkColor,
  testID,
  children,
}: {
  readonly checkColor: string;
  readonly testID?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start gap-2">
      <View testID="dispose-summary-check">
        <Ionicons
          name="checkmark-circle-outline"
          size={18}
          color={checkColor}
        />
      </View>
      <Text
        {...(testID ? { testID } : {})}
        className="min-w-0 flex-1 text-sm text-text-secondary dark:text-text-secondary-dark"
      >
        {children}
      </Text>
    </View>
  );
}

export function formatDisposalDate(value: string, locale: "en" | "ar"): string {
  const date = parseDisposalDate(value);
  if (date === null) return value;
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

export function parseDisposalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function toDisposalDateOnlyString(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
