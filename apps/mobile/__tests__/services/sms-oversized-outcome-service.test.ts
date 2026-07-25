import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getOversizedSmsFingerprints,
  recordOversizedSmsOutcome,
  SMS_OVERSIZED_OUTCOME_LIMIT,
} from "@/services/sms-oversized-outcome-service";

jest.mock("@react-native-async-storage/async-storage");
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "install-1") }));

const DAY_MS = 24 * 60 * 60 * 1000;
const storage = new Map<string, string>();

describe("sms-oversized-outcome-service", () => {
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

  it("stores only privacy-safe oversized metadata", async () => {
    await recordOversizedSmsOutcome({
      userId: "user-a",
      smsFingerprint: "fingerprint-a",
      originalReceivedAtMs: 1_000,
      nowMs: 2_000,
      lookbackDays: 30,
    });

    const serialized = [...storage.values()].join("\n");
    expect(serialized).toContain("candidate_too_large");
    expect(serialized).toContain("fingerprint-a");
    expect(serialized).not.toMatch(/smsBody|sender|merchant|amount|currency/);
  });

  it("deduplicates fingerprints and removes outcomes outside the lookback", async () => {
    const nowMs = 40 * DAY_MS;
    await recordOversizedSmsOutcome({
      userId: "user-a",
      smsFingerprint: "expired",
      originalReceivedAtMs: 1,
      nowMs: 2,
      lookbackDays: 30,
    });
    await recordOversizedSmsOutcome({
      userId: "user-a",
      smsFingerprint: "active",
      originalReceivedAtMs: nowMs - DAY_MS,
      nowMs,
      lookbackDays: 30,
    });
    await recordOversizedSmsOutcome({
      userId: "user-a",
      smsFingerprint: "active",
      originalReceivedAtMs: nowMs - DAY_MS,
      nowMs: nowMs + 1,
      lookbackDays: 30,
    });

    await expect(
      getOversizedSmsFingerprints({
        userId: "user-a",
        nowMs: nowMs + 1,
        lookbackDays: 30,
      })
    ).resolves.toEqual(new Set(["active"]));
  });

  it("keeps a deterministic bounded newest collection", async () => {
    for (let index = 0; index <= SMS_OVERSIZED_OUTCOME_LIMIT; index += 1) {
      await recordOversizedSmsOutcome({
        userId: "user-a",
        smsFingerprint: `fingerprint-${index}`,
        originalReceivedAtMs: index + 1,
        nowMs: SMS_OVERSIZED_OUTCOME_LIMIT + 2,
        lookbackDays: 30,
      });
    }

    const fingerprints = await getOversizedSmsFingerprints({
      userId: "user-a",
      nowMs: SMS_OVERSIZED_OUTCOME_LIMIT + 2,
      lookbackDays: 30,
    });
    expect(fingerprints.size).toBe(SMS_OVERSIZED_OUTCOME_LIMIT);
    expect(fingerprints.has("fingerprint-0")).toBe(false);
    expect(fingerprints.has(`fingerprint-${SMS_OVERSIZED_OUTCOME_LIMIT}`)).toBe(
      true
    );
  });
});
