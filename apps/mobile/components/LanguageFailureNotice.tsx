import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./ui/Toast";
import { useLanguageState } from "@/hooks/useLanguageRuntime";
import { useAuth } from "@/context/AuthContext";
import { PUBLIC_LANGUAGE_SCOPE } from "@/hooks/useLocaleStartup";
import * as SplashScreen from "expo-splash-screen";
import { logger } from "@/utils/logger";

const LANGUAGE_WARNING_DURATION_MS = 8000;

export function LanguageFailureNotice(): null {
  const state = useLanguageState();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation("settings");
  const shown = useRef(false);
  useEffect(() => {
    if (state.phase !== "error") {
      shown.current = false;
      return;
    }
    if (
      shown.current ||
      isLoading ||
      state.scope !== (user?.id ?? PUBLIC_LANGUAGE_SCOPE)
    )
      return;
    const directionFailed =
      state.errorCode === "direction-failed" ||
      state.errorCode === "restart-incomplete";
    let cancelled = false;
    void SplashScreen.hideAsync()
      .then((): void => {
        if (cancelled || shown.current) return;
        shown.current = true;
        showToast({
          type: directionFailed ? "warning" : "error",
          title: t("language_change_error_title"),
          message: t(
            directionFailed
              ? "language_direction_reopen"
              : "language_change_failed"
          ),
          dismissible: true,
          duration: LANGUAGE_WARNING_DURATION_MS,
        });
      })
      .catch((error: unknown): void => {
        logger.warn("language.notice.splash.failed", { error });
      });
    return (): void => {
      cancelled = true;
    };
  }, [isLoading, showToast, state, t, user?.id]);
  return null;
}
