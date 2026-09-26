import type { ReactNode } from "react";
import { View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  usePrivateLocaleStartup,
  usePublicLocaleStartup,
} from "@/hooks/useLocaleStartup";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LanguageSnapshot } from "@/services/language-coordinator";
import { AppReadyGate } from "./AppReadyGate";
import { LanguageFailureNotice } from "./LanguageFailureNotice";

interface LanguageBoundaryProps {
  readonly children: ReactNode;
}

function hasSettled(state: LanguageSnapshot): boolean {
  return state.phase === "ready" || state.phase === "error";
}

function LanguagePending(): ReactNode {
  return (
    <View
      testID="language-loading"
      className="flex-1 items-center justify-center bg-background dark:bg-background-dark"
    >
      <Skeleton width="60%" height={24} />
    </View>
  );
}

export function PublicLanguageBoundary({
  children,
}: LanguageBoundaryProps): ReactNode {
  const { isAuthenticated } = useAuth();
  const state = usePublicLocaleStartup();
  if (isAuthenticated) return children;
  return hasSettled(state) ? (
    <>
      {children}
      <LanguageFailureNotice />
    </>
  ) : (
    <LanguagePending />
  );
}

export function PrivateLanguageBoundary({
  children,
}: LanguageBoundaryProps): ReactNode {
  const { state, isProfileUnavailable } = usePrivateLocaleStartup();
  // Account/profile recovery must remain reachable; its own safety gate still applies.
  const isSettled = isProfileUnavailable || hasSettled(state);
  return (
    <>
      <AppReadyGate isLocaleSettled={isSettled} />
      {isSettled ? children : <LanguagePending />}
    </>
  );
}
