import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import { MARKET_RATE_PUBLICATION_CHECKPOINT_KEY } from "@/constants/storage-keys";
import type { MarketRateSnapshotCursor } from "./sync/market-rate-snapshot-pull";

const publicationCheckpointSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});

let checkpointQueue: Promise<void> = Promise.resolve();

export async function readMarketRatePublicationCheckpoint(): Promise<MarketRateSnapshotCursor | null> {
  return runWithCheckpointLock(readCheckpointWithoutLock);
}

export async function saveMarketRatePublicationCheckpoint(
  checkpoint: MarketRateSnapshotCursor
): Promise<void> {
  const validatedCheckpoint = publicationCheckpointSchema.parse(checkpoint);
  await runWithCheckpointLock(async (): Promise<void> => {
    const current = await readCheckpointWithoutLock();
    if (
      current !== null &&
      compareCheckpoints(current, validatedCheckpoint) >= 0
    ) {
      return;
    }
    await AsyncStorage.setItem(
      MARKET_RATE_PUBLICATION_CHECKPOINT_KEY,
      JSON.stringify(validatedCheckpoint)
    );
  });
}

async function readCheckpointWithoutLock(): Promise<MarketRateSnapshotCursor | null> {
  const stored = await AsyncStorage.getItem(
    MARKET_RATE_PUBLICATION_CHECKPOINT_KEY
  );
  if (stored === null) return null;

  try {
    return publicationCheckpointSchema.parse(JSON.parse(stored));
  } catch {
    await AsyncStorage.removeItem(MARKET_RATE_PUBLICATION_CHECKPOINT_KEY);
    return null;
  }
}

async function runWithCheckpointLock<T>(
  operation: () => Promise<T>
): Promise<T> {
  const run = checkpointQueue.catch(() => undefined).then(operation);
  checkpointQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function compareCheckpoints(
  left: MarketRateSnapshotCursor,
  right: MarketRateSnapshotCursor
): number {
  const timestampDifference =
    Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (timestampDifference !== 0) return timestampDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? 1 : -1;
}
