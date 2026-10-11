import { useEffect, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

import {
  readReducedMotion,
  subscribeReducedMotion,
} from "@/services/reduced-motion-service";
import { logger } from "@/utils/logger";

/** Reanimated's startup snapshot plus live system accessibility changes. */
export function useReactiveReducedMotion(): boolean {
  const startupValue = useReducedMotion();
  const [hasReducedMotion, setHasReducedMotion] = useState(startupValue);
  useEffect(() => {
    let isMounted = true;
    let hasReceivedChange = false;
    const unsubscribe = subscribeReducedMotion((enabled): void => {
      hasReceivedChange = true;
      if (isMounted) setHasReducedMotion(enabled);
    });
    void readReducedMotion()
      .then((enabled): void => {
        if (isMounted && !hasReceivedChange) setHasReducedMotion(enabled);
      })
      .catch((error: unknown): void => {
        logger.error("accessibility.reducedMotionRead.failed", error);
      });
    return (): void => {
      isMounted = false;
      unsubscribe();
    };
  }, []);
  return hasReducedMotion;
}
