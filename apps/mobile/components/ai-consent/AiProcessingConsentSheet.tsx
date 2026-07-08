import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

interface AiProcessingConsentSheetProps {
  readonly visible: boolean;
  readonly onContinue: () => void | Promise<void>;
  readonly onNotNow: () => void;
  readonly onPrivacyDetails: () => void;
}

export function AiProcessingConsentSheet({
  visible,
  onContinue,
  onNotNow,
  onPrivacyDetails,
}: AiProcessingConsentSheetProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();
  const [isContinueSubmitting, setIsContinueSubmitting] = useState(false);

  useEffect(() => {
    if (!visible && isContinueSubmitting) {
      setIsContinueSubmitting(false);
    }
  }, [isContinueSubmitting, visible]);

  const handleContinue = useCallback(async (): Promise<void> => {
    if (isContinueSubmitting) {
      return;
    }

    setIsContinueSubmitting(true);
    try {
      await onContinue();
    } finally {
      setIsContinueSubmitting(false);
    }
  }, [isContinueSubmitting, onContinue]);
  const handleNotNow = useCallback((): void => {
    if (!isContinueSubmitting) onNotNow();
  }, [isContinueSubmitting, onNotNow]);
  const handlePrivacyDetails = useCallback((): void => {
    if (!isContinueSubmitting) onPrivacyDetails();
  }, [isContinueSubmitting, onPrivacyDetails]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleNotNow}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View
          className="rounded-t-[28px] bg-white px-5 pb-8 pt-5 dark:bg-slate-900"
          style={{ marginBottom: bottomInset }}
        >
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-slate-300 dark:bg-slate-700" />

          <View className="mb-5 h-14 w-14 items-center justify-center self-center rounded-2xl bg-nileGreen-500/15">
            <Ionicons
              name="sparkles"
              size={28}
              color={palette.nileGreen[500]}
            />
          </View>

          <Text className="mb-3 text-center text-[22px] font-bold leading-7 text-slate-900 dark:text-slate-25">
            {t("ai_consent_title")}
          </Text>
          <Text className="mb-6 px-3 text-center text-base leading-6 text-slate-600 dark:text-slate-300">
            {t("ai_consent_body")}
          </Text>

          <View className="mb-6 gap-4 px-3">
            <CompactConsentRow
              icon="chatbox-outline"
              label={t("ai_consent_row_choose")}
            />
            <CompactConsentRow
              icon="shield-checkmark-outline"
              label={t("ai_consent_row_review")}
            />
            <CompactConsentRow
              icon="lock-closed-outline"
              label={t("ai_consent_row_no_ads")}
            />
          </View>

          <TouchableOpacity
            onPress={handlePrivacyDetails}
            disabled={isContinueSubmitting}
            className="mb-5 items-center py-1"
          >
            <Text className="text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400">
              {t("ai_consent_privacy_details")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="ai-consent-continue"
            onPress={() => {
              void handleContinue();
            }}
            disabled={isContinueSubmitting}
            className="mb-3 rounded-2xl bg-nileGreen-500 py-4"
          >
            <Text className="text-center text-base font-bold text-white">
              {t("ai_consent_continue")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="ai-consent-not-now"
            onPress={handleNotNow}
            disabled={isContinueSubmitting}
            className="py-3"
          >
            <Text className="text-center text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400">
              {t("ai_consent_not_now")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function CompactConsentRow({
  icon,
  label,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-4">
      <View className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-nileGreen-500/15">
        <Ionicons name={icon} size={22} color={palette.nileGreen[500]} />
      </View>
      <Text className="min-w-0 flex-1 text-base text-slate-700 dark:text-slate-200">
        {label}
      </Text>
    </View>
  );
}
