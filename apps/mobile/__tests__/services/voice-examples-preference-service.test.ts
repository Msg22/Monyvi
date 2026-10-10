/**
 * T061 test-first contract for an approved new device-local preference service.
 * Missing service import before implementation is STRUCTURAL, not behavioral Red.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  dismissVoiceExamples,
  readVoiceExamplesDismissed,
} from "@/services/voice-examples-preference-service";

const mockLogPreferenceFailure = jest.fn<void, unknown[]>();

jest.mock("@react-native-async-storage/async-storage");
jest.mock("@/utils/logger", () => ({
  logger: {
    warn: (...args: unknown[]): void => {
      mockLogPreferenceFailure(...args);
    },
    error: (...args: unknown[]): void => {
      mockLogPreferenceFailure(...args);
    },
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<
  typeof AsyncStorage.getItem
>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<
  typeof AsyncStorage.setItem
>;
const mockRemoveItem = AsyncStorage.removeItem as jest.MockedFunction<
  typeof AsyncStorage.removeItem
>;

const accountA = "authenticated-account-a";
const accountB = "authenticated-account-b";
const storedValues = new Map<string, string>();

function writtenKey(index: number): string {
  const call = mockSetItem.mock.calls[index];
  if (!call) {
    throw new Error("Expected an AsyncStorage preference write");
  }
  return call[0];
}

beforeEach((): void => {
  jest.clearAllMocks();
  storedValues.clear();
  mockGetItem.mockReset().mockImplementation(
    async (key: string): Promise<string | null> =>
      storedValues.get(key) ?? null
  );
  mockSetItem.mockReset().mockImplementation(
    async (key: string, value: string): Promise<void> => {
      storedValues.set(key, value);
    }
  );
});

describe("voice-examples-preference-service (FR-038, T061)", () => {
  it("new account defaults visible", async (): Promise<void> => {
    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(false);
    expect(mockGetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it("persists dismissal under a stable account key", async (): Promise<void> => {
    await dismissVoiceExamples(accountA);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const keyA = writtenKey(0);
    const persisted = storedValues.get(keyA);

    expect(keyA).toMatch(/voice.*examples|examples.*voice/i);
    expect(keyA).not.toBe("@monyvi/intro-seen");
    expect(keyA).not.toBe("@monyvi/intro-locale-override");
    expect(persisted).toEqual(expect.any(String));
    expect(persisted).not.toBe("");

    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(true);
    expect(mockGetItem).toHaveBeenCalledWith(keyA);
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("keeps other accounts independent", async (): Promise<void> => {
    await dismissVoiceExamples(accountA);
    const keyA = writtenKey(0);
    await expect(readVoiceExamplesDismissed(accountB)).resolves.toBe(false);

    await dismissVoiceExamples(accountB);
    const keyB = writtenKey(1);
    expect(keyB).not.toBe(keyA);
    expect(keyB).not.toBe("@monyvi/intro-seen");

    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(true);
    await expect(readVoiceExamplesDismissed(accountB)).resolves.toBe(true);
    expect(mockGetItem).toHaveBeenCalledWith(keyA);
    expect(mockGetItem).toHaveBeenCalledWith(keyB);
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("repeated dismissal is idempotent", async (): Promise<void> => {
    await dismissVoiceExamples(accountA);
    const key = writtenKey(0);
    const value = storedValues.get(key);

    await dismissVoiceExamples(accountA);
    await dismissVoiceExamples(accountA);

    expect(new Set(mockSetItem.mock.calls.map(([itemKey]) => itemKey))).toEqual(
      new Set([key])
    );
    expect(storedValues.get(key)).toBe(value);
    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(true);
  });

  it("ignores global pre-auth intro flags", async (): Promise<void> => {
    storedValues.set("@monyvi/intro-seen", "true");
    storedValues.set("@monyvi/intro-locale-override", "ar");

    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(false);
    expect(mockGetItem).not.toHaveBeenCalledWith("@monyvi/intro-seen");
    expect(mockGetItem).not.toHaveBeenCalledWith(
      "@monyvi/intro-locale-override"
    );
  });

  it.each(["false", "not-a-preference", "true ", "null", "{}"])(
    "treats a corrupt or non-dismissed stored value %s as visible",
    async (invalidValue): Promise<void> => {
      await dismissVoiceExamples(accountA);
      storedValues.set(writtenKey(0), invalidValue);

      await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(false);
    }
  );

  it("failed reads log and default visible", async (): Promise<void> => {
    mockGetItem.mockRejectedValueOnce(new Error("local read unavailable"));

    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(false);
    expect(mockLogPreferenceFailure).toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it("write failures surface and log", async (): Promise<void> => {
    mockSetItem.mockRejectedValueOnce(new Error("local write unavailable"));

    await expect(dismissVoiceExamples(accountA)).rejects.toThrow(
      "local write unavailable"
    );
    expect(mockLogPreferenceFailure).toHaveBeenCalled();
    await expect(readVoiceExamplesDismissed(accountA)).resolves.toBe(false);
    expect(storedValues.size).toBe(0);
  });

  it("rejects unauthenticated writes", async (): Promise<void> => {
    await expect(dismissVoiceExamples("")).rejects.toThrow();
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
