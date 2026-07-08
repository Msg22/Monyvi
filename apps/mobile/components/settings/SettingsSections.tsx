import { palette } from "@/constants/colors";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatToLocalDateString } from "@/utils/dateHelpers";
import type { CurrencyType } from "@monyvi/db";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;
type SmsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";

interface SectionLabelProps {
  readonly children: string;
}

function SectionLabel({ children }: SectionLabelProps): React.JSX.Element {
  return (
    <Text className="text-[13px] font-semibold mb-3 ms-1 uppercase text-slate-500 dark:text-slate-400">
      {children}
    </Text>
  );
}

interface SettingsIconTileProps {
  readonly name: keyof typeof Ionicons.glyphMap;
  readonly className: string;
}

function SettingsIconTile({
  name,
  className,
}: SettingsIconTileProps): React.JSX.Element {
  return (
    <View
      className={`w-8 h-8 rounded-lg justify-center items-center ${className}`}
    >
      <Ionicons name={name} size={20} color={palette.slate[25]} />
    </View>
  );
}

export function LanguageSettingsSection({
  t,
  language,
  isChangingLanguage,
  isLanguageDropdownOpen,
  onToggleLanguageDropdown,
  onChangeLanguage,
}: {
  readonly t: TranslateFn;
  readonly language: string;
  readonly isChangingLanguage: boolean;
  readonly isLanguageDropdownOpen: boolean;
  readonly onToggleLanguageDropdown: () => void;
  readonly onChangeLanguage: (language: "en" | "ar") => void;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <SectionLabel>{t("language")}</SectionLabel>

      <View className="p-4 rounded-2xl bg-white dark:bg-slate-800">
        <View className="flex-row items-center gap-3">
          <SettingsIconTile
            name="language"
            className="bg-blue-600 dark:bg-blue-500"
          />
          <View className="flex-1">
            <Dropdown<string>
              label=""
              items={
                [
                  { value: "en", label: t("language_english") },
                  { value: "ar", label: t("language_arabic") },
                ] as ReadonlyArray<DropdownItem<string>>
              }
              value={language}
              onChange={(value) => {
                onChangeLanguage(value as "en" | "ar");
              }}
              disabled={isChangingLanguage}
              isOpen={isLanguageDropdownOpen}
              onToggle={onToggleLanguageDropdown}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export function AppearanceSettingsSection({
  t,
  isDark,
  onToggleTheme,
}: {
  readonly t: TranslateFn;
  readonly isDark: boolean;
  readonly onToggleTheme: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <SectionLabel>{t("appearance")}</SectionLabel>

      <View className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800">
        <View className="flex-row items-center gap-3">
          <SettingsIconTile
            name={isDark ? "moon" : "sunny"}
            className="dark:bg-indigo-500 bg-orange-400"
          />
          <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
            {t("dark_mode")}
          </Text>
        </View>
        <Switch
          value={isDark}
          onValueChange={onToggleTheme}
          trackColor={{
            false: palette.slate[400],
            true: palette.nileGreen[500],
          }}
          thumbColor={isDark ? palette.slate[25] : palette.slate[100]}
        />
      </View>
    </View>
  );
}

export function CurrencySettingsSection({
  t,
  preferredCurrency,
  currencyFlag,
  currencyName,
  chevronColor,
  onPress,
}: {
  readonly t: TranslateFn;
  readonly preferredCurrency: CurrencyType;
  readonly currencyFlag: string;
  readonly currencyName: string;
  readonly chevronColor: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <SectionLabel>{t("currency")}</SectionLabel>

      <TouchableOpacity
        onPress={onPress}
        className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800"
      >
        <View className="flex-row items-center gap-3">
          <View className="w-8 bg-nileGreen-700 dark:bg-nileGreen-600 h-8 rounded-lg justify-center items-center">
            <Text className="text-base">{currencyFlag}</Text>
          </View>
          <View>
            <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
              {t("preferred_currency")}
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              {currencyName}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-sm font-semibold text-nileGreen-600 dark:text-nileGreen-400">
            {preferredCurrency}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={chevronColor} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function SmsSyncSettingsSection({
  t,
  hasSynced,
  lastSyncTimestamp,
  smsPermissionStatus,
  chevronColor,
  onIncrementalSync,
  onFullRescanPress,
}: {
  readonly t: TranslateFn;
  readonly hasSynced: boolean;
  readonly lastSyncTimestamp: number | null;
  readonly smsPermissionStatus: SmsPermissionStatus;
  readonly chevronColor: string;
  readonly onIncrementalSync: () => void;
  readonly onFullRescanPress: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <SectionLabel>{t("sms_sync")}</SectionLabel>

      <TouchableOpacity
        testID="sms-sync-button"
        onPress={onIncrementalSync}
        className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800"
      >
        <View className="flex-row items-center gap-3">
          <SettingsIconTile
            name="chatbubble-ellipses"
            className="bg-emerald-600 dark:bg-emerald-500"
          />
          <View>
            <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
              {t("sync_new")}
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              {getSmsSyncDescription(t, {
                hasSynced,
                lastSyncTimestamp,
                smsPermissionStatus,
              })}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={chevronColor} />
      </TouchableOpacity>

      {hasSynced && (
        <TouchableOpacity
          onPress={onFullRescanPress}
          className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800"
        >
          <View className="flex-row items-center gap-3">
            <SettingsIconTile
              name="refresh"
              className="bg-orange-600 dark:bg-orange-500"
            />
            <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
              {t("full_rescan")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={chevronColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function LiveDetectionSettingsSection({
  t,
  isReady,
  liveDetectionSwitchValue,
  isLiveDetectionEnabling,
  liveDetection,
  autoConfirmSms,
  onToggleLiveDetection,
  onToggleAutoConfirm,
}: {
  readonly t: TranslateFn;
  readonly isReady: boolean;
  readonly liveDetectionSwitchValue: boolean;
  readonly isLiveDetectionEnabling: boolean;
  readonly liveDetection: boolean;
  readonly autoConfirmSms: boolean;
  readonly onToggleLiveDetection: (value: boolean) => void;
  readonly onToggleAutoConfirm: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <SectionLabel>{t("live_detection")}</SectionLabel>

      {isReady ? (
        <>
          <LiveDetectionToggleRow
            t={t}
            value={liveDetectionSwitchValue}
            disabled={isLiveDetectionEnabling}
            onValueChange={onToggleLiveDetection}
          />
          <AutoConfirmToggleRow
            t={t}
            value={autoConfirmSms}
            disabled={!liveDetection}
            liveDetection={liveDetection}
            onValueChange={onToggleAutoConfirm}
          />
        </>
      ) : (
        <LiveDetectionSkeleton />
      )}
    </View>
  );
}

export function AiProcessingSettingsSection({
  t,
  isConsented,
  isUpdating,
  onToggleConsent,
  onPrivacyDetailsPress,
}: {
  readonly t: TranslateFn;
  readonly isConsented: boolean;
  readonly isUpdating: boolean;
  readonly onToggleConsent: (value: boolean) => void;
  readonly onPrivacyDetailsPress: () => void;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <SectionLabel>{t("ai_features")}</SectionLabel>

      <View className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800">
        <View className="flex-row items-center gap-3 flex-1">
          <SettingsIconTile
            name="sparkles"
            className="bg-nileGreen-600 dark:bg-nileGreen-500"
          />
          <View className="flex-1">
            <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
              {t("ai_processing")}
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              {t("ai_processing_description")}
            </Text>
          </View>
        </View>
        <Switch
          testID="ai-processing-consent-switch"
          value={isConsented}
          onValueChange={onToggleConsent}
          disabled={isUpdating}
          trackColor={{
            false: palette.slate[400],
            true: palette.nileGreen[500],
          }}
          thumbColor={isConsented ? palette.slate[25] : palette.slate[100]}
        />
      </View>

      <TouchableOpacity
        onPress={onPrivacyDetailsPress}
        className="mt-0.5 flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800"
      >
        <View className="flex-row items-center gap-3">
          <SettingsIconTile
            name="shield-checkmark"
            className="bg-blue-600 dark:bg-blue-500"
          />
          <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
            {t("ai_privacy_details")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.slate[400]} />
      </TouchableOpacity>
    </View>
  );
}

export function ProfileNotificationsSection({
  t,
  userEmail,
  chevronColor,
}: {
  readonly t: TranslateFn;
  readonly userEmail: string | null;
  readonly chevronColor: string;
}): React.JSX.Element {
  return (
    <View className="mb-8">
      <TouchableOpacity className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800">
        <View className="flex-row items-center gap-3">
          <SettingsIconTile
            name="person"
            className="dark:bg-blue-500 bg-orange-400"
          />
          <View className="flex-1">
            <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
              {t("profile")}
            </Text>
            {userEmail !== null && (
              <Text
                className="text-xs text-slate-500 dark:text-slate-400"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {userEmail}
              </Text>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={chevronColor} />
      </TouchableOpacity>

      <TouchableOpacity className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800 mt-0.5">
        <View className="flex-row items-center gap-3">
          <SettingsIconTile
            name="notifications"
            className="dark:bg-rose-500 bg-orange-400"
          />
          <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
            {t("notifications")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={chevronColor} />
      </TouchableOpacity>
    </View>
  );
}

export function LogoutSettingsRow({
  t,
  tCommon,
  isLoggingOut,
  chevronColor,
  onPress,
}: {
  readonly t: TranslateFn;
  readonly tCommon: TranslateFn;
  readonly isLoggingOut: boolean;
  readonly chevronColor: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800"
    >
      <View className="flex-row items-center gap-3">
        <View className="w-8 dark:bg-red-700 bg-red-600 h-8 rounded-lg justify-center items-center">
          {isLoggingOut ? (
            <ActivityIndicator size={16} color={palette.slate[25]} />
          ) : (
            <Ionicons
              name="log-out-outline"
              size={20}
              color={palette.slate[25]}
            />
          )}
        </View>
        <Text className="text-base font-medium text-red-600 dark:text-red-400">
          {isLoggingOut ? tCommon("loading") : t("logout")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={chevronColor} />
    </TouchableOpacity>
  );
}

function LiveDetectionToggleRow({
  t,
  value,
  disabled,
  onValueChange,
}: {
  readonly t: TranslateFn;
  readonly value: boolean;
  readonly disabled: boolean;
  readonly onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800">
      <View className="flex-row items-center gap-3 flex-1">
        <SettingsIconTile
          name="radio"
          className="bg-violet-600 dark:bg-violet-500"
        />
        <View className="flex-1">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
            {t("live_detection")}
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {t("auto_detect_description")}
          </Text>
        </View>
      </View>
      <Switch
        testID="live-sms-detection-switch"
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: palette.slate[400],
          true: palette.nileGreen[500],
        }}
        thumbColor={value ? palette.slate[25] : palette.slate[100]}
      />
    </View>
  );
}

function AutoConfirmToggleRow({
  t,
  value,
  disabled,
  liveDetection,
  onValueChange,
}: {
  readonly t: TranslateFn;
  readonly value: boolean;
  readonly disabled: boolean;
  readonly liveDetection: boolean;
  readonly onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View
      className={`flex-row items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800 mt-0.5 ${
        !liveDetection ? "opacity-50" : ""
      }`}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <SettingsIconTile
          name="checkmark-circle"
          className="bg-indigo-600 dark:bg-indigo-500"
        />
        <View className="flex-1">
          <Text className="text-base font-medium text-slate-900 dark:text-slate-50">
            {t("auto_confirm")}
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            {t("auto_confirm_description")}
          </Text>
        </View>
      </View>
      <Switch
        testID="live-sms-auto-confirm-switch"
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: palette.slate[400],
          true: palette.nileGreen[500],
        }}
        thumbColor={value ? palette.slate[25] : palette.slate[100]}
      />
    </View>
  );
}

function LiveDetectionSkeleton(): React.JSX.Element {
  return (
    <View>
      <LiveDetectionSkeletonRow titleWidth="55%" bodyWidth="85%" />
      <View className="mt-0.5">
        <LiveDetectionSkeletonRow titleWidth="45%" bodyWidth="75%" />
      </View>
    </View>
  );
}

function LiveDetectionSkeletonRow({
  titleWidth,
  bodyWidth,
}: {
  readonly titleWidth: string;
  readonly bodyWidth: string;
}): React.JSX.Element {
  return (
    <View className="p-4 rounded-2xl bg-white dark:bg-slate-800">
      <View className="flex-row items-center gap-3">
        <Skeleton width={32} height={32} borderRadius={8} />
        <View className="flex-1">
          <Skeleton width={titleWidth} height={18} borderRadius={4} />
          <View className="mt-2">
            <Skeleton width={bodyWidth} height={12} borderRadius={4} />
          </View>
        </View>
        <Skeleton width={50} height={32} borderRadius={16} />
      </View>
    </View>
  );
}

export function getSmsSyncDescription(
  t: TranslateFn,
  {
    hasSynced,
    lastSyncTimestamp,
    smsPermissionStatus,
  }: {
    readonly hasSynced: boolean;
    readonly lastSyncTimestamp: number | null;
    readonly smsPermissionStatus: SmsPermissionStatus;
  }
): string {
  const hasValidLastSyncTimestamp =
    lastSyncTimestamp !== null && Number.isFinite(lastSyncTimestamp);

  if (hasSynced && hasValidLastSyncTimestamp) {
    return t("last_synced", {
      date: formatToLocalDateString(new Date(lastSyncTimestamp)),
    });
  }

  return smsPermissionStatus === "granted"
    ? t("scan_inbox")
    : t("grant_sms_permission");
}
