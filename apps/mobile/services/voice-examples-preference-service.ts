import AsyncStorage from "@react-native-async-storage/async-storage";

import { logger } from "@/utils/logger";

const VOICE_EXAMPLES_DISMISSED_PREFIX = "monyvi.voice.examples.dismissed:";

function preferenceKey(userId: string): string {
  return `${VOICE_EXAMPLES_DISMISSED_PREFIX}${encodeURIComponent(userId)}`;
}

export async function readVoiceExamplesDismissed(
  userId: string
): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(preferenceKey(userId))) === "true";
  } catch (error: unknown) {
    logger.error("voice.examples.read.failed", error);
    return false;
  }
}

/** A failed write rejects so callers never mistake an in-memory hide for durability. */
export async function dismissVoiceExamples(userId: string): Promise<void> {
  await AsyncStorage.setItem(preferenceKey(userId), "true");
}
