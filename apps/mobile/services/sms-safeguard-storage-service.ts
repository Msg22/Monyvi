import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";

const INSTALLATION_ID_KEY = "@monyvi/sms-scan/installation/v1";
const storageQueues = new Map<string, Promise<void>>();

export function getSmsSafeguardStorageUserId(userId: string): string {
  const normalizedUserId = userId.trim();
  const qaConfig = getSmsSafeguardQaConfig();
  if (!qaConfig.enabled) return normalizedUserId;
  if (qaConfig.profileId === null) {
    throw new Error("SMS safeguard QA requires a selected profile.");
  }
  const runId = qaConfig.runId ?? "current-run";
  return `${qaConfig.namespacePrefix}${qaConfig.profileId}:${runId}:${normalizedUserId}`;
}

export async function withSmsSafeguardStorageLock<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = storageQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  storageQueues.set(key, tail);

  try {
    return await run;
  } finally {
    if (storageQueues.get(key) === tail) {
      storageQueues.delete(key);
    }
  }
}

function isValidInstallationId(value: string | null): value is string {
  return value !== null && value.trim().length > 0 && value.length <= 160;
}

export async function getSmsScanInstallationId(): Promise<string> {
  return withSmsSafeguardStorageLock(INSTALLATION_ID_KEY, async () => {
    const stored = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
    if (isValidInstallationId(stored)) {
      return stored;
    }

    const installationId = Crypto.randomUUID();
    await AsyncStorage.setItem(INSTALLATION_ID_KEY, installationId);
    return installationId;
  });
}
