import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from "react-native";
import { palette } from "@/constants/colors";
import { useTranslation } from "react-i18next";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface RecurringEditModalProps {
  visible: boolean;
  onEditThis: () => void;
  onEditTemplate: () => void;
  onCancel: () => void;
}

export function RecurringEditModal({
  visible,
  onEditThis,
  onEditTemplate,
  onCancel,
}: RecurringEditModalProps): React.JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View
          className="flex-1 bg-black/60 justify-center items-center px-4"
          style={{ paddingBottom: bottomInset }}
        >
          <TouchableWithoutFeedback>
            <View className="w-full bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-xl">
              <BlurView
                intensity={40}
                tint={isDark ? "dark" : "light"}
                className="absolute inset-0"
              />
              <View className="absolute inset-0 bg-white/95 dark:bg-slate-900/95" />

              <View className="p-6 items-center">
                <View className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 items-center justify-center mb-4">
                  <Ionicons
                    name="repeat"
                    size={24}
                    color={isDark ? palette.gold[400] : palette.gold[600]}
                  />
                </View>

                <Text className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center mb-2">
                  {t("recurring_transaction_title")}
                </Text>

                <Text className="text-base text-slate-600 dark:text-slate-400 text-center mb-6">
                  {t("recurring_edit_subtitle")}
                </Text>

                <TouchableOpacity
                  className="w-full bg-nileGreen-600 py-3.5 rounded-xl items-center mb-3"
                  onPress={onEditThis}
                >
                  <Text className="text-white font-bold text-base">
                    {t("edit_this_instance")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="w-full bg-slate-200 dark:bg-slate-800 py-3.5 rounded-xl items-center mb-3"
                  onPress={onEditTemplate}
                >
                  <Text className="text-slate-800 dark:text-slate-200 font-bold text-base">
                    {t("edit_all_future")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="w-full py-2 items-center"
                  onPress={onCancel}
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-base">
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
