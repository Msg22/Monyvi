import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/navigation/PageHeader";
import { palette } from "@/constants/colors";

export default function AiPrivacyDetailsScreen(): React.JSX.Element {
  const { t } = useTranslation("transactions");

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["bottom"]}
    >
      <PageHeader title={t("ai_privacy_title")} showBackButton />
      <ScrollView contentContainerClassName="px-5 pb-8">
        <PrivacySection
          title={t("ai_privacy_what_we_send_title")}
          rows={[t("ai_privacy_sms_payload"), t("ai_privacy_voice_payload")]}
        />
        <PrivacySection
          title={t("ai_privacy_why_title")}
          body={t("ai_privacy_why_body")}
        />
        <PrivacySection
          title={t("ai_privacy_do_not_title")}
          rows={[
            t("ai_privacy_no_ads"),
            t("ai_privacy_no_full_inbox"),
            t("ai_privacy_no_raw_sms_saved"),
          ]}
        />
        <PrivacySection
          title={t("ai_privacy_provider_title")}
          body={t("ai_privacy_provider_body")}
        />
        <Text className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
          {t("ai_privacy_footer")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrivacySection({
  title,
  body,
  rows,
}: {
  readonly title: string;
  readonly body?: string;
  readonly rows?: readonly string[];
}): React.JSX.Element {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-25">
        {title}
      </Text>
      {body ? (
        <Text className="text-base leading-6 text-slate-600 dark:text-slate-300">
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
          <Text className="flex-1 text-base leading-6 text-slate-600 dark:text-slate-300">
            {row}
          </Text>
        </View>
      ))}
    </View>
  );
}
