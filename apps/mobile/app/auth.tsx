import { LinearGradient } from "expo-linear-gradient";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormView } from "@/components/auth/FormView";
import { ResetSentView } from "@/components/auth/ResetSentView";
import { VerificationCodeView } from "@/components/auth/VerificationCodeView";
import { VerificationSuccessView } from "@/components/auth/VerificationSuccessView";
import { LanguageSwitcherPill } from "@/components/onboarding/LanguageSwitcherPill";
import { MonyviLogo } from "@/components/ui/MonyviLogo";
import { palette } from "@/constants/colors";
import {
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_FONT_SCALE,
} from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import { useAuthScreenController } from "@/hooks/useAuthScreenController";
import { useFormScroll } from "@/hooks/useFormScroll";
import { useKeyboardVisibility } from "@/hooks/useKeyboardVisibility";

export function getAuthBottomPadding(
  bottomInset: number,
  isCompactViewport: boolean
): number {
  return bottomInset + (isCompactViewport ? 8 : 22);
}

export function shouldEnableAuthScroll(
  fontScale: number,
  viewportHeight: number = 900,
  viewportWidth?: number
): boolean {
  if (fontScale >= RESPONSIVE_FONT_SCALE.denseLayout) {
    return true;
  }
  if (viewportHeight <= 850) {
    return true;
  }
  if (viewportWidth !== undefined && viewportWidth > viewportHeight) {
    return true;
  }
  return false;
}

export default function AuthScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const isKeyboardVisible = useKeyboardVisibility();
  const {
    width: viewportWidth,
    height: viewportHeight,
    fontScale,
  } = useWindowDimensions();
  const isCompactViewport = viewportWidth <= 390 || viewportHeight <= 850;
  const controller = useAuthScreenController();
  const isVerificationSurface =
    controller.screenState === "verificationCode" ||
    controller.screenState === "verificationSuccess";
  const isVerificationCompact =
    viewportWidth < RESPONSIVE_BREAKPOINTS.compactPhone;
  const { scrollViewRef, getFieldRef, onScroll, scrollToField } = useFormScroll<
    "email" | "password"
  >({ bottomInset: insets.bottom });

  const gradientColors: readonly [string, string] = isDark
    ? [palette.slate[950], palette.slate[900]]
    : [palette.nileGreen[50], palette.slate[25]];

  const languageSlot = (
    <View testID="auth-language-slot">
      <LanguageSwitcherPill />
    </View>
  );
  const logoSlot = (
    <View testID="auth-logo-slot">
      <MonyviLogo width={114} height={34} />
    </View>
  );

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
          scrollEnabled={shouldEnableAuthScroll(
            fontScale,
            viewportHeight,
            viewportWidth
          )}
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 6,
            paddingBottom: isVerificationSurface
              ? insets.bottom + 16
              : getAuthBottomPadding(insets.bottom, isCompactViewport),
            paddingHorizontal: isVerificationSurface
              ? isVerificationCompact
                ? 16
                : 24
              : isCompactViewport
                ? 25
                : 30,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          <View
            testID="auth-topbar"
            className={`flex-row items-center justify-between ${
              isVerificationSurface ? "min-h-10" : "min-h-[50px]"
            }`}
          >
            {languageSlot}
            {logoSlot}
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
                isCompactViewport={isCompactViewport}
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
                onEmailFocus={() => scrollToField("email")}
                onPasswordFocus={() => scrollToField("password")}
              />
            ) : controller.screenState === "verificationCode" ||
              controller.screenState === "verificationSuccess" ? (
              <View
                testID="auth-verification-content"
                className="flex-1 w-full max-w-[400px] self-center"
              >
                {controller.screenState === "verificationCode" ? (
                  <VerificationCodeView
                    email={controller.pendingEmail}
                    code={controller.verificationCode}
                    verificationError={controller.verificationError}
                    verificationExpiresAtMs={controller.verificationExpiresAtMs}
                    resendAvailableAtMs={controller.resendAvailableAtMs}
                    resendLimitUntilMs={controller.resendLimitUntilMs}
                    isVerifying={
                      controller.pendingAction === "verificationCode"
                    }
                    isResending={
                      controller.pendingAction === "verificationResend"
                    }
                    onCodeChange={controller.handleVerificationCodeChange}
                    onResend={controller.handleResendVerification}
                    onBack={controller.handleBackToForm}
                  />
                ) : (
                  <VerificationSuccessView
                    email={controller.pendingEmail}
                    onContinue={controller.handleContinueAfterVerification}
                  />
                )}
              </View>
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
