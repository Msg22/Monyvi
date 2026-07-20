import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import {
  getSmsScanInstallationId,
  getSmsSafeguardStorageUserId,
  withSmsSafeguardStorageLock,
} from "./sms-safeguard-storage-service";

const STORE_SCHEMA_VERSION = 1;
const STORE_KEY_PREFIX = "@monyvi/sms-scan/oversized/v1";
const DAY_MS = 24 * 60 * 60 * 1000;
export const SMS_OVERSIZED_OUTCOME_LIMIT = 1000;

const oversizedOutcomeSchema = z
  .object({
    smsFingerprint: z.string().trim().min(1),
    originalReceivedAtMs: z.number().int().nonnegative().finite(),
    reason: z.literal("candidate_too_large"),
    recordedAtMs: z.number().int().nonnegative().finite(),
  })
  .strict();

const oversizedStoreSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    userId: z.string().trim().min(1),
    installationId: z.string().trim().min(1),
    outcomes: z.array(oversizedOutcomeSchema),
  })
  .strict();

interface OversizedSmsOutcome {
  readonly smsFingerprint: string;
  readonly originalReceivedAtMs: number;
  readonly reason: "candidate_too_large";
  readonly recordedAtMs: number;
}

interface OversizedStore {
  readonly schemaVersion: 1;
  readonly userId: string;
  readonly installationId: string;
  readonly outcomes: readonly OversizedSmsOutcome[];
}

interface OversizedStoreContext {
  readonly userId: string;
  readonly nowMs: number;
  readonly lookbackDays: number;
}

interface RecordOversizedSmsOutcomeInput extends OversizedStoreContext {
  readonly smsFingerprint: string;
  readonly originalReceivedAtMs: number;
}

function getStoreKey(userId: string): string {
  return `${STORE_KEY_PREFIX}/${encodeURIComponent(userId)}`;
}

function rollingBoundary(input: OversizedStoreContext): number {
  return input.nowMs - input.lookbackDays * DAY_MS;
}

function pruneOutcomes(
  outcomes: readonly OversizedSmsOutcome[],
  input: OversizedStoreContext
): readonly OversizedSmsOutcome[] {
  return [...outcomes]
    .filter((outcome) => outcome.originalReceivedAtMs >= rollingBoundary(input))
    .sort((left, right) => {
      if (left.originalReceivedAtMs !== right.originalReceivedAtMs) {
        return left.originalReceivedAtMs - right.originalReceivedAtMs;
      }
      return left.smsFingerprint.localeCompare(right.smsFingerprint);
    })
    .slice(-SMS_OVERSIZED_OUTCOME_LIMIT);
}

async function readStoreUnlocked(
  input: OversizedStoreContext,
  installationId: string
): Promise<OversizedStore> {
  const key = getStoreKey(input.userId);
  const serialized = await AsyncStorage.getItem(key);
  if (serialized === null) {
    return {
      schemaVersion: STORE_SCHEMA_VERSION,
      userId: input.userId,
      installationId,
      outcomes: [],
    };
  }

  try {
    const parsed = oversizedStoreSchema.safeParse(JSON.parse(serialized));
    if (
      !parsed.success ||
      parsed.data.userId !== input.userId ||
      parsed.data.installationId !== installationId
    ) {
      await AsyncStorage.removeItem(key);
      return {
        schemaVersion: STORE_SCHEMA_VERSION,
        userId: input.userId,
        installationId,
        outcomes: [],
      };
    }
    return parsed.data;
  } catch {
    await AsyncStorage.removeItem(key);
    return {
      schemaVersion: STORE_SCHEMA_VERSION,
      userId: input.userId,
      installationId,
      outcomes: [],
    };
  }
}

function assertStoreContext(input: OversizedStoreContext): void {
  if (
    input.userId.trim().length === 0 ||
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs < 0 ||
    !Number.isSafeInteger(input.lookbackDays) ||
    input.lookbackDays <= 0
  ) {
    throw new Error("INVALID_SMS_OVERSIZED_STORE_CONTEXT");
  }
}

export async function recordOversizedSmsOutcome(
  input: RecordOversizedSmsOutcomeInput
): Promise<void> {
  assertStoreContext(input);
  const smsFingerprint = input.smsFingerprint.trim();
  if (
    smsFingerprint.length === 0 ||
    !Number.isSafeInteger(input.originalReceivedAtMs) ||
    input.originalReceivedAtMs < 0 ||
    input.originalReceivedAtMs > input.nowMs
  ) {
    throw new Error("INVALID_SMS_OVERSIZED_OUTCOME");
  }

  const userId = getSmsSafeguardStorageUserId(input.userId);
  const normalizedInput = { ...input, userId };
  const installationId = await getSmsScanInstallationId();
  const key = getStoreKey(userId);
  await withSmsSafeguardStorageLock(key, async () => {
    const store = await readStoreUnlocked(normalizedInput, installationId);
    const existing = store.outcomes.find(
      (outcome) => outcome.smsFingerprint === smsFingerprint
    );
    const nextOutcome: OversizedSmsOutcome = {
      smsFingerprint,
      originalReceivedAtMs: Math.min(
        existing?.originalReceivedAtMs ?? input.originalReceivedAtMs,
        input.originalReceivedAtMs
      ),
      reason: "candidate_too_large",
      recordedAtMs: input.nowMs,
    };
    const outcomes = pruneOutcomes(
      [
        ...store.outcomes.filter(
          (outcome) => outcome.smsFingerprint !== smsFingerprint
        ),
        nextOutcome,
      ],
      normalizedInput
    );

    await AsyncStorage.setItem(
      key,
      JSON.stringify({ ...store, outcomes } satisfies OversizedStore)
    );
  });
}

export async function getOversizedSmsFingerprints(
  input: OversizedStoreContext
): Promise<ReadonlySet<string>> {
  assertStoreContext(input);
  const userId = getSmsSafeguardStorageUserId(input.userId);
  const normalizedInput = { ...input, userId };
  const installationId = await getSmsScanInstallationId();
  const key = getStoreKey(userId);
  return withSmsSafeguardStorageLock(key, async () => {
    const store = await readStoreUnlocked(normalizedInput, installationId);
    const outcomes = pruneOutcomes(store.outcomes, normalizedInput);
    if (outcomes.length !== store.outcomes.length) {
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ ...store, outcomes } satisfies OversizedStore)
      );
    }
    return new Set(outcomes.map((outcome) => outcome.smsFingerprint));
  });
}

export async function clearOversizedSmsOutcomes(userId: string): Promise<void> {
  await AsyncStorage.removeItem(
    getStoreKey(getSmsSafeguardStorageUserId(userId))
  );
}
