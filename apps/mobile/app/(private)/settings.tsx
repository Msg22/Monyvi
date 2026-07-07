import type { CurrencyType } from "@monyvi/db";
import { CURRENCY_INFO_MAP } from "@monyvi/logic";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocale } from "@/context/LocaleContext";

import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { GradientBackground } from "@/components/ui/GradientBackground";
import {
  AiProcessingSettingsSection,
  AppearanceSettingsSection,
  CurrencySettingsSection,
  LanguageSettingsSection,
  LiveDetectionSettingsSection,
  LogoutSettingsRow,
  ProfileNotificationsSection,
  SmsSyncSettingsSection,
} from "@/components/settings/SettingsSections";
import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useAiProcessingConsent } from "@/hooks/useAiProcessingConsent";
import { useLogoutFlow } from "@/hooks/useLogoutFlow";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useSettingsAiConsentToggle } from "@/hooks/useSettingsAiConsentToggle";
import { useSettingsAiConsentState } from "@/hooks/useSettingsAiConsentState";
import { useSettingsSmsSyncActions } from "@/hooks/useSettingsSmsSyncActions";
import { setIntroLocaleOverride } from "@/services/intro-flag-service";
import { setPreferredLanguage } from "@/services/profile-service";
import { useSmsPermission } from "@/hooks/useSmsPermission";
import { useSmsSync } from "@/hooks/useSmsSync";
import { useSmsScanContext } from "@/context/SmsScanContext";
import {
  reconcileLiveDetectionPreference,
  setLiveDetectionEnabled,
  isAutoConfirmEnabled,
  setAutoConfirm,
} from "@/services/sms-live-detection-handler";
import { startSmsListener, stopSmsListener } from "@/services/sms-live-listener-service";
import { SettingsConfirmationModals } from "@/components/settings/SettingsConfirmationModals";
import { PermissionRecoveryModal } from "@/components/permissions/PermissionRecoveryModal";
import {
  createPermissionRecoveryState,
  getPermissionRecoveryContent,
  type PermissionRecoveryState,
} from "@/components/settings/permission-recovery-content";
import { useToast } from "@/components/ui/Toast";
import {
  getNotificationPermissionStatus,
  openNotificationSettings,
  requestNotificationPermissionStatus,
} from "@/services/notification-service";
import { logger } from "@/utils/logger";
import type { PendingAiAction } from "@/components/settings/settings-types";

export default function SettingsScreen(): React.JSX.Element {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { preferredCurrency, setPreferredCurrency } = usePreferredCurrency();
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { language } = useLocale();
  const aiConsent = useAiProcessingConsent();
  const [isCurrencyPickerVisible, setIsCurrencyPickerVisible] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isAiConsentSheetVisible, setIsAiConsentSheetVisible] = useState(false);
  const [isAiConsentUpdating, setIsAiConsentUpdating] = useState(false);
  const [isAiDisableConfirmOpen, setIsAiDisableConfirmOpen] = useState(false);
  const {
    status: smsPermissionStatus,
    liveDetectionStatus,
    isAndroid,
    requestPermission,
    requestLiveDetectionPermission,
    openSettings,
    recheckPermission,
  } = useSmsPermission();
  const { hasSynced, lastSyncTimestamp } = useSmsSync();
  const { setScanMode } = useSmsScanContext();
  const [isFullRescanModalOpen, setIsFullRescanModalOpen] = useState(false);
  const { showToast } = useToast();
  const {
    isLoggingOut,
    showSyncWarning,
    showForceLogoutError,
    requestLogout,
    forceLogout,
    dismissSyncWarning,
    dismissForceLogoutError,
  } = useLogoutFlow({
    onSuccess: () => router.replace("/auth"),
    onNoNetwork: () => {
      showToast({
        type: "error",
        title: t("no_network_logout"),
      });
    },
    onUnknownError: () => {
      showToast({
        type: "error",
        title: t("logout_error"),
      });
    },
  });

  // Live detection preferences
  const [liveDetection, setLiveDetection] = useState(false);
  const [isLiveDetectionPreferenceReady, setIsLiveDetectionPreferenceReady] =
    useState(!isAndroid);
  const [isLiveDetectionEnabling, setIsLiveDetectionEnabling] = useState(false);
  const [autoConfirmSms, setAutoConfirmSms] = useState(false);
  const [permissionRecovery, setPermissionRecovery] =
    useState<PermissionRecoveryState | null>(null);
  const [hasPendingLiveDetectionEnable, setHasPendingLiveDetectionEnable] =
    useState(false);
  const [
    hasReturnedFromLiveDetectionSettings,
    setHasReturnedFromLiveDetectionSettings,
  ] = useState(false);
  const [hasPendingNotificationEnable, setHasPendingNotificationEnable] =
    useState(false);
  const [pendingSmsScanMode, setPendingSmsScanMode] = useState<
    "incremental" | "full" | null
  >(null);
  const [pendingAiConsentAction, setPendingAiConsentAction] =
    useState<PendingAiAction | null>(null);
  const shouldResumeAiConsentAfterPrivacyDetails = useRef(false);
  const { isAiConsentEnabled, markAiConsentGranted, revokeConsent } =
    useSettingsAiConsentState({
      isPersistedConsented: aiConsent.isConsented,
      revokePersistedConsent: aiConsent.revokeConsent,
    });
  const liveDetectionSwitchValue = liveDetection || isLiveDetectionEnabling;
  const previousNotificationAppState = useRef<AppStateStatus>(
    AppState.currentState
  );
  const previousSmsSettingsAppState = useRef<AppStateStatus>(
    AppState.currentState
  );
  const previousSettingsAppState = useRef<AppStateStatus>(
    AppState.currentState
  );
  const hasActiveLiveDetectionEnableFlowRef = useRef(false);
  const liveDetectionPreferenceGenerationRef = useRef(0);
  const cancelLiveDetectionEnableFlow = useCallback((): void => {
    hasActiveLiveDetectionEnableFlowRef.current = false;
    setIsLiveDetectionEnabling(false);
    setHasPendingLiveDetectionEnable(false);
    setHasReturnedFromLiveDetectionSettings(false);
    setHasPendingNotificationEnable(false);
    setPendingAiConsentAction(null);
    setPermissionRecovery(null);
  }, []);

  const reconcileStoredLiveDetection = useCallback(async (): Promise<void> => {
    if (!isAndroid) {
      setIsLiveDetectionPreferenceReady(true);
      return;
    }

    if (!isAiConsentEnabled) {
      liveDetectionPreferenceGenerationRef.current += 1;
      try {
        await setLiveDetectionEnabled(false);
        await setAutoConfirm(false);
      } finally {
        setLiveDetection(false);
        stopSmsListener();
        setAutoConfirmSms(false);
        setIsLiveDetectionPreferenceReady(true);
      }
      return;
    }

    const reconcileGeneration = liveDetectionPreferenceGenerationRef.current;
    const hasStaleReconcile = (): boolean =>
      hasActiveLiveDetectionEnableFlowRef.current ||
      reconcileGeneration !== liveDetectionPreferenceGenerationRef.current;

    if (hasActiveLiveDetectionEnableFlowRef.current) {
      return;
    }

    try {
      const enabled = await reconcileLiveDetectionPreference();

      if (hasStaleReconcile()) {
        return;
      }

      setLiveDetection(enabled);

      if (!enabled) {
        stopSmsListener();
        setAutoConfirmSms(false);
        return;
      }

      const autoConfirmEnabled = await isAutoConfirmEnabled();

      if (hasStaleReconcile()) {
        return;
      }

      setAutoConfirmSms(autoConfirmEnabled);
    } finally {
      if (!hasStaleReconcile()) {
        setIsLiveDetectionPreferenceReady(true);
      }
    }
  }, [isAiConsentEnabled, isAndroid]);

  useEffect(() => {
    if (!isAndroid || aiConsent.isLoading) return;
    reconcileStoredLiveDetection().catch((error: unknown) => {
      logger.error("settings.reconcileLiveDetection.failed", error);
    });
  }, [aiConsent.isLoading, isAndroid, reconcileStoredLiveDetection]);

  useEffect(() => {
    if (!isAndroid) {
      return;
    }

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          previousSettingsAppState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          reconcileStoredLiveDetection().catch((error: unknown) => {
            logger.error("settings.reconcileLiveDetection.failed", error);
          });
        }

        previousSettingsAppState.current = nextState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [isAndroid, reconcileStoredLiveDetection]);

  const persistLiveDetectionEnabled = useCallback(async (): Promise<void> => {
    if (!hasActiveLiveDetectionEnableFlowRef.current) return;
    try {
      await setLiveDetectionEnabled(true);
      if (!hasActiveLiveDetectionEnableFlowRef.current) {
        await setLiveDetectionEnabled(false);
        return;
      }
      setIsLiveDetectionPreferenceReady(true);
      setLiveDetection(true);
      startSmsListener();
      hasActiveLiveDetectionEnableFlowRef.current = false;
    } catch (error: unknown) {
      setLiveDetection(false);
      hasActiveLiveDetectionEnableFlowRef.current = false;
      throw error;
    }
  }, []);

  const enableLiveDetectionWithGrantedSms =
    useCallback(async (): Promise<void> => {
      hasActiveLiveDetectionEnableFlowRef.current = true;
      setIsLiveDetectionEnabling(true);
      try {
        const notificationStatus = await getNotificationPermissionStatus();
        if (!hasActiveLiveDetectionEnableFlowRef.current) return;

        if (notificationStatus !== "granted") {
          setPermissionRecovery(
            createPermissionRecoveryState("notification", notificationStatus)
          );
          return;
        }

        await persistLiveDetectionEnabled();
      } catch {
        hasActiveLiveDetectionEnableFlowRef.current = false;
        showToast({
          type: "error",
          title: tCommon("error"),
        });
      } finally {
        setIsLiveDetectionEnabling(false);
      }
    }, [persistLiveDetectionEnabled, showToast, tCommon]);

  useEffect(() => {
    if (!hasPendingLiveDetectionEnable) return;

    if (liveDetectionStatus !== "granted") {
      if (!hasReturnedFromLiveDetectionSettings) return;

      setHasPendingLiveDetectionEnable(false);
      setHasReturnedFromLiveDetectionSettings(false);
      setPermissionRecovery(
        createPermissionRecoveryState("sms-live", liveDetectionStatus)
      );
      return;
    }

    setHasPendingLiveDetectionEnable(false);
    setHasReturnedFromLiveDetectionSettings(false);
    setPermissionRecovery(null);
    enableLiveDetectionWithGrantedSms().catch(() => {
      showToast({
        type: "error",
        title: tCommon("error"),
      });
    });
  }, [
    enableLiveDetectionWithGrantedSms,
    hasReturnedFromLiveDetectionSettings,
    hasPendingLiveDetectionEnable,
    showToast,
    liveDetectionStatus,
    tCommon,
  ]);

  useEffect(() => {
    if (pendingSmsScanMode === null) return;
    if (smsPermissionStatus !== "granted") return;

    setPendingSmsScanMode(null);
    setPermissionRecovery(null);
    setScanMode(pendingSmsScanMode);
    router.push("/sms-scan");
  }, [pendingSmsScanMode, setScanMode, smsPermissionStatus]);

  const continueLiveDetectionEnableWithConsent =
    useCallback(async (): Promise<void> => {
      hasActiveLiveDetectionEnableFlowRef.current = true;

      if (liveDetectionStatus !== "granted") {
        setPermissionRecovery(
          createPermissionRecoveryState("sms-live", liveDetectionStatus)
        );
        setHasReturnedFromLiveDetectionSettings(false);
        return;
      }

      await enableLiveDetectionWithGrantedSms();
    }, [enableLiveDetectionWithGrantedSms, liveDetectionStatus]);

  const handleToggleLiveDetection = useCallback(
    async (value: boolean): Promise<void> => {
      liveDetectionPreferenceGenerationRef.current += 1;

      if (!value) {
        cancelLiveDetectionEnableFlow();
        setLiveDetection(false);
        await setLiveDetectionEnabled(false);
        stopSmsListener();
        setAutoConfirmSms(false);
        await setAutoConfirm(false);
        return;
      }

      if (!isAiConsentEnabled) {
        setPendingAiConsentAction({ kind: "live" });
        setIsAiConsentSheetVisible(true);
        return;
      }

      await continueLiveDetectionEnableWithConsent();
    },
    [
      cancelLiveDetectionEnableFlow,
      continueLiveDetectionEnableWithConsent,
      isAiConsentEnabled,
    ]
  );

  const handlePermissionModalCancel = useCallback((): void => {
    hasActiveLiveDetectionEnableFlowRef.current = false;
    setIsLiveDetectionEnabling(false);
    setHasPendingLiveDetectionEnable(false);
    setHasReturnedFromLiveDetectionSettings(false);
    setHasPendingNotificationEnable(false);
    setPendingSmsScanMode(null);
    setPendingAiConsentAction(null);
    setPermissionRecovery(null);
  }, []);

  const handlePermissionModalPrimaryPress =
    useCallback(async (): Promise<void> => {
      if (!permissionRecovery) {
        return;
      }

      if (permissionRecovery.kind === "notification") {
        if (permissionRecovery.mode === "blocked") {
          hasActiveLiveDetectionEnableFlowRef.current = true;
          setHasPendingNotificationEnable(true);
          setPermissionRecovery(null);
          await openNotificationSettings();
          return;
        }

        const result = await requestNotificationPermissionStatus();
        if (!hasActiveLiveDetectionEnableFlowRef.current) return;
        if (result === "granted") {
          setPermissionRecovery(null);
          await persistLiveDetectionEnabled();
          return;
        }

        setPermissionRecovery(
          createPermissionRecoveryState("notification", result)
        );
        return;
      }

      if (permissionRecovery.kind === "sms-sync") {
        if (permissionRecovery.mode === "blocked") {
          setPermissionRecovery(null);
          await openSettings();
          return;
        }

        const result = await requestPermission();
        if (result === "granted") {
          const mode = pendingSmsScanMode ?? "incremental";
          setPendingSmsScanMode(null);
          setPermissionRecovery(null);
          setScanMode(mode);
          router.push("/sms-scan");
          return;
        }

        setPermissionRecovery(
          createPermissionRecoveryState("sms-sync", result)
        );
        return;
      }

      if (permissionRecovery.mode === "blocked") {
        hasActiveLiveDetectionEnableFlowRef.current = true;
        setHasPendingLiveDetectionEnable(true);
        setHasReturnedFromLiveDetectionSettings(false);
        setPermissionRecovery(null);
        await openSettings();
        return;
      }

      const result = await requestLiveDetectionPermission();
      if (!hasActiveLiveDetectionEnableFlowRef.current) return;

      if (result === "granted") {
        setHasPendingLiveDetectionEnable(false);
        setPermissionRecovery(null);
        await enableLiveDetectionWithGrantedSms();
        return;
      }

      setPermissionRecovery(createPermissionRecoveryState("sms-live", result));
    }, [
      enableLiveDetectionWithGrantedSms,
      openSettings,
      pendingSmsScanMode,
      permissionRecovery,
      persistLiveDetectionEnabled,
      requestLiveDetectionPermission,
      requestPermission,
      setScanMode,
    ]);

  useEffect(() => {
    if (!hasPendingNotificationEnable) {
      return;
    }

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          previousNotificationAppState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          getNotificationPermissionStatus()
            .then((notificationStatus) => {
              if (notificationStatus !== "granted") {
                setHasPendingNotificationEnable(false);
                setPermissionRecovery(
                  createPermissionRecoveryState(
                    "notification",
                    notificationStatus
                  )
                );
                return;
              }

              setHasPendingNotificationEnable(false);
              return enableLiveDetectionWithGrantedSms();
            })
            .catch(() => {
              showToast({
                type: "error",
                title: tCommon("error"),
              });
            });
        }

        previousNotificationAppState.current = nextState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [
    enableLiveDetectionWithGrantedSms,
    hasPendingNotificationEnable,
    showToast,
    tCommon,
  ]);

  useEffect(() => {
    if (!hasPendingLiveDetectionEnable) {
      return;
    }

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          previousSmsSettingsAppState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          recheckPermission()
            .catch(() => {
              showToast({
                type: "error",
                title: tCommon("error"),
              });
            })
            .finally(() => {
              setHasReturnedFromLiveDetectionSettings(true);
            });
        }

        previousSmsSettingsAppState.current = nextState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [hasPendingLiveDetectionEnable, recheckPermission, showToast, tCommon]);

  const handleToggleAutoConfirm = useCallback(
    async (value: boolean): Promise<void> => {
      setAutoConfirmSms(value);
      await setAutoConfirm(value);
    },
    []
  );

  const handleAiConsentToggle = useSettingsAiConsentToggle({
    aiConsent: { revokeConsent },
    autoConfirmSms,
    cancelLiveDetectionEnableFlow,
    hasActiveLiveDetectionEnableFlowRef,
    hasPendingLiveDetectionEnable,
    hasPendingNotificationEnable,
    isLiveDetectionEnabling,
    liveDetection,
    setAutoConfirmSms,
    setIsAiConsentSheetVisible,
    setIsAiConsentUpdating,
    setLiveDetection,
    showToast,
    tCommon,
  });

  const handleAiConsentToggleRequest = useCallback(
    (value: boolean): void => {
      if (!value) {
        setIsAiDisableConfirmOpen(true);
        return;
      }

      handleAiConsentToggle(true);
    },
    [handleAiConsentToggle]
  );

  const openSmsScan = useCallback((): void => router.push("/sms-scan"), []);
  const { continueSmsScanWithConsent } = useSettingsSmsSyncActions({
    onOpenSmsScan: openSmsScan,
    setPendingSmsScanMode,
    setPermissionRecovery,
    setScanMode,
    smsPermissionStatus,
  });

  const handleAiConsentContinue = useCallback(async (): Promise<void> => {
    setIsAiConsentUpdating(true);
    try {
      await aiConsent.grantConsent();
      markAiConsentGranted();
      shouldResumeAiConsentAfterPrivacyDetails.current = false;
      setIsAiConsentSheetVisible(false);
      const pendingAction = pendingAiConsentAction;
      setPendingAiConsentAction(null);

      if (pendingAction?.kind === "sms") {
        continueSmsScanWithConsent(pendingAction.mode);
        return;
      }

      if (pendingAction?.kind === "live") {
        await continueLiveDetectionEnableWithConsent();
      }
    } catch (error: unknown) {
      logger.error("settings.grantAiConsent.failed", error);
      showToast({
        type: "error",
        title: tCommon("error"),
      });
    } finally {
      setIsAiConsentUpdating(false);
    }
  }, [
    aiConsent,
    continueSmsScanWithConsent,
    continueLiveDetectionEnableWithConsent,
    markAiConsentGranted,
    pendingAiConsentAction,
    showToast,
    tCommon,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldResumeAiConsentAfterPrivacyDetails.current) return;
      shouldResumeAiConsentAfterPrivacyDetails.current = false;
      const shouldReopenConsent = Boolean(
        pendingAiConsentAction && !aiConsent.isLoading && !isAiConsentEnabled
      );
      setIsAiConsentSheetVisible(shouldReopenConsent);
      if (!shouldReopenConsent) setPendingAiConsentAction(null);
    }, [aiConsent.isLoading, isAiConsentEnabled, pendingAiConsentAction])
  );

  const openAiPrivacyDetails = useCallback((): void => {
    shouldResumeAiConsentAfterPrivacyDetails.current =
      pendingAiConsentAction !== null;
    setIsAiConsentSheetVisible(false);
    router.push("/ai-privacy-details");
  }, [pendingAiConsentAction]);

  const currencyInfo = CURRENCY_INFO_MAP[preferredCurrency];
  const permissionRecoveryContent =
    permissionRecovery === null
      ? null
      : getPermissionRecoveryContent(permissionRecovery, t);

  /**
   * Navigate to the scan page, showing permission recovery if needed.
   * Sets the scan mode before navigation.
   */
  const navigateToScan = useCallback(
    (mode: "incremental" | "full"): void => {
      if (!isAndroid) {
        showToast({
          type: "info",
          title: t("sms_android_only"),
        });
        return;
      }

      if (aiConsent.isLoading) return;

      if (!isAiConsentEnabled) {
        setPendingAiConsentAction({ kind: "sms", mode });
        setIsAiConsentSheetVisible(true);
        return;
      }

      continueSmsScanWithConsent(mode);
    },
    [aiConsent.isLoading, continueSmsScanWithConsent, isAiConsentEnabled, isAndroid, showToast, t]
  );

  const handleIncrementalSync = useCallback((): void => {
    navigateToScan("incremental");
  }, [navigateToScan]);

  const handleCurrencySelect = useCallback(
    (currency: CurrencyType) => {
      // TODO: Replace with structured logging (e.g., Sentry)
      setPreferredCurrency(currency).catch(console.error);
    },
    [setPreferredCurrency]
  );

  const [isChangingLanguage, setIsChangingLanguage] = useState(false);

  const handleLanguageChange = useCallback(
    async (lang: "en" | "ar"): Promise<void> => {
      if (isChangingLanguage) return;
      setIsChangingLanguage(true);
      try {
        // Three writes, in order, before the RTL-flip reload kicks in:
        //
        //   1. `setIntroLocaleOverride(lang)` — device-scoped AsyncStorage
        //      key (FR-030). `initI18n()` reads this FIRST on cold launch,
        //      so the next reload starts with the right language and there
        //      is no flash of the previous locale.
        //   2. `setPreferredLanguage(lang)` — persists to
        //      `profile.preferred_language` AND calls `changeLanguage`.
        //      Updating the profile is required because `AppReadyGate`
        //      syncs the runtime to `profile.preferred_language` on cold
        //      launch — leaving the profile stale would make the gate
        //      revert the user's choice.
        //
        // The previous code called `changeLanguage` directly without
        // updating either the override OR the profile, which caused the
        // 2026-04-26 user-reported regression where the app reloaded but
        // came back in the OLD language.
        await setIntroLocaleOverride(lang);
        await setPreferredLanguage(lang);
      } catch (error) {
        // TODO: Replace with structured logging (e.g., Sentry)
        console.error("Failed to change language:", error);
        showToast({
          type: "error",
          title: tCommon("error"),
          message: t("language_change_failed"),
        });
      } finally {
        setIsChangingLanguage(false);
      }
    },
    [isChangingLanguage, showToast, t, tCommon]
  );

  return (
    <GradientBackground className="flex-1">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-2.5 mb-5">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={24} color={theme.text.primary} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
          {t("title")}
        </Text>
        <View className="w-6" />
      </View>
      <ScrollView contentContainerClassName="px-5">
        <LanguageSettingsSection
          t={t}
          language={language}
          isChangingLanguage={isChangingLanguage}
          isLanguageDropdownOpen={isLanguageDropdownOpen}
          onToggleLanguageDropdown={() =>
            setIsLanguageDropdownOpen((prev) => !prev)
          }
          onChangeLanguage={(value) => {
            void handleLanguageChange(value);
          }}
        />
        <AppearanceSettingsSection
          t={t}
          isDark={isDark}
          onToggleTheme={() => {
            void toggleTheme();
          }}
        />
        <CurrencySettingsSection
          t={t}
          preferredCurrency={preferredCurrency}
          currencyFlag={currencyInfo?.flag ?? "💱"}
          currencyName={currencyInfo?.name ?? preferredCurrency}
          chevronColor={theme.text.secondary}
          onPress={() => setIsCurrencyPickerVisible(true)}
        />

        <AiProcessingSettingsSection
          t={t}
          isConsented={isAiConsentEnabled}
          isUpdating={aiConsent.isLoading || isAiConsentUpdating}
          onToggleConsent={handleAiConsentToggleRequest}
          onPrivacyDetailsPress={openAiPrivacyDetails}
        />

        {isAndroid && (
          <SmsSyncSettingsSection
            t={t}
            hasSynced={hasSynced}
            lastSyncTimestamp={lastSyncTimestamp}
            smsPermissionStatus={smsPermissionStatus}
            chevronColor={theme.text.secondary}
            onIncrementalSync={handleIncrementalSync}
            onFullRescanPress={() => setIsFullRescanModalOpen(true)}
          />
        )}

        {isAndroid && (
          <LiveDetectionSettingsSection
            t={t}
            isReady={isLiveDetectionPreferenceReady}
            liveDetectionSwitchValue={liveDetectionSwitchValue}
            isLiveDetectionEnabling={isLiveDetectionEnabling}
            liveDetection={liveDetection}
            autoConfirmSms={autoConfirmSms}
            onToggleLiveDetection={(value) => {
              handleToggleLiveDetection(value).catch((error: unknown) => {
                logger.error("settings.toggleLiveDetection.failed", error);
              });
            }}
            onToggleAutoConfirm={(value) => {
              handleToggleAutoConfirm(value).catch((error: unknown) => {
                logger.error("settings.toggleAutoConfirm.failed", error);
              });
            }}
          />
        )}

        <ProfileNotificationsSection
          t={t}
          userEmail={user?.email ?? null}
          chevronColor={theme.text.secondary}
        />
        <LogoutSettingsRow
          t={t}
          tCommon={tCommon}
          isLoggingOut={isLoggingOut}
          chevronColor={theme.text.secondary}
          onPress={() => {
            requestLogout().catch((error: unknown) => {
              logger.error("settings.logout.failed", error);
            });
          }}
        />
      </ScrollView>
      <SettingsConfirmationModals
        dismissForceLogoutError={dismissForceLogoutError}
        dismissSyncWarning={dismissSyncWarning}
        forceLogout={forceLogout}
        isAiDisableConfirmOpen={isAiDisableConfirmOpen}
        isFullRescanModalOpen={isFullRescanModalOpen}
        onCancelAiDisableConfirm={() => setIsAiDisableConfirmOpen(false)}
        onCancelFullRescan={() => setIsFullRescanModalOpen(false)}
        onConfirmAiDisable={() => { setIsAiDisableConfirmOpen(false); handleAiConsentToggle(false); }}
        onConfirmFullRescan={() => {
          setIsFullRescanModalOpen(false);
          navigateToScan("full");
        }}
        showForceLogoutError={showForceLogoutError}
        showSyncWarning={showSyncWarning}
        t={t}
        tCommon={tCommon}
      />
      <PermissionRecoveryModal
        visible={permissionRecovery !== null}
        icon={permissionRecoveryContent?.icon ?? "chatbubble-ellipses-outline"}
        onPrimaryPress={() => {
          handlePermissionModalPrimaryPress().catch(() => {
            showToast({
              type: "error",
              title: tCommon("error"),
            });
          });
        }}
        onCancel={handlePermissionModalCancel}
        title={permissionRecoveryContent?.title ?? ""}
        message={permissionRecoveryContent?.message ?? ""}
        primaryLabel={permissionRecoveryContent?.primaryLabel ?? ""}
        cancelLabel={t("permission_not_now")}
      />
      {/* Currency Picker Modal */}
      <CurrencyPicker
        visible={isCurrencyPickerVisible}
        selectedCurrency={preferredCurrency}
        onSelect={handleCurrencySelect}
        onClose={() => setIsCurrencyPickerVisible(false)}
      />
      <AiProcessingConsentSheet
        visible={isAiConsentSheetVisible}
        onContinue={handleAiConsentContinue}
        onNotNow={() => {
          setPendingAiConsentAction(null);
          setIsAiConsentSheetVisible(false);
        }}
        onPrivacyDetails={openAiPrivacyDetails}
      />
    </GradientBackground>
  );
}
