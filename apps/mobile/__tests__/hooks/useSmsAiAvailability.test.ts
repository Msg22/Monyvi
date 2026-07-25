import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import type { SmsAiAvailabilitySnapshot } from "@/services/sms-ai-availability-service";

const mockGetSmsAiAvailability = jest.fn<
  Promise<SmsAiAvailabilitySnapshot>,
  []
>();
const mockLoggerWarn = jest.fn();
let appStateListener: ((state: "active" | "background") => void) | null = null;
let focusEffect: (() => void) | null = null;

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void): void => {
    focusEffect = callback;
  },
}));

jest.mock("@/services/sms-ai-availability-service", () => ({
  getSmsAiAvailability: () => mockGetSmsAiAvailability(),
}));

jest.mock("@/services/authenticated-edge-function-service", () => ({
  isEdgeFunctionAuthenticationError: (error: unknown): boolean =>
    error instanceof Error &&
    error.name === "EdgeFunctionAuthenticationRequiredError",
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    warn: (...args: readonly unknown[]): void => {
      mockLoggerWarn(...args);
    },
  },
}));

import { useSmsAiAvailability } from "@/hooks/useSmsAiAvailability";

describe("useSmsAiAvailability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = null;
    focusEffect = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return {
          remove: (): void => {
            appStateListener = null;
          },
        };
      });
    mockGetSmsAiAvailability.mockResolvedValue({
      serverNow: "2026-07-20T12:00:00.000Z",
      reason: "history_cooldown",
      availableAt: "2026-07-21T12:00:00.000Z",
      historyCooldownAvailableAt: "2026-07-21T12:00:00.000Z",
    });
  });

  it("refreshes on focus and when the app resumes", async () => {
    const { result } = renderHook(() => useSmsAiAvailability(true));

    act(() => {
      focusEffect?.();
    });

    await waitFor(() => expect(result.current.availability).not.toBeNull());
    expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(1);

    act(() => {
      appStateListener?.("active");
    });
    expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(2);
  });

  it("does not call the consent-protected endpoint while AI processing is disabled", () => {
    const { result } = renderHook(() => useSmsAiAvailability(false));

    expect(result.current.availability).toBeNull();
    expect(mockGetSmsAiAvailability).not.toHaveBeenCalled();
  });

  it("lets the auth shell recover an invalid Edge session without a warning", async () => {
    const authError = new Error("Authenticated Edge Function session required");
    authError.name = "EdgeFunctionAuthenticationRequiredError";
    mockGetSmsAiAvailability.mockRejectedValueOnce(authError);
    renderHook(() => useSmsAiAvailability(true));

    act(() => {
      focusEffect?.();
    });

    await waitFor(() =>
      expect(mockGetSmsAiAvailability).toHaveBeenCalledTimes(1)
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});
