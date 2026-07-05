import { QuickActionFab } from "@/components/fab";
import { AiProcessingConsentSheet } from "@/components/ai-consent/AiProcessingConsentSheet";
import { CustomBottomTabBar } from "@/components/tab-bar/CustomBottomTabBar";
import { VoiceRecordingOverlay } from "@/components/voice/VoiceRecordingOverlay";
import { darkTheme, lightTheme } from "@/constants/colors";
import {
  MicButtonRefProvider,
  useMicButtonRef,
} from "@/context/MicButtonRefContext";
import { MicTooltipProvider } from "@/context/MicTooltipContext";
import { useTheme } from "@/context/ThemeContext";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { useAiProcessingConsent } from "@/hooks/useAiProcessingConsent";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import {
  registerVoiceEntry,
  unregisterVoiceEntry,
} from "@/services/voice-entry-service";
import { toCategoryTreeSources } from "@/utils/category-tree-source";
import { buildCategoryTree } from "@monyvi/logic";
import {
  Tabs,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

export default function TabLayout(): React.ReactElement {
  return (
    <MicButtonRefProvider>
      <MicTooltipProvider>
        <TabLayoutInner />
      </MicTooltipProvider>
    </MicButtonRefProvider>
  );
}

function TabLayoutInner(): React.ReactElement {
  const { isDark } = useTheme();
  const { preferredCurrency } = usePreferredCurrency();
  const { categories: allCategories } = useCategories({ topLevelOnly: false });
  const { accounts } = useAccounts();
  const router = useRouter();
  const micButtonRef = useMicButtonRef();
  const aiConsent = useAiProcessingConsent();
  const [isVoiceConsentVisible, setIsVoiceConsentVisible] = useState(false);
  const shouldResumeVoiceConsentAfterPrivacyDetails = useRef(false);

  const categoryTree = useMemo(
    () => buildCategoryTree(toCategoryTreeSources(allCategories)),
    [allCategories]
  );

  const accountInputs = useMemo(
    () =>
      accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    [accounts]
  );

  const { retry } = useLocalSearchParams<{ retry?: string }>();
  const autoStart = retry === "true";

  const ensureAiProcessingConsent = useCallback((): boolean => {
    if (aiConsent.isLoading) return false;
    if (aiConsent.isConsented) return true;
    setIsVoiceConsentVisible(true);
    return false;
  }, [aiConsent.isConsented, aiConsent.isLoading]);

  useEffect(() => {
    if (autoStart) {
      router.setParams({ retry: undefined });
    }
  }, [autoStart, router]);

  const voiceFlow = useVoiceTransactionFlow({
    preferredCurrency,
    categories: categoryTree,
    accounts: accountInputs,
    categoryRecords: allCategories,
    autoStart,
    canAutoStart: !aiConsent.isLoading,
    ensureAiProcessingConsent,
  });

  // Register the voice entry handler so the onboarding guide's mic tooltip
  // can trigger the voice flow via openVoiceEntry(). Unregister on unmount
  // so a stale closure is never retained across tab-layout remounts (logout
  // → re-login, hot reload, future multi-window architecture).
  useEffect(() => {
    registerVoiceEntry(voiceFlow.startFlow);
    return (): void => {
      unregisterVoiceEntry();
    };
  }, [voiceFlow.startFlow]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldResumeVoiceConsentAfterPrivacyDetails.current) {
        return;
      }

      shouldResumeVoiceConsentAfterPrivacyDetails.current = false;
      if (!aiConsent.isLoading && !aiConsent.isConsented) {
        setIsVoiceConsentVisible(true);
      }
    }, [aiConsent.isConsented, aiConsent.isLoading])
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Tabs
        tabBar={(props) => (
          <CustomBottomTabBar
            {...props}
            micButtonRef={micButtonRef ?? undefined}
            onMicPress={() => void voiceFlow.startFlow()}
            isRecording={
              voiceFlow.flowStatus === "recording" ||
              voiceFlow.flowStatus === "paused"
            }
          />
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: {
            backgroundColor: isDark
              ? darkTheme.background
              : lightTheme.background,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
          }}
        />
        <Tabs.Screen
          name="accounts"
          options={{
            title: "Accounts",
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: "Transactions",
          }}
        />
        <Tabs.Screen
          name="metals"
          options={{
            title: "Metals",
          }}
        />
      </Tabs>

      <QuickActionFab isRecordingActive={voiceFlow.flowStatus !== "idle"} />

      {/* Voice Recording Overlay — renders above tab bar */}
      <VoiceRecordingOverlay
        visible={voiceFlow.isOverlayVisible}
        status={voiceFlow.flowStatus}
        durationMs={voiceFlow.durationMs}
        errorMessage={voiceFlow.errorMessage ?? undefined}
        onSubmit={voiceFlow.submitRecording}
        onDiscard={voiceFlow.discardRecording}
        onPause={voiceFlow.pauseRecording}
        onResume={voiceFlow.resumeRecording}
        onRetry={voiceFlow.retryRecording}
      />
      <AiProcessingConsentSheet
        visible={isVoiceConsentVisible}
        variant="ai-consent"
        onContinue={async () => {
          let didGrantConsent = false;
          try {
            await aiConsent.grantConsent();
            didGrantConsent = true;
            shouldResumeVoiceConsentAfterPrivacyDetails.current = false;
            setIsVoiceConsentVisible(false);
            await voiceFlow.startFlow({ skipAiProcessingConsent: true });
          } catch {
            shouldResumeVoiceConsentAfterPrivacyDetails.current = false;
            setIsVoiceConsentVisible(didGrantConsent ? false : true);
          }
        }}
        onNotNow={() => {
          shouldResumeVoiceConsentAfterPrivacyDetails.current = false;
          setIsVoiceConsentVisible(false);
        }}
        onPrivacyDetails={() => {
          shouldResumeVoiceConsentAfterPrivacyDetails.current = true;
          setIsVoiceConsentVisible(false);
          router.push("/ai-privacy-details");
        }}
      />
    </View>
  );
}
