import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PrivacyDetailsScreen(): React.JSX.Element {
  const { t } = useTranslation("transactions");

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["bottom"]}
    >
      <PageHeader title={t("privacy_details_title")} showBackButton />
      <ScrollView
        contentContainerClassName="px-5 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <PrivacySection
          icon="phone-portrait-outline"
          title={t("privacy_sms_drafts_title")}
          body={t("privacy_sms_drafts_body")}
          rows={[
            t("privacy_sms_drafts_local"),
            t("privacy_sms_drafts_retention"),
            t("privacy_sms_drafts_removed"),
            t("privacy_sms_drafts_not_synced"),
          ]}
        />
        <PrivacySection
          icon="sparkles-outline"
          title={t("privacy_ai_title")}
          rows={[t("ai_privacy_sms_payload"), t("ai_privacy_voice_payload")]}
        />
        <PrivacySection
          icon="information-circle-outline"
          title={t("ai_privacy_why_title")}
          body={t("ai_privacy_why_body")}
        />
        <PrivacySection
          icon="shield-checkmark-outline"
          title={t("ai_privacy_do_not_title")}
          rows={[
            t("ai_privacy_no_ads"),
            t("ai_privacy_no_full_inbox"),
            t("ai_privacy_no_raw_sms_saved"),
          ]}
        />
        <PrivacySection
          icon="business-outline"
          title={t("ai_privacy_provider_title")}
          body={t("ai_privacy_provider_body")}
        />
        <Text className="mt-1 text-sm leading-5 text-text-muted dark:text-text-muted-dark">
          {t("privacy_details_footer")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface PrivacySectionProps {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly body?: string;
  readonly rows?: readonly string[];
}

function PrivacySection({
  icon,
  title,
  body,
  rows,
}: PrivacySectionProps): React.JSX.Element {
  return (
    <View className="mb-6">
      <View className="mb-3 flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-nileGreen-500/15">
          <Ionicons name={icon} size={21} color={palette.nileGreen[500]} />
        </View>
        <Text className="flex-1 text-lg font-bold text-text-primary dark:text-text-primary-dark">
          {title}
        </Text>
      </View>
      {body ? (
        <Text className="mb-3 text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
          {body}
        </Text>
      ) : null}
      {rows?.map((row) => (
        <View key={row} className="mb-2 flex-row gap-2">
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={palette.nileGreen[500]}
          />
          <Text className="flex-1 text-base leading-6 text-text-secondary dark:text-text-secondary-dark">
            {row}
          </Text>
        </View>
      ))}
    </View>
  );
}
