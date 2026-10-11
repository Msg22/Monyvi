import { INTRO_SEEN_KEY } from "@/constants/storage-keys";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(
        (key: string): Promise<string | null> =>
          Promise.resolve(store.get(key) ?? null)
      ),
      setItem: jest.fn((key: string, value: string): Promise<void> => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string): Promise<void> => {
        store.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn((): Promise<void> => {
        store.clear();
        return Promise.resolve();
      }),
      __store: store,
    },
  };
});

import {
  dismissVoiceExamples,
  readVoiceExamplesDismissed,
} from "@/services/voice-examples-preference-service";

interface AsyncStorageMockModule {
  readonly getItem: jest.MockedFunction<
    (key: string) => Promise<string | null>
  >;
  readonly setItem: jest.MockedFunction<
    (key: string, value: string) => Promise<void>
  >;
  readonly removeItem: jest.MockedFunction<(key: string) => Promise<void>>;
  readonly clear: jest.MockedFunction<() => Promise<void>>;
  readonly __store: Map<string, string>;
}

const asyncStorageMock = jest.requireMock<{
  readonly default: AsyncStorageMockModule;
}>("@react-native-async-storage/async-storage").default;
const store = asyncStorageMock.__store;
const mockGetItem = asyncStorageMock.getItem;
const mockSetItem = asyncStorageMock.setItem;

function lastWrittenKeyFor(userId: string): string {
  const match = mockSetItem.mock.calls
    .map((call): string => call[0])
    .find((key): boolean => key.includes(userId));
  if (match === undefined) {
    throw new Error(`No setItem key found for userId ${userId}`);
  }
  return match;
}

describe("voice-examples-preference-service", () => {
  beforeEach((): void => {
    store.clear();
    jest.clearAllMocks();
  });

  describe("authenticated account local namespace", () => {
    it("persists dismissal under distinct user-scoped AsyncStorage keys", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      await dismissVoiceExamples("user-b");

      const writtenKeys = new Set(
        mockSetItem.mock.calls.map((call): string => call[0])
      );
      expect(writtenKeys.size).toBe(2);
      expect(writtenKeys.has(INTRO_SEEN_KEY)).toBe(false);
      expect(
        [...writtenKeys].every((key): boolean => key.includes("user-"))
      ).toBe(true);
    });
  });

  describe("readVoiceExamplesDismissed", () => {
    it("returns false when the preference is absent", async (): Promise<void> => {
      expect(await readVoiceExamplesDismissed("user-a")).toBe(false);
    });

    it("returns true after a durable dismiss for the same account", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      expect(await readVoiceExamplesDismissed("user-a")).toBe(true);
    });

    it("returns false for a corrupt stored value", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      const key = lastWrittenKeyFor("user-a");
      store.set(key, "not-a-boolean");

      expect(await readVoiceExamplesDismissed("user-a")).toBe(false);
    });

    it("returns false for an empty stored value", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      const key = lastWrittenKeyFor("user-a");
      store.set(key, "");

      expect(await readVoiceExamplesDismissed("user-a")).toBe(false);
    });

    it("returns false on an AsyncStorage read failure", async (): Promise<void> => {
      mockGetItem.mockRejectedValueOnce(new Error("storage bridge down"));

      expect(await readVoiceExamplesDismissed("user-a")).toBe(false);
    });
  });

  describe("no global intro flag coupling", () => {
    it("does not mark the global intro-seen key when dismissing", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");

      expect(store.has(INTRO_SEEN_KEY)).toBe(false);
      expect(mockSetItem).not.toHaveBeenCalledWith(INTRO_SEEN_KEY, "true");
    });

    it("keeps a global intro-seen value from leaking into a user's dismissal read", async (): Promise<void> => {
      store.set(INTRO_SEEN_KEY, "true");

      expect(await readVoiceExamplesDismissed("user-a")).toBe(false);
    });
  });

  describe("account isolation", () => {
    it("does not leak account A's dismissal into account B's read", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");

      expect(await readVoiceExamplesDismissed("user-a")).toBe(true);
      expect(await readVoiceExamplesDismissed("user-b")).toBe(false);
    });

    it("keeps A and B dismissals independent in both directions", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      await dismissVoiceExamples("user-b");
      expect(await readVoiceExamplesDismissed("user-a")).toBe(true);
      expect(await readVoiceExamplesDismissed("user-b")).toBe(true);

      const keyB = lastWrittenKeyFor("user-b");
      store.delete(keyB);
      expect(await readVoiceExamplesDismissed("user-a")).toBe(true);
      expect(await readVoiceExamplesDismissed("user-b")).toBe(false);
    });

    it("does not fall back to another account's stored preference when the key is absent", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");

      expect(await readVoiceExamplesDismissed("user-c")).toBe(false);
    });
  });

  describe("durability across remount/restart", () => {
    it("serves a previously dismissed preference from a fresh read path", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      const writtenKey = lastWrittenKeyFor("user-a");
      jest.clearAllMocks();

      expect(await readVoiceExamplesDismissed("user-a")).toBe(true);
      expect(mockGetItem).toHaveBeenCalledWith(writtenKey);
    });
  });

  describe("dismissVoiceExamples", () => {
    it("is idempotent for repeated dismissals of the same account", async (): Promise<void> => {
      await dismissVoiceExamples("user-a");
      const key = lastWrittenKeyFor("user-a");
      await dismissVoiceExamples("user-a");

      expect(mockSetItem).toHaveBeenLastCalledWith(key, "true");
      expect(await readVoiceExamplesDismissed("user-a")).toBe(true);
    });

    it("rejects when the persistence write fails instead of claiming durability", async (): Promise<void> => {
      mockSetItem.mockRejectedValueOnce(new Error("disk full"));

      await expect(dismissVoiceExamples("user-a")).rejects.toThrow("disk full");
    });

    it("leaves the preference unreadable after a failed write", async (): Promise<void> => {
      mockSetItem.mockRejectedValueOnce(new Error("disk full"));
      await expect(dismissVoiceExamples("user-a")).rejects.toThrow("disk full");

      expect(await readVoiceExamplesDismissed("user-a")).toBe(false);
    });
  });
});
