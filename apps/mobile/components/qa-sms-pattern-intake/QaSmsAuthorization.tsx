import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { palette } from "@/constants/colors";

interface QaSmsAuthorizationProps {
  readonly isAcknowledged: boolean;
  readonly canAuthorize: boolean;
  readonly onAcknowledgedChange: (value: boolean) => void;
  readonly onAuthorize: () => void;
  readonly onCancel: () => void;
  readonly bottomInset: number;
}

interface ScopeRowProps {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}

function ScopeRow({ icon, label }: ScopeRowProps): React.JSX.Element {
  return (
    <View className="flex-row items-center border-b border-slate-200 py-5 last:border-b-0 dark:border-slate-700">
      <View className="me-4 h-11 w-11 items-center justify-center rounded-lg bg-nileGreen-500/10">
        <Ionicons name={icon} size={24} color={palette.nileGreen[600]} />
      </View>
      <Text className="flex-1 text-base text-text-primary dark:text-slate-100">
        {label}
      </Text>
    </View>
  );
}

export function QaSmsAuthorization({
  isAcknowledged,
  canAuthorize,
  onAcknowledgedChange,
  onAuthorize,
  onCancel,
  bottomInset,
}: QaSmsAuthorizationProps): React.JSX.Element {
  const { t } = useTranslation("qa-sms-pattern-intake");

  return (
    <View
      testID="qa-sms-authorization"
      className="flex-1 bg-background px-5 pt-4 dark:bg-background-dark"
      style={{ paddingBottom: bottomInset }}
    >
      <View className="self-start rounded-md border border-nileGreen-600 px-3 py-1.5">
        <Text className="text-sm font-medium text-nileGreen-700 dark:text-nileGreen-400">
          {t("development_badge")}
        </Text>
      </View>

      <View className="mt-9 flex-row items-center">
        <Ionicons
          name="shield-checkmark-outline"
          size={34}
          color={palette.nileGreen[600]}
        />
        <Text className="ms-3 text-2xl font-bold text-text-primary dark:text-slate-100">
          {t("authorization_title")}
        </Text>
      </View>
      <Text className="mt-3 text-base leading-6 text-text-secondary dark:text-slate-400">
        {t("authorization_description")}
      </Text>

      <View className="mt-5">
        <ScopeRow icon="chatbox-outline" label={t("scope_selected_only")} />
        <ScopeRow icon="cash-outline" label={t("scope_currencies")} />
        <ScopeRow
          icon="document-lock-outline"
          label={t("scope_local_export")}
        />
      </View>

      <View className="mt-auto">
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAcknowledged }}
          className="min-h-12 flex-row items-center py-3"
          onPress={() => onAcknowledgedChange(!isAcknowledged)}
        >
          <View
            className={`h-7 w-7 items-center justify-center rounded border ${
              isAcknowledged
                ? "border-nileGreen-600 bg-nileGreen-600"
                : "border-slate-500 bg-transparent"
            }`}
          >
            {isAcknowledged ? (
              <Ionicons name="checkmark" size={20} color={palette.slate[25]} />
            ) : null}
          </View>
          <Text className="ms-3 flex-1 text-base text-text-primary dark:text-slate-100">
            {t("authorization_acknowledgement")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="qa-sms-authorize-action"
          disabled={!canAuthorize}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAuthorize }}
          className={`mt-5 min-h-14 items-center justify-center rounded-lg ${
            canAuthorize ? "bg-nileGreen-600" : "bg-slate-200 dark:bg-slate-800"
          }`}
          onPress={onAuthorize}
        >
          <Text
            className={`text-base font-semibold ${
              canAuthorize ? "text-white" : "text-slate-500 dark:text-slate-500"
            }`}
          >
            {t("authorize_action")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="min-h-12 items-center justify-center"
          onPress={onCancel}
        >
          <Text className="text-base font-semibold text-nileGreen-700 dark:text-nileGreen-400">
            {t("cancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export type { QaSmsAuthorizationProps };
