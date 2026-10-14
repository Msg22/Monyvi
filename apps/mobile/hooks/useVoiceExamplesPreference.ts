import { useCallback, useEffect, useRef, useState } from "react";

import {
  dismissVoiceExamples,
  readVoiceExamplesDismissed,
} from "@/services/voice-examples-preference-service";
import { logger } from "@/utils/logger";

interface PreferenceSnapshot {
  readonly userId: string | null;
  readonly isReady: boolean;
  readonly hasDismissed: boolean;
}

interface VoiceExamplesPreference {
  readonly isReady: boolean;
  readonly hasDismissed: boolean;
  readonly dismissExamples: () => Promise<void>;
}

export function useVoiceExamplesPreference(
  userId: string | null
): VoiceExamplesPreference {
  const actorRef = useRef(userId);
  actorRef.current = userId;
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const [snapshot, setSnapshot] = useState<PreferenceSnapshot>({
    userId: null,
    isReady: false,
    hasDismissed: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    const generation = ++generationRef.current;
    setSnapshot({ userId, isReady: false, hasDismissed: false });
    const isCurrent = (): boolean =>
      mountedRef.current &&
      generationRef.current === generation &&
      actorRef.current === userId;
    if (userId !== null) {
      void readVoiceExamplesDismissed(userId)
        .then((hasDismissed): void => {
          if (isCurrent()) setSnapshot({ userId, isReady: true, hasDismissed });
        })
        .catch((error: unknown): void => {
          if (!isCurrent()) return;
          logger.error("voice.examples.read.failed", error);
          setSnapshot({ userId, isReady: true, hasDismissed: false });
        });
    }
    return (): void => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, [userId]);

  const dismissExamples = useCallback(async (): Promise<void> => {
    if (userId === null || actorRef.current !== userId || !mountedRef.current)
      return;
    generationRef.current += 1;
    setSnapshot({ userId, isReady: true, hasDismissed: true });
    try {
      await dismissVoiceExamples(userId);
    } catch (error: unknown) {
      logger.error("voice.examples.dismiss.failed", error);
    }
  }, [userId]);

  // Actor identity gates the first render, before the effect can reset state.
  const isCurrentActor = userId !== null && snapshot.userId === userId;
  return {
    isReady: isCurrentActor && snapshot.isReady,
    hasDismissed: isCurrentActor && snapshot.hasDismissed,
    dismissExamples,
  };
}
