import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";

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
          className={`rounded-t-[28px] bg-white px-5 pb-8 pt-5 dark:bg-slate-900 ${
            isSmsVariant ? "pb-7" : ""
          }`}
          style={{ marginBottom: bottomInset }}
        >
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-slate-300 dark:bg-slate-700" />

          <View
            testID={isSmsVariant ? "sms-consent-hero-icon" : undefined}
            className={`h-14 w-14 items-center justify-center rounded-2xl bg-nileGreen-500/15 ${
              isSmsVariant ? "mb-4 self-center" : "mb-5 self-center"
            }`}
          >
            <Ionicons
              name={isSmsVariant ? "chatbubble-ellipses" : "sparkles"}
              size={28}
              color={palette.nileGreen[500]}
            />
          </View>

          <Text
            testID={isSmsVariant ? "sms-consent-title" : undefined}
            className={`mb-3 font-bold text-slate-900 dark:text-slate-25 ${
              isSmsVariant
                ? "text-center text-[21px] leading-7"
                : "text-center text-[22px] leading-7"
            }`}
          >
            {t(isSmsVariant ? "ai_sms_consent_title" : "ai_consent_title")}
          </Text>
          <Text
            testID={isSmsVariant ? "sms-consent-body" : undefined}
            className={`text-slate-600 dark:text-slate-300 ${
              isSmsVariant
                ? "mb-5 px-3 text-center text-sm leading-5"
                : "mb-6 px-3 text-center text-base leading-6"
            }`}
          >
            {t(isSmsVariant ? "ai_sms_consent_body" : "ai_consent_body")}
          </Text>

          {isSmsVariant ? (
            <View className="mb-4 gap-0">
              <ConsentRow
                testID="sms-consent-row-sms-access"
                icon="chatbox-outline"
                title={t("ai_sms_consent_sms_access_title")}
                body={t("ai_sms_consent_sms_access_body")}
              />
              <ConsentRow
                testID="sms-consent-row-ai-processing"
                icon="sparkles-outline"
                title={t("ai_sms_consent_ai_processing_title")}
                body={t("ai_sms_consent_ai_processing_body")}
              />
            </View>
          ) : (
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
          )}

          {!isSmsVariant && (
            <TouchableOpacity
              onPress={handlePrivacyDetails}
              disabled={isContinueSubmitting}
              className="mb-5 items-center py-1"
            >
              <Text className="text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400">
                {t("ai_consent_privacy_details")}
              </Text>
            </TouchableOpacity>
          )}

          {isSmsVariant && (
            <View
              testID="sms-consent-settings-note"
              className="mb-4 flex-row items-center justify-center gap-2"
            >
              <Ionicons
                name="lock-closed-outline"
                size={14}
                color={palette.slate[500]}
              />
              <Text className="text-center text-sm text-slate-600 dark:text-slate-300">
                {t("ai_sms_consent_settings_note")}
              </Text>
            </View>
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
            className="py-3"
          >
            <Text
              className={
                isSmsVariant
                  ? "text-center text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400"
                  : "text-center text-base font-semibold text-nileGreen-600 dark:text-nileGreen-400"
              }
            >
              {t("ai_consent_not_now")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ConsentRow({
  testID,
  icon,
  title,
  body,
}: {
  readonly testID?: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly body: string;
}): React.JSX.Element {
  return (
    <View
      testID={testID}
      className="-mt-px flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-nileGreen-500/15">
        <Ionicons name={icon} size={24} color={palette.nileGreen[500]} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-slate-900 dark:text-slate-25">
          {title}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
          {body}
        </Text>
      </View>
    </View>
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
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-nileGreen-500/15">
        <Ionicons name={icon} size={22} color={palette.nileGreen[500]} />
      </View>
      <Text className="text-base text-slate-700 dark:text-slate-200">
        {label}
      </Text>
    </View>
  );
}
