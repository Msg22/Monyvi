import { darkTheme, lightTheme } from "@/constants/colors";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_500Medium,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
} from "@expo-google-fonts/noto-sans-arabic";
import { ReadexPro_700Bold } from "@expo-google-fonts/readex-pro";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import { I18nextProvider } from "react-i18next";
import { Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, View, type AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider } from "../components/ui/Toast";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { LocaleProvider } from "../context/LocaleContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import i18n, { initI18n } from "../i18n";
import { initializeNotifications } from "../services/notification-service";
import {
  handleDetectedSms,
  initializeDetectionActionHandler,
} from "../services/sms-live-detection-handler";
import {
  onTransactionDetected,
  stopSmsListener,
} from "../services/sms-live-listener-service";
import { startConsentAwareLiveSmsListenerIfEnabled } from "../services/sms-live-startup-service";
import { logger } from "../utils/logger";

import "../global.css";

const SENTRY_DSN = String(process.env.EXPO_PUBLIC_SENTRY_DSN ?? "");

const PUBLIC_ROUTES = new Set([
  "",
  "auth",
  "auth-callback",
  "e2e-auth",
  "pitch",
]);

Sentry.init({
  dsn: SENTRY_DSN || undefined,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [Sentry.mobileReplayIntegration()],
  enabled: SENTRY_DSN.length > 0 && !__DEV__,
});

SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  logger.warn("Failed to prevent splash screen auto-hide", { error });
});

function RootLayout(): React.ReactNode {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    NotoSansArabic_400Regular,
    NotoSansArabic_500Medium,
    NotoSansArabic_600SemiBold,
    NotoSansArabic_700Bold,
    ReadexPro_700Bold,
  });

  const [i18nInitialized, setI18nInitialized] = useState(false);

  useEffect(() => {
    initI18n()
      .then(() => setI18nInitialized(true))
      .catch(async (error: unknown) => {
        logger.error("Failed to initialize i18n", error);
        try {
          await i18n.changeLanguage("en");
        } catch (fallbackError: unknown) {
          logger.error("Failed to set i18n fallback to en", fallbackError);
        }
        setI18nInitialized(true);
      });
  }, []);

  const cleanupRef = useRef<(() => void) | null>(null);

  const startDetectionIfEnabled = useCallback(async (): Promise<void> => {
    await startConsentAwareLiveSmsListenerIfEnabled();
  }, []);

  useEffect(() => {
    initializeNotifications().catch((error: unknown) => {
      logger.error("Failed to initialize notifications", error);
    });
    const cleanupActions = initializeDetectionActionHandler();

    const cleanupDetection = onTransactionDetected((parsed) => {
      handleDetectedSms(parsed).catch((error: unknown) => {
        logger.error("Failed to handle detected SMS", error);
      });
    });

    startDetectionIfEnabled().catch((error: unknown) => {
      logger.error("Failed to start SMS detection", error);
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          startDetectionIfEnabled().catch((error: unknown) => {
            logger.error(
              "Failed to restart SMS detection on app resume",
              error
            );
          });
        }
      }
    );

    cleanupRef.current = () => {
      cleanupActions();
      cleanupDetection();
      stopSmsListener();
      appStateSubscription.remove();
    };

    return () => {
      cleanupRef.current?.();
    };
  }, [startDetectionIfEnabled]);

  if ((!fontsLoaded && !fontError) || !i18nInitialized) {
    return null;
  }

  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView
          className="flex-1"
          accessibilityLanguage={i18n.language === "ar" ? "ar" : "en"}
        >
          <AuthProvider>
            <LocaleProvider>
              <ThemeProvider>
                <SafeAreaProvider initialMetrics={initialWindowMetrics}>
                  <ToastProvider>
                    <RootLayoutNav />
                    <AndroidNavigationBarSurface />
                    <PublicSplashGate />
                  </ToastProvider>
                </SafeAreaProvider>
              </ThemeProvider>
            </LocaleProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

function PublicSplashGate(): null {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const hiddenRef = useRef(false);
  const isPublicRoute = PUBLIC_ROUTES.has(segments[0] ?? "");

  useEffect(() => {
    if (hiddenRef.current || isLoading || isAuthenticated || !isPublicRoute) {
      return;
    }

    SplashScreen.hideAsync()
      .then(() => {
        hiddenRef.current = true;
      })
      .catch((error: unknown) => {
        logger.warn(
          "publicSplashGate.splash.hideAsync.failed",
          error instanceof Error ? { message: error.message } : { error }
        );
      });
  }, [isAuthenticated, isLoading, isPublicRoute]);

  return null;
}

function RootLayoutNav(): React.ReactNode {
  const { isDark } = useTheme();
  const systemBackgroundColor = isDark
    ? darkTheme.background
    : lightTheme.background;
  const statusBarStyle = isDark ? "light" : "dark";

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(systemBackgroundColor).catch(
      (error: unknown) => {
        logger.warn(
          "rootLayout.systemUi.setBackgroundColor.failed",
          error instanceof Error ? { message: error.message } : { error }
        );
      }
    );
  }, [systemBackgroundColor]);

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark
              ? darkTheme.background
              : lightTheme.background,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="pitch" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="e2e-auth" />
        <Stack.Screen name="(private)" />
      </Stack>
    </>
  );
}

function AndroidNavigationBarSurface(): React.ReactNode {
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android" || insets.bottom <= 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      className="absolute bottom-0 start-0 end-0 z-[20] bg-background dark:bg-background-dark"
      style={{ height: insets.bottom }}
    />
  );
}
