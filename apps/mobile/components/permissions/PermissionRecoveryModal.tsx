import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

type PermissionRecoveryMode = "request" | "blocked";

interface PermissionRecoveryModalProps {
  readonly visible: boolean;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly onPrimaryPress: () => void;
  readonly onCancel: () => void;
  readonly title: string;
  readonly message: string;
  readonly primaryLabel: string;
  readonly cancelLabel: string;
}

export function PermissionRecoveryModal({
  visible,
  icon,
  onPrimaryPress,
  onCancel,
  title,
  message,
  primaryLabel,
  cancelLabel,
}: PermissionRecoveryModalProps): React.JSX.Element {
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View
          className="flex-1 items-center justify-center bg-black/70 px-5"
          style={{ paddingBottom: bottomInset }}
        >
          <TouchableWithoutFeedback>
            <View className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-transparent bg-white dark:border-slate-700/40 dark:bg-slate-900">
              <View className="p-6">
                <View className="mb-4 h-16 w-16 items-center justify-center self-center rounded-full bg-nileGreen-500/15">
                  <Ionicons
                    name={icon}
                    size={32}
                    color={palette.nileGreen[500]}
                  />
                </View>

                <Text className="mb-2 text-center text-[22px] font-bold text-slate-800 dark:text-slate-100">
                  {title}
                </Text>

                <Text className="mb-6 text-center text-[15px] leading-[22px] text-slate-500 dark:text-slate-400">
                  {message}
                </Text>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    testID="permission-modal-cancel"
                    className="flex-1 items-center justify-center rounded-xl bg-slate-100 py-3.5 dark:bg-slate-800"
                    onPress={onCancel}
                  >
                    <Text className="text-base font-semibold text-slate-600 dark:text-slate-300">
                      {cancelLabel}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="permission-modal-primary"
                    className="flex-1 items-center justify-center rounded-xl bg-nileGreen-500 py-3.5"
                    onPress={onPrimaryPress}
                  >
                    <Text className="text-base font-semibold text-white">
                      {primaryLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export type { PermissionRecoveryMode };
