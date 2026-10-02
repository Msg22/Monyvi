import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import { withSmsSafeguardStorageLock } from "./sms-safeguard-storage-service";
import { assertExpectedCurrentUser } from "./user-data-access";

const STORE_SCHEMA_VERSION = 1;
const STORE_KEY_PREFIX = "@monyvi/sms-live/retry-request/v1";
export const LIVE_SMS_RETRY_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export const LIVE_SMS_RETRY_REQUEST_LIMIT = 64;

const retryEntrySchema = z
  .object({
    smsFingerprint: z.string().trim().min(1).max(256),
    requestKey: z.string().trim().min(1).max(160),
    expiresAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    updatedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const retryStoreSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    userId: z.string().trim().min(1),
    entries: z.array(retryEntrySchema).max(LIVE_SMS_RETRY_REQUEST_LIMIT),
  })
  .strict();

type LiveSmsRetryEntry = z.infer<typeof retryEntrySchema>;
type LiveSmsRetryStore = z.infer<typeof retryStoreSchema>;

interface RetryStoreLookupInput {
  readonly expectedUserId: string;
  readonly smsFingerprint: string;
  readonly nowMs?: number;
}

interface SaveRetryStoreInput extends RetryStoreLookupInput {
  readonly requestKey: string;
}

interface ClearRetryStoreUserInput {
  readonly expectedUserId: string;
}

function getStoreKey(userId: string): string {
  return `${STORE_KEY_PREFIX}/${encodeURIComponent(userId)}`;
}

function normalizedNow(nowMs?: number): number {
  const value = nowMs ?? Date.now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("INVALID_LIVE_SMS_RETRY_CLOCK");
  }
  return value;
}

function normalizeIdentity(value: string, errorCode: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(errorCode);
  return normalized;
}

function emptyStore(userId: string): LiveSmsRetryStore {
  return { schemaVersion: STORE_SCHEMA_VERSION, userId, entries: [] };
}

function pruneEntries(
  entries: readonly LiveSmsRetryEntry[],
  nowMs: number
): readonly LiveSmsRetryEntry[] {
  return [...entries]
    .filter((entry) => entry.expiresAtMs > nowMs)
    .sort((left, right) => {
      if (left.updatedAtMs !== right.updatedAtMs) {
        return left.updatedAtMs - right.updatedAtMs;
      }
      return left.smsFingerprint.localeCompare(right.smsFingerprint);
    })
    .slice(-LIVE_SMS_RETRY_REQUEST_LIMIT);
}

async function guardedGetItem(
  userId: string,
  key: string
): Promise<string | null> {
  await assertExpectedCurrentUser(userId);
  const value = await AsyncStorage.getItem(key);
  await assertExpectedCurrentUser(userId);
  return value;
}

async function guardedSetItem(
  userId: string,
  key: string,
  value: string
): Promise<void> {
  await assertExpectedCurrentUser(userId);
  await AsyncStorage.setItem(key, value);
  await assertExpectedCurrentUser(userId);
}

async function guardedRemoveItem(
  userId: string,
  key: string
): Promise<void> {
  await assertExpectedCurrentUser(userId);
  await AsyncStorage.removeItem(key);
  await assertExpectedCurrentUser(userId);
}

async function readStoreUnlocked(
  userId: string,
  nowMs: number
): Promise<LiveSmsRetryStore> {
  const key = getStoreKey(userId);
  const serialized = await guardedGetItem(userId, key);
  if (serialized === null) return emptyStore(userId);

  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized);
  } catch {
    await guardedRemoveItem(userId, key);
    return emptyStore(userId);
  }

  const parsed = retryStoreSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.userId !== userId) {
    await guardedRemoveItem(userId, key);
    return emptyStore(userId);
  }

  const entries = pruneEntries(parsed.data.entries, nowMs);
  if (entries.length !== parsed.data.entries.length) {
    await writeStoreUnlocked({ ...parsed.data, entries });
  }
  return { ...parsed.data, entries };
}

async function writeStoreUnlocked(store: LiveSmsRetryStore): Promise<void> {
  const key = getStoreKey(store.userId);
  if (store.entries.length === 0) {
    await guardedRemoveItem(store.userId, key);
    return;
  }
  await guardedSetItem(store.userId, key, JSON.stringify(store));
}

export async function loadLiveSmsRetryRequestKey(
  input: RetryStoreLookupInput
): Promise<string | null> {
  const userId = normalizeIdentity(
    input.expectedUserId,
    "INVALID_LIVE_SMS_RETRY_USER"
  );
  const smsFingerprint = normalizeIdentity(
    input.smsFingerprint,
    "INVALID_LIVE_SMS_RETRY_FINGERPRINT"
  );
  const nowMs = normalizedNow(input.nowMs);
  const key = getStoreKey(userId);

  return withSmsSafeguardStorageLock(key, async () => {
    const store = await readStoreUnlocked(userId, nowMs);
    return (
      store.entries.find(
        (entry) => entry.smsFingerprint === smsFingerprint
      )?.requestKey ?? null
    );
  });
}

export async function saveLiveSmsRetryRequestKey(
  input: SaveRetryStoreInput
): Promise<void> {
  const userId = normalizeIdentity(
    input.expectedUserId,
    "INVALID_LIVE_SMS_RETRY_USER"
  );
  const smsFingerprint = normalizeIdentity(
    input.smsFingerprint,
    "INVALID_LIVE_SMS_RETRY_FINGERPRINT"
  );
  const requestKey = normalizeIdentity(
    input.requestKey,
    "INVALID_LIVE_SMS_RETRY_REQUEST_KEY"
  );
  if (requestKey.length > 160) throw new Error("INVALID_LIVE_SMS_RETRY_REQUEST_KEY");
  const nowMs = normalizedNow(input.nowMs);
  const key = getStoreKey(userId);

  await withSmsSafeguardStorageLock(key, async () => {
    const store = await readStoreUnlocked(userId, nowMs);
    const entry: LiveSmsRetryEntry = {
      smsFingerprint,
      requestKey,
      expiresAtMs: nowMs + LIVE_SMS_RETRY_REQUEST_TTL_MS,
      updatedAtMs: nowMs,
    };
    const entries = pruneEntries(
      [
        ...store.entries.filter(
          (candidate) => candidate.smsFingerprint !== smsFingerprint
        ),
        entry,
      ],
      nowMs
    );
    await writeStoreUnlocked({ ...store, entries });
  });
}

export async function clearLiveSmsRetryRequestKey(
  input: RetryStoreLookupInput
): Promise<void> {
  const userId = normalizeIdentity(
    input.expectedUserId,
    "INVALID_LIVE_SMS_RETRY_USER"
  );
  const smsFingerprint = normalizeIdentity(
    input.smsFingerprint,
    "INVALID_LIVE_SMS_RETRY_FINGERPRINT"
  );
  const nowMs = normalizedNow(input.nowMs);
  const key = getStoreKey(userId);

  await withSmsSafeguardStorageLock(key, async () => {
    const store = await readStoreUnlocked(userId, nowMs);
    await writeStoreUnlocked({
      ...store,
      entries: store.entries.filter(
        (entry) => entry.smsFingerprint !== smsFingerprint
      ),
    });
  });
}

export async function clearLiveSmsRetryRequestsForUser(
  input: ClearRetryStoreUserInput
): Promise<void> {
  const userId = normalizeIdentity(
    input.expectedUserId,
    "INVALID_LIVE_SMS_RETRY_USER"
  );
  const key = getStoreKey(userId);
  await withSmsSafeguardStorageLock(key, () =>
    guardedRemoveItem(userId, key)
  );
}
