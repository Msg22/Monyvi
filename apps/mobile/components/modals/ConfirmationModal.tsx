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

type ConfirmationVariant = "danger" | "warning" | "success" | "info";

interface ConfirmationModalProps {
  readonly visible: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: ConfirmationVariant;
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly isConfirming?: boolean;
  readonly confirmingStatusLabel?: string;
  readonly dismissOnConfirm?: boolean;
}

const VARIANT_CONFIG: Record<
  ConfirmationVariant,
  {
    readonly iconBg: string;
    readonly darkIconBg: string;
    readonly iconColor: string;
    readonly buttonBg: string;
    readonly defaultIcon: keyof typeof Ionicons.glyphMap;
  }
> = {
  danger: {
    iconBg: "bg-red-100",
    darkIconBg: "dark:bg-red-500/20",
    iconColor: palette.red[500],
    buttonBg: "bg-red-500",
    defaultIcon: "trash-outline",
  },
  warning: {
    iconBg: "bg-gold-100",
    darkIconBg: "dark:bg-gold-800",
    iconColor: palette.gold[500],
    buttonBg: "bg-gold-600",
    defaultIcon: "warning-outline",
  },
  success: {
    iconBg: "bg-nileGreen-100",
    darkIconBg: "dark:bg-nileGreen-900",
    iconColor: palette.nileGreen[500],
    buttonBg: "bg-nileGreen-500",
    defaultIcon: "checkmark-circle-outline",
  },
  info: {
    iconBg: "bg-blue-100",
    darkIconBg: "dark:bg-blue-500/20",
    iconColor: palette.blue[500],
    buttonBg: "bg-blue-500",
    defaultIcon: "information-circle-outline",
  },
};

/**
 * Generic confirmation modal with variant support (danger, warning, info).
 * Reusable across edit, delete, convert, and discard flows.
 */
export function ConfirmationModal({
  visible,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  icon,
  isConfirming = false,
  confirmingStatusLabel = "In progress",
  dismissOnConfirm = true,
}: ConfirmationModalProps): React.JSX.Element {
  const config = VARIANT_CONFIG[variant];
  const iconName = icon ?? config.defaultIcon;
  const bottomInset = useModalBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isConfirming ? (): void => undefined : onCancel}
    >
      <TouchableWithoutFeedback
        testID="confirmation-modal-backdrop"
        onPress={isConfirming ? undefined : onCancel}
      >
        <View
          className="flex-1 bg-black/70 justify-center items-center"
          style={{ paddingBottom: bottomInset }}
        >
          <TouchableWithoutFeedback accessible={false}>
            <View
              testID="confirmation-modal-card"
              accessible={false}
              accessibilityViewIsModal
              aria-busy={isConfirming}
              className="w-[85%] max-w-[340px] rounded-2xl overflow-hidden border border-transparent dark:border-slate-700/40 bg-white dark:bg-slate-900"
            >
              <View className="p-6">
                {/* Icon */}
                <View
                  className={`w-16 h-16 rounded-full ${config.iconBg} ${config.darkIconBg} justify-center items-center self-center mb-4`}
                >
                  <Ionicons
                    name={iconName}
                    size={32}
                    color={config.iconColor}
                  />
                </View>

                {/* Title */}
                <Text
                  accessibilityRole="header"
                  className="text-[22px] font-bold text-slate-800 dark:text-slate-100 text-center mb-2"
                >
                  {title}
                </Text>

                {/* Message */}
                <Text className="text-[15px] text-slate-500 dark:text-slate-400 text-center leading-[22px] mb-6">
                  {message}
                </Text>

                {isConfirming ? (
                  <View
                    testID="confirmation-modal-status"
                    accessible
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`${confirmLabel} ${confirmingStatusLabel}`}
                    accessibilityState={{ busy: true }}
                  />
                ) : null}

                {/* Actions */}
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    testID="modal-cancel"
                    className="flex-1 py-3.5 rounded-xl items-center justify-center bg-slate-100 dark:bg-slate-800"
                    onPress={onCancel}
                    disabled={isConfirming}
                    accessibilityState={{ disabled: isConfirming }}
                    accessibilityRole="button"
                    accessibilityLabel={cancelLabel}
                  >
                    <Text className="text-base font-semibold text-slate-600 dark:text-slate-300">
                      {cancelLabel}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="modal-confirm"
                    className={`flex-1 py-3.5 rounded-xl items-center justify-center ${config.buttonBg}`}
                    onPress={() => {
                      onConfirm();
                      if (dismissOnConfirm) onCancel();
                    }}
                    disabled={isConfirming}
                    accessibilityState={{ disabled: isConfirming }}
                    accessibilityRole="button"
                    accessibilityLabel={confirmLabel}
                  >
                    <Text className="text-base font-semibold text-white">
                      {confirmLabel}
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
