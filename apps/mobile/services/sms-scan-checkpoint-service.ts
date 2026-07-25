import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import {
  getSmsScanInstallationId,
  getSmsSafeguardStorageUserId,
  withSmsSafeguardStorageLock,
} from "./sms-safeguard-storage-service";

const CHECKPOINT_SCHEMA_VERSION = 1;
const CHECKPOINT_KEY_PREFIX = "@monyvi/sms-scan/checkpoint/v1";

const smsScanCheckpointSchema = z
  .object({
    schemaVersion: z.literal(CHECKPOINT_SCHEMA_VERSION),
    processingPolicyVersion: z.number().int().positive(),
    userId: z.string().trim().min(1),
    installationId: z.string().trim().min(1),
    boundaryReceivedAtMs: z.number().int().nonnegative().finite(),
    boundaryFingerprint: z.string().trim().min(1),
    updatedAtMs: z.number().int().nonnegative().finite(),
  })
  .strict();

export interface SmsScanCheckpoint {
  readonly schemaVersion: 1;
  readonly processingPolicyVersion: number;
  readonly userId: string;
  readonly installationId: string;
  readonly boundaryReceivedAtMs: number;
  readonly boundaryFingerprint: string;
  readonly updatedAtMs: number;
}

interface LoadSmsScanCheckpointInput {
  readonly userId: string;
  readonly processingPolicyVersion: number;
  readonly nowMs: number;
}

interface SaveSmsScanCheckpointInput extends LoadSmsScanCheckpointInput {
  readonly boundaryReceivedAtMs: number;
  readonly boundaryFingerprint: string;
}

function getCheckpointKey(userId: string): string {
  return `${CHECKPOINT_KEY_PREFIX}/${encodeURIComponent(userId)}`;
}

function isValidClock(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

async function readCheckpointUnlocked(
  input: LoadSmsScanCheckpointInput,
  installationId: string
): Promise<SmsScanCheckpoint | null> {
  const key = getCheckpointKey(input.userId);
  const serialized = await AsyncStorage.getItem(key);
  if (serialized === null) return null;

  try {
    const parsed = smsScanCheckpointSchema.safeParse(JSON.parse(serialized));
    if (
      !parsed.success ||
      parsed.data.userId !== input.userId ||
      parsed.data.installationId !== installationId ||
      parsed.data.processingPolicyVersion !== input.processingPolicyVersion ||
      parsed.data.boundaryReceivedAtMs > input.nowMs ||
      parsed.data.updatedAtMs > input.nowMs
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export { getSmsScanInstallationId };

export async function loadSmsScanCheckpoint(
  input: LoadSmsScanCheckpointInput
): Promise<SmsScanCheckpoint | null> {
  if (!isValidClock(input.nowMs) || input.userId.trim().length === 0) {
    return null;
  }
  const scopedUserId = getSmsSafeguardStorageUserId(input.userId);
  const installationId = await getSmsScanInstallationId();
  const key = getCheckpointKey(scopedUserId);
  return withSmsSafeguardStorageLock(key, () =>
    readCheckpointUnlocked({ ...input, userId: scopedUserId }, installationId)
  );
}

function compareCheckpointPosition(
  left: Pick<SmsScanCheckpoint, "boundaryReceivedAtMs" | "boundaryFingerprint">,
  right: Pick<SmsScanCheckpoint, "boundaryReceivedAtMs" | "boundaryFingerprint">
): number {
  if (left.boundaryReceivedAtMs !== right.boundaryReceivedAtMs) {
    return left.boundaryReceivedAtMs - right.boundaryReceivedAtMs;
  }
  return left.boundaryFingerprint.localeCompare(right.boundaryFingerprint);
}

export async function saveSmsScanCheckpoint(
  input: SaveSmsScanCheckpointInput
): Promise<SmsScanCheckpoint> {
  const userId = getSmsSafeguardStorageUserId(input.userId);
  const boundaryFingerprint = input.boundaryFingerprint.trim();
  if (
    userId.length === 0 ||
    boundaryFingerprint.length === 0 ||
    !isValidClock(input.nowMs) ||
    !isValidClock(input.boundaryReceivedAtMs) ||
    input.boundaryReceivedAtMs > input.nowMs ||
    !Number.isSafeInteger(input.processingPolicyVersion) ||
    input.processingPolicyVersion <= 0
  ) {
    throw new Error("INVALID_SMS_SCAN_CHECKPOINT");
  }

  const installationId = await getSmsScanInstallationId();
  const key = getCheckpointKey(userId);
  return withSmsSafeguardStorageLock(key, async () => {
    const normalizedInput = { ...input, userId };
    const existing = await readCheckpointUnlocked(
      normalizedInput,
      installationId
    );
    const candidate: SmsScanCheckpoint = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      processingPolicyVersion: input.processingPolicyVersion,
      userId,
      installationId,
      boundaryReceivedAtMs: input.boundaryReceivedAtMs,
      boundaryFingerprint,
      updatedAtMs: input.nowMs,
    };
    const next =
      existing !== null && compareCheckpointPosition(existing, candidate) >= 0
        ? existing
        : candidate;

    if (next === candidate) {
      await AsyncStorage.setItem(key, JSON.stringify(candidate));
    }
    return next;
  });
}

export async function clearSmsScanCheckpoint(userId: string): Promise<void> {
  await AsyncStorage.removeItem(
    getCheckpointKey(getSmsSafeguardStorageUserId(userId))
  );
}
