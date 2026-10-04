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
import { VerificationSuccessView } from "@/components/auth/VerificationSuccessView";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useDeferredRouterReplace } from "@/hooks/useDeferredRouterReplace";
import { completeAuthSessionFromUrl } from "@/services/auth-service";
import { useURL } from "expo-linking";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
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

function AuthCallbackSkeleton(): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="auth-callback-loading-skeleton"
      className="flex-1 items-center justify-between bg-background px-6 dark:bg-background-dark"
      style={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <View className="flex-1 items-center justify-center">
        <Skeleton width={92} height={92} borderRadius={46} />
        <View className="mt-6">
          <Skeleton width={220} height={32} borderRadius={8} />
        </View>
        <View className="mt-3 items-center">
          <Skeleton width={260} height={16} borderRadius={6} />
          <View className="mt-2">
            <Skeleton width={180} height={16} borderRadius={6} />
          </View>
        </View>
      </View>
      <Skeleton width="100%" height={48} borderRadius={13} />
    </View>
  );
}

export default function AuthCallbackScreen(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const callbackUrl = useURL();
  const processedUrlRef = useRef<string | null>(null);
  const [callbackState, setCallbackState] = useState<CallbackState>("waiting");
  const [failureType, setFailureType] =
    useState<AuthCallbackFailureType>("verification");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!callbackUrl || processedUrlRef.current === callbackUrl) {
      return;
    }

    processedUrlRef.current = callbackUrl;
    setCallbackState("processing");
    let isMounted = true;

    const completeCallback = async (): Promise<void> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutResult = new Promise<{
          success: false;
          error: string;
          errorCode: "timeout";
        }>((resolve) => {
          timeoutId = setTimeout(() => {
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
          if (isSignupVerificationLink(params, callbackUrl)) {
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
          } else if (isPasswordRecoveryLink(params, callbackUrl)) {
            setFailureType("recovery");
          } else if (
            params.provider ||
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
          if (isPasswordRecoveryLink(params, callbackUrl)) {
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
  }, [callbackUrl, retryNonce, params]);

  let redirectHref: Href | null = null;
  if (callbackState === "completed" && !isLoading && isAuthenticated) {
    redirectHref = isPasswordRecoveryLink(params, callbackUrl)
      ? "/settings"
      : "/";
  }

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
      <VerificationSuccessView
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

  return <AuthCallbackSkeleton />;
}
