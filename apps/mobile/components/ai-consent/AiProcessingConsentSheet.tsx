import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";

export type AiProcessingConsentVariant =
  | "ai-consent"
  | "sms-permission-with-ai-consent";

interface AiProcessingConsentSheetProps {
  readonly visible: boolean;
  readonly variant: AiProcessingConsentVariant;
  readonly onContinue: () => void | Promise<void>;
  readonly onNotNow: () => void;
  readonly onPrivacyDetails: () => void;
}

export function AiProcessingConsentSheet({
  visible,
  variant,
  onContinue,
  onNotNow,
  onPrivacyDetails,
}: AiProcessingConsentSheetProps): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const isSmsVariant = variant === "sms-permission-with-ai-consent";
  const [isContinueSubmitting, setIsContinueSubmitting] =
    React.useState(false);

  React.useEffect(() => {
    if (!visible && isContinueSubmitting) {
      setIsContinueSubmitting(false);
    }
  }, [isContinueSubmitting, visible]);

  const handleContinue = React.useCallback(async (): Promise<void> => {
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
  const handleNotNow = React.useCallback((): void => {
    if (!isContinueSubmitting) onNotNow();
  }, [isContinueSubmitting, onNotNow]);
  const handlePrivacyDetails = React.useCallback((): void => {
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
        <View className="rounded-t-[28px] bg-white px-5 pb-8 pt-5 dark:bg-slate-900">
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-slate-300 dark:bg-slate-700" />

          <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-nileGreen-500/15">
            <Ionicons
              name={isSmsVariant ? "chatbubble-ellipses" : "sparkles"}
              size={24}
              color={palette.nileGreen[500]}
            />
          </View>

          <Text className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-25">
            {t(isSmsVariant ? "ai_sms_consent_title" : "ai_consent_title")}
          </Text>
          <Text className="mb-5 text-base leading-6 text-slate-600 dark:text-slate-300">
            {t(isSmsVariant ? "ai_sms_consent_body" : "ai_consent_body")}
          </Text>

          {isSmsVariant ? (
            <View className="mb-5 gap-3">
              <ConsentRow
                icon="chatbox-outline"
                title={t("ai_sms_consent_sms_access_title")}
                body={t("ai_sms_consent_sms_access_body")}
              />
              <ConsentRow
                icon="sparkles-outline"
                title={t("ai_sms_consent_ai_processing_title")}
                body={t("ai_sms_consent_ai_processing_body")}
              />
            </View>
          ) : (
            <View className="mb-5 gap-3">
              <CompactConsentRow label={t("ai_consent_row_choose")} />
              <CompactConsentRow label={t("ai_consent_row_review")} />
              <CompactConsentRow label={t("ai_consent_row_no_ads")} />
            </View>
          )}

          <TouchableOpacity
            onPress={handlePrivacyDetails}
            disabled={isContinueSubmitting}
            className="mb-5 py-1"
          >
            <Text className="text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400">
              {t("ai_consent_privacy_details")}
            </Text>
          </TouchableOpacity>

          {isSmsVariant && (
            <Text className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {t("ai_sms_consent_settings_note")}
            </Text>
          )}

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
            className="rounded-2xl bg-slate-100 py-4 dark:bg-slate-800"
          >
            <Text className="text-center text-base font-semibold text-slate-700 dark:text-slate-200">
              {t("ai_consent_not_now")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ConsentRow({
  icon,
  title,
  body,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly body: string;
}): React.JSX.Element {
  return (
    <View className="flex-row gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
      <Ionicons name={icon} size={20} color={palette.nileGreen[500]} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-25">
          {title}
        </Text>
        <Text className="mt-0.5 text-sm leading-5 text-slate-500 dark:text-slate-400">
          {body}
        </Text>
      </View>
    </View>
  );
}

function CompactConsentRow({
  label,
}: {
  readonly label: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3">
      <Ionicons
        name="checkmark-circle"
        size={20}
        color={palette.nileGreen[500]}
      />
      <Text className="text-base text-slate-700 dark:text-slate-200">
        {label}
      </Text>
    </View>
  );
}
