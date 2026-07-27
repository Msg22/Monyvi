import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

const originalPlatformOS = Platform.OS;

let mockCurrentUser = { userId: "user-a", isResolvingUser: false };

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): typeof mockCurrentUser => mockCurrentUser,
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    multiGet: jest.fn(),
    setItem: jest.fn(),
    multiSet: jest.fn(),
  },
}));

import { useSmsSync } from "@/hooks/useSmsSync";

const mockMultiGet = AsyncStorage.multiGet as jest.MockedFunction<
  typeof AsyncStorage.multiGet
>;
const mockMultiSet = AsyncStorage.multiSet as jest.MockedFunction<
  typeof AsyncStorage.multiSet
>;

function valuesForKeys(
  keys: readonly string[]
): Array<[string, string | null]> {
  return keys.map((key) => {
    if (key.endsWith(":user-a")) {
      if (key.includes("sms-last-sync")) return [key, "123"];
      return [key, "true"];
    }
    return [key, null];
  });
}

describe("useSmsSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
    mockCurrentUser = { userId: "user-a", isResolvingUser: false };
    mockMultiGet.mockImplementation((keys) =>
      Promise.resolve(valuesForKeys(keys))
    );
    mockMultiSet.mockResolvedValue(undefined);
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOS,
    });
  });

  it("isolates prompt and sync state across authenticated users", async () => {
    const renderedStates: Array<{
      readonly userId: string | null;
      readonly shouldShowPrompt: boolean;
      readonly hasSynced: boolean;
      readonly lastSyncTimestamp: number | null;
      readonly isLoading: boolean;
    }> = [];
    const { result, rerender } = renderHook(() => {
      const syncState = useSmsSync();
      renderedStates.push({ userId: mockCurrentUser.userId, ...syncState });
      return syncState;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasSynced).toBe(true);
    expect(result.current.lastSyncTimestamp).toBe(123);

    const renderCountBeforeSwitch = renderedStates.length;
    mockCurrentUser = { userId: "user-b", isResolvingUser: false };
    rerender(undefined);

    expect(
      renderedStates
        .slice(renderCountBeforeSwitch)
        .find(({ userId }) => userId === "user-b")
    ).toMatchObject({
      shouldShowPrompt: false,
      hasSynced: false,
      lastSyncTimestamp: null,
      isLoading: true,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasSynced).toBe(false);
    });
    expect(result.current.lastSyncTimestamp).toBeNull();
    expect(result.current.shouldShowPrompt).toBe(true);

    await act(async () => {
      await result.current.markSyncComplete();
    });

    expect(mockMultiSet).toHaveBeenCalledWith(
      expect.arrayContaining([
        ["@monyvi/sms-prompt-shown:user-b", "true"],
        ["@monyvi/sms-has-synced:user-b", "true"],
      ])
    );
  });
});
