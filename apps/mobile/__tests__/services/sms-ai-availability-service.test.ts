const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: readonly unknown[]): unknown => mockInvoke(...args),
    },
  },
}));

import { getSmsAiAvailability } from "@/services/sms-ai-availability-service";

describe("sms-ai-availability-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a validated server-time availability snapshot", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        serverNow: "2026-07-20T12:00:00.000Z",
        blockers: {
          rolling: { availableAt: null },
          burst: { availableAt: null },
          historyCooldown: { availableAt: "2026-07-21T12:00:00.000Z" },
        },
        reason: "history_cooldown",
        availableAt: "2026-07-21T12:00:00.000Z",
      },
      error: null,
    });

    await expect(getSmsAiAvailability()).resolves.toEqual({
      serverNow: "2026-07-20T12:00:00.000Z",
      reason: "history_cooldown",
      availableAt: "2026-07-21T12:00:00.000Z",
    });
    expect(mockInvoke).toHaveBeenCalledWith("sms-ai-availability", {
      method: "GET",
    });
  });

  it("accepts PostgreSQL timestamptz offsets", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        serverNow: "2026-07-20T14:01:48.335842+00:00",
        blockers: {},
        reason: "rolling_limit",
        availableAt: "2026-07-21T14:01:48.335842+00:00",
      },
      error: null,
    });

    await expect(getSmsAiAvailability()).resolves.toEqual({
      serverNow: "2026-07-20T14:01:48.335842+00:00",
      reason: "rolling_limit",
      availableAt: "2026-07-21T14:01:48.335842+00:00",
    });
  });

  it("fails closed at the adapter boundary for malformed or unavailable responses", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { availableAt: "tomorrow" },
      error: null,
    });
    await expect(getSmsAiAvailability()).rejects.toThrow(
      "Invalid SMS AI availability response"
    );

    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error("offline"),
    });
    await expect(getSmsAiAvailability()).rejects.toThrow(
      "SMS AI availability request failed"
    );
  });
});
