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

import { useAuth } from "@/context/AuthContext";
import { useDeferredRouterReplace } from "@/hooks/useDeferredRouterReplace";
import { completeAuthSessionFromUrl } from "@/services/auth-service";
import { useURL } from "expo-linking";
import { type Href, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

type CallbackState = "waiting" | "processing" | "completed" | "failed";

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
  if (params.type === "recovery" || params.action === "reset") {
    return true;
  }

  if (!callbackUrl) {
    return false;
  }

  const queryStart = callbackUrl.indexOf("?");
  if (queryStart !== -1) {
    const hashStart = callbackUrl.indexOf("#", queryStart + 1);
    const query = callbackUrl.slice(
      queryStart + 1,
      hashStart === -1 ? callbackUrl.length : hashStart
    );
    if (new URLSearchParams(query).get("type") === "recovery") {
      return true;
    }
  }

  const fragmentStart = callbackUrl.indexOf("#");
  if (fragmentStart !== -1) {
    const fragment = callbackUrl.slice(fragmentStart + 1);
    if (new URLSearchParams(fragment).get("type") === "recovery") {
      return true;
    }
  }

  return false;
}

export default function AuthCallbackScreen(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const callbackUrl = useURL();
  const processedUrlRef = useRef<string | null>(null);
  const [callbackState, setCallbackState] =
    useState<CallbackState>("waiting");

  useEffect(() => {
    if (!callbackUrl || processedUrlRef.current === callbackUrl) {
      return;
    }

    processedUrlRef.current = callbackUrl;
    setCallbackState("processing");
    let isMounted = true;

    const completeCallback = async (): Promise<void> => {
      const result = await completeAuthSessionFromUrl(callbackUrl);
      if (!isMounted) {
        return;
      }

      setCallbackState(result.success ? "completed" : "failed");
    };

    void completeCallback();

    return () => {
      isMounted = false;
    };
  }, [callbackUrl]);

  let redirectHref: Href | null = null;
  if (callbackState === "failed") {
    redirectHref = "/auth";
  } else if (
    callbackState === "completed" &&
    !isLoading &&
    isAuthenticated
  ) {
    redirectHref = isPasswordRecoveryLink(params, callbackUrl)
      ? "/settings"
      : "/";
  }

  useDeferredRouterReplace({
    enabled: redirectHref !== null,
    href: redirectHref ?? "/",
  });

  return <View />;
}
