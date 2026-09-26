import { useRef, type ReactNode } from "react";
import { View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  useLanguageScope,
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

export function LanguageScopeSync(): null {
  useLanguageScope();
  return null;
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
  const hasSettledOnceRef = useRef(false);

  if (hasSettled(state)) {
    hasSettledOnceRef.current = true;
  }

  if (isAuthenticated) return children;

  const showPending =
    !hasSettledOnceRef.current || state.phase === "restarting";

  return showPending ? (
    <LanguagePending />
  ) : (
    <>
      {children}
      <LanguageFailureNotice />
    </>
  );
}

export function PrivateLanguageBoundary({
  children,
}: LanguageBoundaryProps): ReactNode {
  const { state, isProfileUnavailable } = usePrivateLocaleStartup();
  const hasSettledOnceRef = useRef(false);
  const settled = isProfileUnavailable || hasSettled(state);

  if (settled) {
    hasSettledOnceRef.current = true;
  }

  const showPending =
    !hasSettledOnceRef.current || state.phase === "restarting";

  return (
    <>
      <AppReadyGate isLocaleSettled={hasSettledOnceRef.current || settled} />
      {showPending ? <LanguagePending /> : children}
    </>
  );
}

