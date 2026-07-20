import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getSmsScanInstallationId,
  loadSmsScanCheckpoint,
  saveSmsScanCheckpoint,
} from "@/services/sms-scan-checkpoint-service";

jest.mock("@react-native-async-storage/async-storage");
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "install-1") }));

const storage = new Map<string, string>();

describe("sms-scan-checkpoint-service", () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(storage.get(key) ?? null)
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      (key: string, value: string) => {
        storage.set(key, value);
        return Promise.resolve();
      }
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    });
  });

  it("creates and reuses one installation identity", async () => {
    await expect(getSmsScanInstallationId()).resolves.toBe("install-1");
    await expect(getSmsScanInstallationId()).resolves.toBe("install-1");
  });

  it("keeps checkpoints separated by user", async () => {
    await saveSmsScanCheckpoint({
      userId: "user-a",
      processingPolicyVersion: 1,
      boundaryReceivedAtMs: 1_000,
      boundaryFingerprint: "fingerprint-a",
      nowMs: 2_000,
    });

    await expect(
      loadSmsScanCheckpoint({
        userId: "user-b",
        processingPolicyVersion: 1,
        nowMs: 2_000,
      })
    ).resolves.toBeNull();
  });

  it("invalidates an incompatible processing policy", async () => {
    await saveSmsScanCheckpoint({
      userId: "user-a",
      processingPolicyVersion: 1,
      boundaryReceivedAtMs: 1_000,
      boundaryFingerprint: "fingerprint-a",
      nowMs: 2_000,
    });

    await expect(
      loadSmsScanCheckpoint({
        userId: "user-a",
        processingPolicyVersion: 2,
        nowMs: 2_000,
      })
    ).resolves.toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it("rejects a foreign installation and a future boundary", async () => {
    storage.set(
      "@monyvi/sms-scan/checkpoint/v1/user-a",
      JSON.stringify({
        schemaVersion: 1,
        processingPolicyVersion: 1,
        userId: "user-a",
        installationId: "other-install",
        boundaryReceivedAtMs: 3_000,
        boundaryFingerprint: "fingerprint-a",
        updatedAtMs: 2_000,
      })
    );

    await expect(
      loadSmsScanCheckpoint({
        userId: "user-a",
        processingPolicyVersion: 1,
        nowMs: 2_000,
      })
    ).resolves.toBeNull();
  });

  it("never moves a checkpoint backward", async () => {
    await saveSmsScanCheckpoint({
      userId: "user-a",
      processingPolicyVersion: 1,
      boundaryReceivedAtMs: 2_000,
      boundaryFingerprint: "fingerprint-b",
      nowMs: 3_000,
    });
    await saveSmsScanCheckpoint({
      userId: "user-a",
      processingPolicyVersion: 1,
      boundaryReceivedAtMs: 1_000,
      boundaryFingerprint: "fingerprint-z",
      nowMs: 4_000,
    });

    await expect(
      loadSmsScanCheckpoint({
        userId: "user-a",
        processingPolicyVersion: 1,
        nowMs: 4_000,
      })
    ).resolves.toMatchObject({
      boundaryReceivedAtMs: 2_000,
      boundaryFingerprint: "fingerprint-b",
    });
  });
});
