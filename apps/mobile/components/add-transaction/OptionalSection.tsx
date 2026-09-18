import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState, useMemo } from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
// Will use DatePicker modal later, simplified for now
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { formatToLocalDateString } from "@/utils/dateHelpers";
import type { RecurringFrequency } from "@monyvi/db";
import { TextField } from "../ui/TextField";
import { useTranslation } from "react-i18next";

const FREQUENCY_VALUES: readonly RecurringFrequency[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
];

export interface OptionalFields {
  counterparty?: string;
  note?: string;
  date: Date;
  isRecurring: boolean;
  recurringName?: string;
  recurringFrequency?: RecurringFrequency;
  recurringAutoCreate?: boolean;
}

interface OptionalSectionProps {
  fields: OptionalFields;
  onChange: (fields: Partial<OptionalFields>) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  transactionType: "EXPENSE" | "INCOME" | "TRANSFER";
  hideRecurring?: boolean;
  readonly recurringNameError?: string;
  readonly recurringNameRef?: React.RefObject<View | null>;
}

export function OptionalSection({
  fields,
  onChange,
  expanded,
  onToggleExpand,
  transactionType,
  hideRecurring = false,
  recurringNameError,
  recurringNameRef,
}: OptionalSectionProps): React.JSX.Element {
  const { isDark } = useTheme();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { t } = useTranslation("transactions");

  const frequencyOptions = useMemo(
    () =>
      FREQUENCY_VALUES.map((value) => ({
        value,
        label: t(`freq_${value.toLowerCase()}`),
      })),
    [t]
  );

  const counterpartyLabel =
    transactionType === "INCOME" ? t("payer") : t("merchant_payee");

  const counterpartyPlaceholder =
    transactionType === "INCOME"
      ? t("payer_placeholder")
      : t("merchant_placeholder");

  if (!expanded) {
    return (
      <TouchableOpacity
        onPress={onToggleExpand}
        className="flex-row items-center justify-center py-4"
      >
        <Ionicons
          name="create-outline"
          size={18}
          color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
        />
        <Text className="ms-2 text-sm font-bold text-nileGreen-600 dark:text-nileGreen-400">
          {t("add_more_details")}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color={isDark ? palette.nileGreen[400] : palette.nileGreen[600]}
          className="ms-1"
        />
      </TouchableOpacity>
    );
  }

  return (
    <View className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4 pb-8">
      <TouchableOpacity
        onPress={onToggleExpand}
        className="flex-row items-center justify-center mb-6"
      >
        <Text className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          {t("hide_details")}
        </Text>
        <Ionicons
          name="chevron-up"
          size={14}
          color={isDark ? palette.slate[500] : palette.slate[400]}
          className="ms-1"
        />
      </TouchableOpacity>

      <View className="gap-5">
        {/* Counterparty (Merchant/Payee or Payer) */}
        <TextField
          label={counterpartyLabel}
          placeholder={counterpartyPlaceholder}
          value={fields.counterparty}
          onChangeText={(t) => onChange({ counterparty: t })}
        />

        {/* Note */}
        <TextField
          label={t("note")}
          placeholder={t("note_placeholder")}
          value={fields.note}
          onChangeText={(t) => onChange({ note: t })}
          multiline
          numberOfLines={2}
          style={{ textAlignVertical: "top" }}
        />

        {/* Date */}
        <View>
          <Text className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 px-1 uppercase tracking-wider">
            {t("date_label")}
          </Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className="flex-row items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700"
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={isDark ? palette.slate[400] : palette.slate[500]}
              className="me-2"
            />
            <Text className="text-base font-medium text-slate-900 dark:text-white">
              {formatToLocalDateString(fields.date)}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={fields.date}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  onChange({ date: selectedDate });
                }
              }}
            />
          )}
        </View>

        {/* Recurring Toggle */}
        {!hideRecurring && (
          <>
            <View className="flex-row items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 items-center justify-center me-3">
                  <Ionicons
                    name="repeat"
                    size={16}
                    color={palette.orange[500]}
                  />
                </View>
                <View>
                  <Text className="text-base font-semibold text-slate-900 dark:text-white">
                    {t("recurring_payment")}
                  </Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {fields.isRecurring ? t("enabled") : t("disabled")}
                  </Text>
                </View>
              </View>
              <Switch
                value={fields.isRecurring}
                onValueChange={(v) => onChange({ isRecurring: v })}
                trackColor={{
                  false: palette.slate[200],
                  true: palette.nileGreen[500],
                }}
                thumbColor={palette.slate[25]}
              />
            </View>

            {/* Recurring Details (Only if enabled) */}
            {fields.isRecurring && (
              <View className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 gap-4">
                {/* Recurring logic will be implemented here later or simply show basic name/frequency for now as placeholders */}
                <View ref={recurringNameRef} collapsable={false}>
                  <TextField
                    label={`${t("recurring_name_label")} *`}
                    placeholder={t("recurring_name_placeholder")}
                    value={fields.recurringName}
                    onChangeText={(t) => onChange({ recurringName: t })}
                    error={recurringNameError}
                  />
                </View>

                {/* Frequency Picker */}
                <View>
                  <Text className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 px-1 uppercase tracking-wider">
                    {t("frequency_label")}
                  </Text>
                  <View className="flex-row flex-wrap gap-1">
                    {frequencyOptions.map((option) => {
                      const isSelected =
                        fields.recurringFrequency === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          onPress={() =>
                            onChange({ recurringFrequency: option.value })
                          }
                          className={`px-4 py-2.5 rounded-xl border ${
                            isSelected
                              ? "bg-nileGreen-50 dark:bg-nileGreen-900/20 border-nileGreen-500 dark:border-nileGreen-600"
                              : "bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-600"
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              isSelected
                                ? "text-nileGreen-700 dark:text-nileGreen-400"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View>
                  {/* Auto-create Toggle */}
                  <View className="flex-row items-center ms-1 justify-between mt-2">
                    <View className="flex-1 me-4">
                      <Text className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("auto_create_transaction")}
                      </Text>
                      <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {fields.recurringAutoCreate
                          ? t("auto_create_on_description")
                          : t("auto_create_off_description")}
                      </Text>
                    </View>
                    <Switch
                      value={fields.recurringAutoCreate}
                      onValueChange={(v) =>
                        onChange({ recurringAutoCreate: v })
                      }
                      trackColor={{
                        false: palette.slate[200],
                        true: palette.blue[500],
                      }}
                      thumbColor={palette.slate[25]}
                    />
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}
