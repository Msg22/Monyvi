import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormView } from "@/components/auth/FormView";
import { ResetSentView } from "@/components/auth/ResetSentView";
import { VerificationPendingView } from "@/components/auth/VerificationPendingView";
import { LanguageSwitcherPill } from "@/components/onboarding/LanguageSwitcherPill";
import { MonyviLogo } from "@/components/ui/MonyviLogo";
import { palette } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useAuthScreenController } from "@/hooks/useAuthScreenController";
import { useFormScroll } from "@/hooks/useFormScroll";
import { useKeyboardVisibility } from "@/hooks/useKeyboardVisibility";

export default function AuthScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useTheme();
  const isKeyboardVisible = useKeyboardVisibility();
  const controller = useAuthScreenController();
  const { scrollViewRef, getFieldRef, onScroll, scrollToField } = useFormScroll<
    "email" | "password"
  >({ bottomInset: insets.bottom });

  const gradientColors: readonly [string, string] = isDark
    ? [palette.slate[950], palette.slate[900]]
    : [palette.nileGreen[50], palette.slate[25]];

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <LinearGradient
        colors={gradientColors}
        className="absolute inset-0"
        pointerEvents="none"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          testID="auth-scroll"
          ref={scrollViewRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5 flex-row items-center justify-between">
            <MonyviLogo width={112} height={34} />
            <LanguageSwitcherPill />
          </View>

          <Animated.View
            entering={FadeInDown.duration(260).reduceMotion(
              ReduceMotion.System
            )}
            className="flex-1"
          >
            {controller.screenState === "form" ? (
              <FormView
                isKeyboardVisible={isKeyboardVisible}
                pendingAction={controller.pendingAction}
                emailError={controller.emailError}
                networkError={controller.networkError}
                emailFieldRef={getFieldRef("email")}
                passwordFieldRef={getFieldRef("password")}
                onOAuth={controller.handleOAuth}
                onEmailSubmit={controller.handleEmailSubmit}
                onForgotPassword={controller.handleForgotPassword}
                onClearError={controller.clearEmailError}
                onClearNetworkError={controller.clearNetworkError}
                onPrivacyPress={() => router.push("/privacy-policy")}
                onTermsPress={() => router.push("/terms")}
                onEmailFocus={() => scrollToField("email")}
                onPasswordFocus={() => scrollToField("password")}
              />
            ) : controller.screenState === "verificationPending" ? (
              <VerificationPendingView
                email={controller.pendingEmail}
                isResending={controller.pendingAction === "verificationResend"}
                onResend={controller.handleResendVerification}
                onBack={controller.handleBackToForm}
              />
            ) : (
              <ResetSentView
                email={controller.pendingEmail}
                onBack={controller.handleBackToForm}
              />
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
