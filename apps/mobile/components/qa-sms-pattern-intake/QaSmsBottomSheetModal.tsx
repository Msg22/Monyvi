import React from "react";
import {
  Modal,
  TouchableWithoutFeedback,
  View,
  type ModalProps,
} from "react-native";

interface QaSmsBottomSheetModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly bottomInset: number;
  readonly testID: string;
  readonly children: React.ReactNode;
  readonly contentClassName?: string;
  readonly animationType?: ModalProps["animationType"];
}

const MINIMUM_BOTTOM_PADDING = 12;

export function QaSmsBottomSheetModal({
  visible,
  onClose,
  bottomInset,
  testID,
  children,
  contentClassName = "",
  animationType = "slide",
}: QaSmsBottomSheetModalProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={animationType}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <TouchableWithoutFeedback onPress={onClose}>
          <View testID={`${testID}-backdrop`} className="absolute inset-0" />
        </TouchableWithoutFeedback>
        <View
          testID={testID}
          className={`rounded-t-3xl bg-white px-5 pt-3 dark:bg-slate-900 ${contentClassName}`}
          style={{
            paddingBottom: Math.max(bottomInset, MINIMUM_BOTTOM_PADDING),
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export type { QaSmsBottomSheetModalProps };
