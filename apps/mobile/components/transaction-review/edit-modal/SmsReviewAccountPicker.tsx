import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { AccountOption } from "./AccountSelector";
import { SmsEditIcon } from "./SmsEditIcon";

interface SmsReviewAccountPickerProps {
  readonly visible: boolean;
  readonly options: readonly AccountOption[];
  readonly selectedId: string | null;
  readonly onSelect: (option: AccountOption) => void;
  readonly onStartNew: () => void;
  readonly onClose: () => void;
}

export function SmsReviewAccountPicker({
  visible,
  options,
  selectedId,
  onSelect,
  onStartNew,
  onClose,
}: SmsReviewAccountPickerProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="max-h-[70%] rounded-t-3xl bg-white dark:bg-slate-900"
            style={{ paddingBottom: bottomInset }}
          >
            <View className="flex-row items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
              <Text className="text-lg font-bold text-text-primary">
                {t("select_an_account")}
              </Text>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Ionicons name="close" size={24} color={palette.slate[400]} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="p-4"
              contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
            >
              {options.map((option) => {
                const isSelected = option.id === selectedId;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => {
                      onSelect(option);
                      onClose();
                    }}
                    className={`mb-3 flex-row items-center rounded-xl border p-4 ${
                      isSelected
                        ? "border-nileGreen-500 bg-nileGreen-50 dark:bg-nileGreen-900"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    <SmsEditIcon
                      name="business-outline"
                      color={palette.blue[500]}
                    />
                    <View className="ms-3 flex-1">
                      <Text className="text-base font-semibold text-text-primary">
                        {option.name}
                      </Text>
                      <Text className="text-xs text-text-muted">
                        {option.currency}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={palette.nileGreen[500]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => {
                  onStartNew();
                  onClose();
                }}
                className="flex-row items-center justify-center rounded-xl border border-nileGreen-500 bg-white p-4 dark:bg-slate-900"
              >
                <Ionicons name="add" size={20} color={palette.nileGreen[500]} />
                <Text className="ms-2 font-semibold text-nileGreen-500">
                  {t("new_account_default")}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
