import AsyncStorage from "@react-native-async-storage/async-storage";

const mockAssertExpectedCurrentUser = jest.fn<Promise<void>, [string]>();

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (expectedUserId: string): Promise<void> =>
    mockAssertExpectedCurrentUser(expectedUserId),
}));

jest.mock("@/services/sms-safeguard-storage-service", () => ({
  withSmsSafeguardStorageLock: <T>(
    _key: string,
    operation: () => Promise<T>
  ): Promise<T> => operation(),
}));

import {
  LIVE_SMS_RETRY_REQUEST_LIMIT,
  LIVE_SMS_RETRY_REQUEST_TTL_MS,
  clearLiveSmsRetryRequestKey,
  clearLiveSmsRetryRequestsForUser,
  loadLiveSmsRetryRequestKey,
  saveLiveSmsRetryRequestKey,
} from "@/services/sms-live-retry-request-store";

const asyncStore = AsyncStorage as typeof AsyncStorage & {
  readonly __store?: Map<string, string>;
};

function storageKey(userId: string): string {
  return `@monyvi/sms-live/retry-request/v1/${encodeURIComponent(userId)}`;
}

describe("sms live retry request store", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAssertExpectedCurrentUser.mockResolvedValue();
    await AsyncStorage.clear();
  });

  it("persists only the scoped fingerprint/request key with bounded expiry", async () => {
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "fingerprint-a",
      requestKey: "live:fingerprint-a",
      nowMs: 1_000,
    });

    const serialized = await AsyncStorage.getItem(storageKey("user-a"));
    const parsed = JSON.parse(serialized ?? "{}") as {
      readonly userId?: string;
      readonly entries?: readonly Record<string, unknown>[];
    };

    expect(parsed.userId).toBe("user-a");
    expect(parsed.entries).toEqual([
      expect.objectContaining({
        smsFingerprint: "fingerprint-a",
        requestKey: "live:fingerprint-a",
        expiresAtMs: 1_000 + LIVE_SMS_RETRY_REQUEST_TTL_MS,
      }),
    ]);
    expect(serialized).not.toContain("body");
    expect(serialized).not.toContain("categories");
    expect(serialized).not.toContain("transactions");
  });

  it("returns null and cleans malformed persisted state", async () => {
    await AsyncStorage.setItem(storageKey("user-a"), "{not-json");

    await expect(
      loadLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: "fingerprint-a",
        nowMs: 1_000,
      })
    ).resolves.toBeNull();

    await expect(
      AsyncStorage.getItem(storageKey("user-a"))
    ).resolves.toBeNull();
  });

  it("expires stale retry identity and does not reuse it", async () => {
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "fingerprint-a",
      requestKey: "live:fingerprint-a",
      nowMs: 1_000,
    });

    await expect(
      loadLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: "fingerprint-a",
        nowMs: 1_001 + LIVE_SMS_RETRY_REQUEST_TTL_MS,
      })
    ).resolves.toBeNull();
  });

  it("keeps user stores isolated", async () => {
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "same-fingerprint",
      requestKey: "user-a-key",
      nowMs: 1_000,
    });
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-b",
      smsFingerprint: "same-fingerprint",
      requestKey: "user-b-key",
      nowMs: 1_000,
    });

    await expect(
      loadLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: "same-fingerprint",
        nowMs: 2_000,
      })
    ).resolves.toBe("user-a-key");
    await expect(
      loadLiveSmsRetryRequestKey({
        expectedUserId: "user-b",
        smsFingerprint: "same-fingerprint",
        nowMs: 2_000,
      })
    ).resolves.toBe("user-b-key");
  });

  it("bounds entries and prunes oldest durable identities", async () => {
    for (let index = 0; index <= LIVE_SMS_RETRY_REQUEST_LIMIT; index += 1) {
      await saveLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: `fingerprint-${index}`,
        requestKey: `request-${index}`,
        nowMs: 1_000 + index,
      });
    }

    const serialized = await AsyncStorage.getItem(storageKey("user-a"));
    const parsed = JSON.parse(serialized ?? "{}") as {
      readonly entries?: readonly unknown[];
    };
    expect(parsed.entries).toHaveLength(LIVE_SMS_RETRY_REQUEST_LIMIT);
    await expect(
      loadLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: "fingerprint-0",
        nowMs: 10_000,
      })
    ).resolves.toBeNull();
  });

  it("propagates persistence failure so callers can fail closed", async () => {
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(
      saveLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: "fingerprint-a",
        requestKey: "live:fingerprint-a",
        nowMs: 1_000,
      })
    ).rejects.toThrow("storage unavailable");
  });

  it("clears one fingerprint or all entries for the current user only", async () => {
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "fingerprint-a",
      requestKey: "request-a",
      nowMs: 1_000,
    });
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "fingerprint-b",
      requestKey: "request-b",
      nowMs: 1_001,
    });

    await clearLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "fingerprint-a",
      nowMs: 2_000,
    });
    await expect(
      loadLiveSmsRetryRequestKey({
        expectedUserId: "user-a",
        smsFingerprint: "fingerprint-a",
        nowMs: 2_000,
      })
    ).resolves.toBeNull();

    await clearLiveSmsRetryRequestsForUser({ expectedUserId: "user-a" });
    await expect(
      AsyncStorage.getItem(storageKey("user-a"))
    ).resolves.toBeNull();
  });

  it("guards owner scope before and after persistence awaits", async () => {
    await saveLiveSmsRetryRequestKey({
      expectedUserId: "user-a",
      smsFingerprint: "fingerprint-a",
      requestKey: "request-a",
      nowMs: 1_000,
    });

    expect(mockAssertExpectedCurrentUser).toHaveBeenCalledWith("user-a");
    expect(mockAssertExpectedCurrentUser.mock.calls.length).toBeGreaterThan(2);
  });
});
