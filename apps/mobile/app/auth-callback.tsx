/**
 * Auth Callback Route
 *
 * Catch-all route for deep link redirects (`monyvi://auth-callback`).
 * The route completes the Supabase session first, then hands routing back to the
 * existing authenticated startup flow. It does not duplicate profile/onboarding
 * decisions.
 *
 * @module AuthCallbackRoute
 */

import {
  AuthCallbackFailureView,
  type AuthCallbackFailureType,
} from "@/components/auth/AuthCallbackFailureView";
import { AuthCallbackProcessingView } from "@/components/auth/AuthCallbackProcessingView";
import { VerificationSuccessView } from "@/components/auth/VerificationSuccessView";
import { LanguageSwitcherPill } from "@/components/onboarding/LanguageSwitcherPill";
import { MonyviLogo } from "@/components/ui/MonyviLogo";
import { palette } from "@/constants/colors";
import { RESPONSIVE_BREAKPOINTS } from "@/constants/ui";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useDeferredRouterReplace } from "@/hooks/useDeferredRouterReplace";
import {
  cancelAuthSessionCompletion,
  completeAuthSessionFromUrl,
} from "@/services/auth-service";
import { useLinkingURL } from "expo-linking";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CallbackState =
  | "waiting"
  | "processing"
  | "completed"
  | "verificationSuccess"
  | "failed";

const CALLBACK_PROCESSING_TIMEOUT_MS = 10_000;

function readCallbackType(
  params: Record<string, string | string[]>,
  callbackUrl: string | null
): string | null {
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;
  if (typeof paramType === "string" && paramType.length > 0) {
    return paramType;
  }

  if (!callbackUrl) {
    return null;
  }

  const queryStart = callbackUrl.indexOf("?");
  if (queryStart !== -1) {
    const hashStart = callbackUrl.indexOf("#", queryStart + 1);
    const query = callbackUrl.slice(
      queryStart + 1,
      hashStart === -1 ? callbackUrl.length : hashStart
    );
    const queryType = new URLSearchParams(query).get("type");
    if (queryType) {
      return queryType;
    }
  }

  const fragmentStart = callbackUrl.indexOf("#");
  if (fragmentStart !== -1) {
    const fragmentType = new URLSearchParams(
      callbackUrl.slice(fragmentStart + 1)
    ).get("type");
    if (fragmentType) {
      return fragmentType;
    }
  }

  return null;
}

function isSignupVerificationLink(
  params: Record<string, string | string[]>,
  callbackUrl: string | null
): boolean {
  return readCallbackType(params, callbackUrl) === "signup";
}

/**
 * Detect whether the current deep link is a password-recovery callback.
 *
 * Expo Router exposes query parameters, while implicit Supabase redirects can
 * put `type=recovery` in the fragment. Inspect both without logging the URL.
 */
function isPasswordRecoveryLink(
  params: Record<string, string | string[]>,
  callbackUrl: string | null
): boolean {
  if (params.action === "reset") {
    return true;
  }
  return readCallbackType(params, callbackUrl) === "recovery";
}

function AuthCallbackVerificationSuccess({
  email,
  onContinue,
}: {
  readonly email?: string;
  readonly onContinue: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const { isDark } = useTheme();
  const isCompact = viewportWidth < RESPONSIVE_BREAKPOINTS.compactPhone;
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
      <ScrollView
        testID="auth-callback-success-scroll"
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 6,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: isCompact ? 16 : 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          testID="auth-topbar"
          className="min-h-10 flex-row items-center justify-between"
        >
          {languageSlot}
          {logoSlot}
        </View>
        <View className="flex-1 w-full max-w-[400px] self-center">
          <VerificationSuccessView email={email} onContinue={onContinue} />
        </View>
      </ScrollView>
    </View>
  );
}

export default function AuthCallbackScreen(): React.JSX.Element {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const callbackUrl = useLinkingURL();
  const processedUrlRef = useRef<string | null>(null);
  const [callbackState, setCallbackState] = useState<CallbackState>("waiting");
  const [failureType, setFailureType] =
    useState<AuthCallbackFailureType>("verification");
  const [retryNonce, setRetryNonce] = useState(0);
  const [verifiedEmail, setVerifiedEmail] = useState<string | undefined>();

  useEffect(() => {
    if (callbackUrl || callbackState !== "waiting") {
      return;
    }

    const waitingTimeout = setTimeout(() => {
      setFailureType("verification");
      setCallbackState("failed");
    }, CALLBACK_PROCESSING_TIMEOUT_MS);

    return () => clearTimeout(waitingTimeout);
  }, [callbackState, callbackUrl]);

  useEffect(() => {
    if (!callbackUrl || processedUrlRef.current === callbackUrl) {
      return;
    }

    processedUrlRef.current = callbackUrl;
    setCallbackState("processing");
    let isMounted = true;
    const attemptParams = paramsRef.current;

    const completeCallback = async (): Promise<void> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutResult = new Promise<{
          success: false;
          error: string;
          errorCode: "timeout";
        }>((resolve) => {
          timeoutId = setTimeout(() => {
            cancelAuthSessionCompletion(callbackUrl);
            resolve({
              success: false,
              error: "Authentication took too long. Please try again.",
              errorCode: "timeout",
            });
          }, CALLBACK_PROCESSING_TIMEOUT_MS);
        });

        const result = await Promise.race([
          completeAuthSessionFromUrl(callbackUrl),
          timeoutResult,
        ]);
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (!isMounted) {
          return;
        }

        if (result.success) {
          if (isSignupVerificationLink(attemptParams, callbackUrl)) {
            setVerifiedEmail(result.email);
            setCallbackState("verificationSuccess");
          } else {
            setCallbackState("completed");
          }
        } else {
          setCallbackState("failed");
          if (
            result.errorCode === "network" ||
            result.errorCode === "timeout"
          ) {
            setFailureType("network");
          } else if (isPasswordRecoveryLink(attemptParams, callbackUrl)) {
            setFailureType("recovery");
          } else if (
            attemptParams.provider ||
            (callbackUrl && callbackUrl.includes("provider="))
          ) {
            setFailureType("oauth");
          } else {
            setFailureType("verification");
          }
        }
      } catch {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        if (isMounted) {
          setCallbackState("failed");
          if (isPasswordRecoveryLink(attemptParams, callbackUrl)) {
            setFailureType("recovery");
          } else {
            setFailureType("verification");
          }
        }
      }
    };

    void completeCallback();

    return () => {
      isMounted = false;
    };
  }, [callbackUrl, retryNonce]);

  const redirectHref: Href | null =
    callbackState === "completed"
      ? isPasswordRecoveryLink(params, callbackUrl)
        ? "/settings"
        : "/"
      : null;

  useDeferredRouterReplace({
    enabled: redirectHref !== null,
    href: redirectHref ?? "/",
  });

  const handleRetry = (): void => {
    processedUrlRef.current = null;
    setRetryNonce((prev) => prev + 1);
  };

  if (callbackState === "verificationSuccess") {
    return (
      <AuthCallbackVerificationSuccess
        email={verifiedEmail ?? user?.email}
        onContinue={() => {
          router.replace("/");
        }}
      />
    );
  }

  if (callbackState === "failed") {
    return (
      <AuthCallbackFailureView
        failureType={failureType}
        onBack={() => {
          router.replace("/auth");
        }}
        onRetry={failureType === "network" ? handleRetry : undefined}
      />
    );
  }

  return <AuthCallbackProcessingView />;
}
