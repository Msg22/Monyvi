import type { Database } from "@nozbe/watermelondb";
import type { SyncPullResult } from "@nozbe/watermelondb/sync";

const mockSynchronize = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockPullChanges = jest.fn();
const mockPushChanges = jest.fn();

jest.mock("@nozbe/watermelondb/sync", () => ({
  synchronize: (input: unknown): Promise<void> =>
    mockSynchronize(input) as Promise<void>,
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
}));

jest.mock("../../services/sync/pull-strategies", () => ({
  pullChanges: (...args: readonly unknown[]): Promise<SyncPullResult> =>
    mockPullChanges(...args) as Promise<SyncPullResult>,
}));

jest.mock("../../services/sync/push-service", () => ({
  pushChanges: (...args: readonly unknown[]): Promise<unknown> =>
    mockPushChanges(...args) as Promise<unknown>,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { syncDatabase } from "../../services/sync";

type StandardSyncPullResult = Extract<
  SyncPullResult,
  { readonly timestamp: number }
>;

interface SynchronizeCallbacks {
  readonly pullChanges: (input: {
    readonly lastPulledAt: number | null;
  }) => Promise<StandardSyncPullResult>;
}

interface OwnerMarkerHarness {
  readonly database: Database;
  readonly getOwner: () => string | undefined;
  readonly getLocal: jest.Mock;
  readonly setLocal: jest.Mock;
}

interface DeferredMarkerWrite {
  readonly release: () => void;
  readonly started: Promise<void>;
}

const USER_A = "user-a";
const USER_B = "user-b";
const USER_C = "user-c";
const INITIAL_WATERMARK = 1_700_000_000_000;
const NEXT_WATERMARK = 1_700_000_100_000;

function createOwnerMarkerHarness(
  initialOwner?: string
): OwnerMarkerHarness {
  let owner = initialOwner;
  const getLocal = jest.fn((): Promise<string | undefined> =>
    Promise.resolve(owner)
  );
  const setLocal = jest.fn(
    (_key: string, value: string): Promise<void> => {
      owner = value;
      return Promise.resolve();
    }
  );
  const database = {
    adapter: { getLocal, setLocal },
  } as unknown as Database;
  return { database, getOwner: (): string | undefined => owner, getLocal, setLocal };
}

function successfulPull(
  changes: StandardSyncPullResult["changes"] = {}
): StandardSyncPullResult {
  return { changes, timestamp: NEXT_WATERMARK };
}

function getUpdatedRows(
  result: StandardSyncPullResult,
  table: string
): readonly Record<string, unknown>[] {
  const changes = result.changes as unknown as Record<
    string,
    { readonly updated?: readonly Record<string, unknown>[] }
  >;
  return changes[table]?.updated ?? [];
}

function deferMarkerWrite(harness: OwnerMarkerHarness): DeferredMarkerWrite {
  let resolveStarted: () => void = () => undefined;
  let resolveWrite: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const write = new Promise<void>((resolve) => {
    resolveWrite = resolve;
  });

  harness.setLocal.mockImplementationOnce((): Promise<void> => {
    resolveStarted();
    return write;
  });

  return { started, release: resolveWrite };
}

describe("sync owner watermark lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue(USER_B);
    mockPullChanges.mockResolvedValue(successfulPull());
    mockPushChanges.mockResolvedValue(undefined);
  });

  it("full-pulls when the persisted sync owner differs and marks the new owner only after success", async () => {
    const harness = createOwnerMarkerHarness(USER_A);
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        await callbacks.pullChanges({ lastPulledAt: INITIAL_WATERMARK });
      }
    );

    await expect(syncDatabase(harness.database)).resolves.toBeUndefined();

    expect(mockPullChanges).toHaveBeenCalledWith(null, USER_B);
    expect(harness.getOwner()).toBe(USER_B);
    expect(harness.setLocal).toHaveBeenCalledTimes(1);
  });

  it("rejects auth switching after pull application and leaves the prior owner marker", async () => {
    const harness = createOwnerMarkerHarness(USER_A);
    let globalWatermark = INITIAL_WATERMARK;
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        const pullResult = await callbacks.pullChanges({
          lastPulledAt: globalWatermark,
        });
        globalWatermark = pullResult.timestamp;
        mockGetCurrentUserId.mockResolvedValue(USER_C);
      }
    );

    await expect(syncDatabase(harness.database)).rejects.toThrow(
      "sync_auth_scope_lost"
    );

    expect(globalWatermark).toBe(NEXT_WATERMARK);
    expect(harness.getOwner()).toBe(USER_A);
    expect(harness.setLocal).not.toHaveBeenCalled();
  });

  it("full-pulls the next user even when Watermelon advanced its global timestamp", async () => {
    const harness = createOwnerMarkerHarness(USER_A);
    const olderUserRow = { id: "older-user-b-row", user_id: USER_B };
    let appliedRows: readonly Record<string, unknown>[] = [];
    mockPullChanges.mockImplementation(
      (lastPulledAt: number | null): Promise<StandardSyncPullResult> =>
        Promise.resolve(
          successfulPull({
            profiles: {
              created: [],
              updated: lastPulledAt === null ? [olderUserRow] : [],
              deleted: [],
            },
          })
        )
    );
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        const result = await callbacks.pullChanges({
          lastPulledAt: NEXT_WATERMARK,
        });
        appliedRows = getUpdatedRows(result, "profiles");
      }
    );

    await expect(syncDatabase(harness.database)).resolves.toBeUndefined();

    expect(appliedRows).toEqual([olderUserRow]);
    expect(mockPullChanges).toHaveBeenCalledWith(null, USER_B);
    expect(harness.getOwner()).toBe(USER_B);
  });

  it("keeps same-owner synchronization incremental", async () => {
    const harness = createOwnerMarkerHarness(USER_B);
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        await callbacks.pullChanges({ lastPulledAt: INITIAL_WATERMARK });
      }
    );

    await expect(syncDatabase(harness.database)).resolves.toBeUndefined();

    expect(mockPullChanges).toHaveBeenCalledWith(INITIAL_WATERMARK, USER_B);
    expect(harness.getOwner()).toBe(USER_B);
  });

  it("rejects shared callers when auth switches during the owner marker write", async () => {
    const harness = createOwnerMarkerHarness(USER_A);
    const deferredMarkerWrite = deferMarkerWrite(harness);
    mockGetCurrentUserId.mockResolvedValue(USER_A);
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        await callbacks.pullChanges({ lastPulledAt: INITIAL_WATERMARK });
      }
    );

    const userASync = syncDatabase(harness.database);
    await deferredMarkerWrite.started;

    mockGetCurrentUserId.mockResolvedValue(USER_B);
    const sharedUserBSync = syncDatabase(harness.database);
    deferredMarkerWrite.release();

    await expect(userASync).rejects.toThrow("sync_auth_scope_lost");
    await expect(sharedUserBSync).rejects.toThrow("sync_auth_scope_lost");
    expect(harness.getOwner()).toBe(USER_A);
    expect(mockSynchronize).toHaveBeenCalledTimes(1);

    await expect(syncDatabase(harness.database)).resolves.toBeUndefined();

    expect(mockPullChanges).toHaveBeenLastCalledWith(null, USER_B);
    expect(harness.getOwner()).toBe(USER_B);
  });

  it("keeps a missing marker missing after failure and full-pulls the retry", async () => {
    const harness = createOwnerMarkerHarness();
    mockSynchronize.mockRejectedValueOnce(new Error("apply_failed"));

    await expect(syncDatabase(harness.database)).rejects.toThrow(
      "apply_failed"
    );
    expect(harness.getOwner()).toBeUndefined();
    expect(harness.setLocal).not.toHaveBeenCalled();

    mockSynchronize.mockImplementationOnce(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        await callbacks.pullChanges({ lastPulledAt: INITIAL_WATERMARK });
      }
    );
    await expect(syncDatabase(harness.database)).resolves.toBeUndefined();

    expect(mockPullChanges).toHaveBeenLastCalledWith(null, USER_B);
    expect(harness.getOwner()).toBe(USER_B);
  });
});
