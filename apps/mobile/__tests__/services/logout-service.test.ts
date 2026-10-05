/**
 * @file logout-service.test.ts
 * @description Unit tests for the logout service (Facade for sync → session management).
 *
 * Mock strategy: inline factory pattern (mock infra defined inside jest.mock
 * factory) with __mocks re-export for typed access — same pattern as
 * sms-sync-service.test.ts.
 */

import type { Database } from "@nozbe/watermelondb";

// =============================================================================
// Mock: AsyncStorage
// =============================================================================

jest.mock("@react-native-async-storage/async-storage", () => {
  const getItem = jest.fn((): Promise<string | null> => Promise.resolve(null));
  const setItem = jest.fn((): Promise<void> => Promise.resolve());
  const removeItem = jest.fn((): Promise<void> => Promise.resolve());
  const multiRemove = jest.fn((): Promise<void> => Promise.resolve());
  return {
    __esModule: true,
    default: { getItem, setItem, removeItem, multiRemove },
    __mocks: { getItem, setItem, removeItem, multiRemove },
  };
});

interface AsyncStorageMocks {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  multiRemove: jest.Mock;
}

function getAsyncStorageMocks(): AsyncStorageMocks {
  return jest.requireMock<{ __mocks: AsyncStorageMocks }>(
    "@react-native-async-storage/async-storage"
  ).__mocks;
}

// =============================================================================
// Mock: NetInfo
// =============================================================================

jest.mock("@react-native-community/netinfo", () => {
  const fetchFn = jest.fn(() => Promise.resolve({ isConnected: true }));
  return {
    fetch: fetchFn,
    __mocks: { fetch: fetchFn },
  };
});

interface NetInfoMocks {
  fetch: jest.Mock;
}

function getNetInfoMocks(): NetInfoMocks {
  return jest.requireMock<{ __mocks: NetInfoMocks }>(
    "@react-native-community/netinfo"
  ).__mocks;
}

// =============================================================================
// Mock: sync.ts
// =============================================================================

jest.mock("@/services/sync", () => {
  const syncDatabase = jest.fn((): Promise<void> => Promise.resolve());
  const resetSyncState = jest.fn((): Promise<void> => Promise.resolve());
  const getActiveSyncPromise = jest.fn((): Promise<void> | null => null);
  return {
    syncDatabase,
    resetSyncState,
    getActiveSyncPromise,
    __mocks: { syncDatabase, resetSyncState, getActiveSyncPromise },
  };
});

interface SyncMocks {
  syncDatabase: jest.Mock;
  resetSyncState: jest.Mock;
  getActiveSyncPromise: jest.Mock;
}

function getSyncMocks(): SyncMocks {
  return jest.requireMock<{ __mocks: SyncMocks }>("@/services/sync").__mocks;
}

// =============================================================================
// Mock: supabase
// =============================================================================

jest.mock("@/services/supabase", () => {
  const signOut = jest.fn(() => Promise.resolve({ error: null }));
  const coordinatedSignOut = jest.fn(() => Promise.resolve({ error: null }));
  return {
    coordinatedSignOut,
    supabase: { auth: { signOut } },
    __mocks: { signOut, coordinatedSignOut },
  };
});

jest.mock("@/services/sms-live-detection-handler", () => {
  const setAutoConfirm = jest.fn(() => Promise.resolve());
  const setLiveDetectionEnabled = jest.fn(() => Promise.resolve());
  return {
    setAutoConfirm,
    setLiveDetectionEnabled,
    __mocks: { setAutoConfirm, setLiveDetectionEnabled },
  };
});

jest.mock("@/services/sms-live-listener-service", () => {
  const stopSmsListener = jest.fn();
  return {
    stopSmsListener,
    __mocks: { stopSmsListener },
  };
});

interface SupabaseMocks {
  signOut: jest.Mock<Promise<{ readonly error: Error | null }>, []>;
  coordinatedSignOut: jest.Mock<Promise<{ readonly error: Error | null }>, []>;
}

function getSupabaseMocks(): SupabaseMocks {
  return jest.requireMock<{ __mocks: SupabaseMocks }>("@/services/supabase")
    .__mocks;
}

interface SmsLiveDetectionMocks {
  setAutoConfirm: jest.Mock;
  setLiveDetectionEnabled: jest.Mock;
}

function getSmsLiveDetectionMocks(): SmsLiveDetectionMocks {
  return jest.requireMock<{ __mocks: SmsLiveDetectionMocks }>(
    "@/services/sms-live-detection-handler"
  ).__mocks;
}

interface SmsLiveListenerMocks {
  stopSmsListener: jest.Mock;
}

function getSmsLiveListenerMocks(): SmsLiveListenerMocks {
  return jest.requireMock<{ __mocks: SmsLiveListenerMocks }>(
    "@/services/sms-live-listener-service"
  ).__mocks;
}

// =============================================================================
// Import module under test (after mocks)
// =============================================================================

import { performLogout } from "@/services/logout-service";

// =============================================================================
// Helpers
// =============================================================================

function createMockDatabase(): Database {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Database is a complex class; empty stub is sufficient for unit tests
  return {} as Database;
}

// =============================================================================
// Tests
// =============================================================================

describe("logout-service", () => {
  let db: Database;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createMockDatabase();

    // Restore default mock implementations after clearAllMocks wipes factory defaults
    const asyncMocks = getAsyncStorageMocks();
    const netInfoMocks = getNetInfoMocks();
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();
    const smsDetectionMocks = getSmsLiveDetectionMocks();
    const smsListenerMocks = getSmsLiveListenerMocks();

    asyncMocks.getItem.mockResolvedValue(null);
    asyncMocks.setItem.mockResolvedValue(undefined);
    asyncMocks.removeItem.mockResolvedValue(undefined);
    asyncMocks.multiRemove.mockResolvedValue(undefined);
    netInfoMocks.fetch.mockResolvedValue({ isConnected: true });
    syncMocks.syncDatabase.mockResolvedValue(undefined);
    syncMocks.resetSyncState.mockResolvedValue(undefined);
    syncMocks.getActiveSyncPromise.mockReturnValue(null);
    supaMocks.signOut.mockResolvedValue({ error: null });
    supaMocks.coordinatedSignOut.mockResolvedValue({ error: null });
    smsDetectionMocks.setLiveDetectionEnabled.mockResolvedValue(undefined);
    smsDetectionMocks.setAutoConfirm.mockResolvedValue(undefined);
    smsListenerMocks.stopSmsListener.mockReturnValue(undefined);
  });

  // =========================================================================
  // Test 1: Happy path — sync before session cleanup (correct order)
  // =========================================================================
  it("should complete full logout sequence in correct order", async () => {
    const callOrder: string[] = [];
    const asyncMocks = getAsyncStorageMocks();
    const netInfoMocks = getNetInfoMocks();
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();
    const smsDetectionMocks = getSmsLiveDetectionMocks();
    const smsListenerMocks = getSmsLiveListenerMocks();

    netInfoMocks.fetch.mockImplementation(() => {
      callOrder.push("networkCheck");
      return Promise.resolve({ isConnected: true });
    });
    syncMocks.syncDatabase.mockImplementation(() => {
      callOrder.push("sync");
      return Promise.resolve();
    });
    smsListenerMocks.stopSmsListener.mockImplementation(() => {
      callOrder.push("stopSmsListener");
    });
    smsDetectionMocks.setLiveDetectionEnabled.mockImplementation(() => {
      callOrder.push("setLiveDetectionEnabled");
      return Promise.resolve();
    });
    smsDetectionMocks.setAutoConfirm.mockImplementation(() => {
      callOrder.push("setAutoConfirm");
      return Promise.resolve();
    });
    supaMocks.signOut.mockImplementation(() => {
      callOrder.push("rawSignOut");
      return Promise.resolve({ error: null });
    });
    supaMocks.coordinatedSignOut.mockImplementation(() => {
      callOrder.push("signOut");
      return Promise.resolve({ error: null });
    });

    const result = await performLogout(db);

    expect(result).toEqual({ success: true });
    expect(callOrder).toEqual([
      "networkCheck",
      "sync",
      "stopSmsListener",
      "setLiveDetectionEnabled",
      "setAutoConfirm",
      "signOut",
    ]);
    expect(smsDetectionMocks.setLiveDetectionEnabled).toHaveBeenCalledWith(
      false
    );
    expect(smsDetectionMocks.setAutoConfirm).toHaveBeenCalledWith(false);
    expect(callOrder.indexOf("stopSmsListener")).toBeLessThan(
      callOrder.indexOf("signOut")
    );
    expect(supaMocks.coordinatedSignOut).toHaveBeenCalledTimes(1);
    expect(supaMocks.signOut).not.toHaveBeenCalled();
    expect(asyncMocks.setItem).not.toHaveBeenCalled();
    expect(asyncMocks.removeItem).not.toHaveBeenCalled();
  });

  it("routes explicit session destruction through coordinated sign-out", async () => {
    const supaMocks = getSupabaseMocks();

    const result = await performLogout(db, true);

    expect(result).toEqual({ success: true });
    expect(supaMocks.coordinatedSignOut).toHaveBeenCalledTimes(1);
    expect(supaMocks.signOut).not.toHaveBeenCalled();
  });

  it("should continue logout when disabling live SMS automation fails", async () => {
    const smsDetectionMocks = getSmsLiveDetectionMocks();
    const supaMocks = getSupabaseMocks();

    smsDetectionMocks.setLiveDetectionEnabled.mockRejectedValue(
      new Error("AsyncStorage failed")
    );

    const result = await performLogout(db, true);

    expect(result).toEqual({ success: true });
    expect(supaMocks.coordinatedSignOut).toHaveBeenCalledTimes(1);
    expect(supaMocks.signOut).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test 2: Network check — offline error (FR-009)
  // =========================================================================
  it("should return no_network error when device is offline", async () => {
    const netInfoMocks = getNetInfoMocks();
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();
    netInfoMocks.fetch.mockResolvedValue({ isConnected: false });

    const result = await performLogout(db);

    expect(result).toEqual({ success: false, error: "no_network" });
    expect(syncMocks.syncDatabase).not.toHaveBeenCalled();
    expect(syncMocks.resetSyncState).not.toHaveBeenCalled();
    expect(supaMocks.signOut).not.toHaveBeenCalled();
    expect(supaMocks.coordinatedSignOut).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test 3: Sync retry — first fails, retry succeeds (FR-013)
  // =========================================================================
  it("should retry sync once and succeed on second attempt", async () => {
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();
    let callCount = 0;
    syncMocks.syncDatabase.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network timeout"));
      }
      return Promise.resolve();
    });

    const result = await performLogout(db);

    expect(result).toEqual({ success: true });
    expect(syncMocks.syncDatabase).toHaveBeenCalledTimes(2);
    expect(supaMocks.coordinatedSignOut).toHaveBeenCalledTimes(1);
    expect(supaMocks.signOut).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test 4: Sync failure after retry — returns sync_failed (FR-013)
  // =========================================================================
  it("should return sync_failed when both sync attempts fail", async () => {
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();

    syncMocks.syncDatabase.mockRejectedValue(new Error("Server unreachable"));

    const result = await performLogout(db);

    expect(result).toEqual({ success: false, error: "sync_failed" });
    expect(syncMocks.syncDatabase).toHaveBeenCalledTimes(2);
    expect(syncMocks.resetSyncState).not.toHaveBeenCalled();
    expect(supaMocks.signOut).not.toHaveBeenCalled();
    expect(supaMocks.coordinatedSignOut).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test 5: Force-proceed — skips sync (post-warning flow)
  // =========================================================================
  it("should skip sync and proceed with session cleanup when forceSkipSync is true", async () => {
    const netInfoMocks = getNetInfoMocks();
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();

    const result = await performLogout(db, true);

    expect(result).toEqual({ success: true });
    expect(netInfoMocks.fetch).not.toHaveBeenCalled();
    expect(syncMocks.syncDatabase).not.toHaveBeenCalled();
    expect(syncMocks.resetSyncState).not.toHaveBeenCalled();
    expect(supaMocks.coordinatedSignOut).toHaveBeenCalledTimes(1);
    expect(supaMocks.signOut).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test 6: AsyncStorage cleanup — local user data is preserved on logout
  // =========================================================================
  it("should not clear user-specific local storage keys", async () => {
    const asyncMocks = getAsyncStorageMocks();

    const result = await performLogout(db);

    expect(result).toEqual({ success: true });
    expect(asyncMocks.multiRemove).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test 7: Session cleanup failure is reported
  // =========================================================================
  it("should report unknown when session cleanup fails", async () => {
    const syncMocks = getSyncMocks();
    const supaMocks = getSupabaseMocks();

    supaMocks.coordinatedSignOut.mockRejectedValue(
      new Error("Sign out failed")
    );

    const result = await performLogout(db);

    expect(result).toEqual({ success: false, error: "unknown" });
    expect(syncMocks.resetSyncState).not.toHaveBeenCalled();
  });

  it("should report unknown when signOut resolves with an error", async () => {
    const supaMocks = getSupabaseMocks();

    supaMocks.coordinatedSignOut.mockResolvedValue({
      error: new Error("Sign out failed"),
    });

    const result = await performLogout(db);

    expect(result).toEqual({ success: false, error: "unknown" });
  });

  // =========================================================================
  // Test 9: Awaits active sync before triggering new one
  // =========================================================================
  it("should await active sync promise before triggering a new sync", async () => {
    const syncMocks = getSyncMocks();
    const callOrder: string[] = [];

    const activeSyncPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        callOrder.push("activeSyncDone");
        resolve();
      }, 10);
    });
    syncMocks.getActiveSyncPromise.mockReturnValue(activeSyncPromise);
    syncMocks.syncDatabase.mockImplementation(() => {
      callOrder.push("newSync");
      return Promise.resolve();
    });

    const result = await performLogout(db);

    expect(result).toEqual({ success: true });
    expect(callOrder).toEqual(["activeSyncDone", "newSync"]);
  });

  it("should clear the active sync timeout when the active sync wins the race", async () => {
    jest.useFakeTimers();
    const syncMocks = getSyncMocks();
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

    syncMocks.getActiveSyncPromise.mockReturnValue(Promise.resolve());
    syncMocks.syncDatabase.mockResolvedValue(undefined);

    const result = await performLogout(db);

    expect(result).toEqual({ success: true });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  // =========================================================================
  // Test 10: Times out when active sync never resolves
  // =========================================================================
  it("should time out if active sync promise never resolves and proceed to fresh sync", async () => {
    jest.useFakeTimers();
    const syncMocks = getSyncMocks();
    const netInfoMocks = getNetInfoMocks();

    netInfoMocks.fetch.mockResolvedValue({ isConnected: true });

    // A promise that never resolves (simulates a hung sync)
    const neverResolvingPromise = new Promise<void>(() => {});
    syncMocks.getActiveSyncPromise.mockReturnValue(neverResolvingPromise);
    syncMocks.syncDatabase.mockResolvedValue(undefined);

    const logoutPromise = performLogout(db);

    // Advance past the 10s active sync timeout and flush microtasks
    await jest.advanceTimersByTimeAsync(10_000);

    const result = await logoutPromise;

    expect(result).toEqual({ success: true });
    expect(syncMocks.syncDatabase).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
