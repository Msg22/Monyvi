import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { isPeriodExpired } from "@monyvi/logic";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function useBudgetPeriodExpiry(
  periodEnd: Date | null | undefined
): boolean {
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const periodEndTime = periodEnd?.getTime();

  useEffect(() => {
    if (periodEndTime === undefined) return;

    let expirationTimer: ReturnType<typeof setTimeout> | undefined;
    const expirationBoundary = new Date(periodEndTime);
    expirationBoundary.setHours(24, 0, 0, 0);

    const refreshNow = (): void => {
      setReferenceDate(new Date());
    };

    const scheduleExpirationRefresh = (): void => {
      const remainingMs = expirationBoundary.getTime() - Date.now();
      if (remainingMs <= 0) {
        refreshNow();
        return;
      }

      expirationTimer = setTimeout(
        scheduleExpirationRefresh,
        Math.min(remainingMs, MAX_TIMER_DELAY_MS)
      );
    };

    scheduleExpirationRefresh();
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") refreshNow();
      }
    );

    return () => {
      if (expirationTimer !== undefined) clearTimeout(expirationTimer);
      appStateSubscription.remove();
    };
  }, [periodEndTime]);

  return isPeriodExpired(periodEnd, referenceDate);
}
