process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test-ref.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]): Promise<unknown> =>
        mockInvoke(...args) as Promise<unknown>,
    },
  },
}));

import {
  registerInitialVerificationSend,
  resendVerificationCode,
} from "@/services/email-verification-resend-service";

describe("email verification resend service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registers the original send without exposing provider details", async () => {
    mockInvoke.mockResolvedValue({ data: { status: "ok" }, error: null });

    await expect(
      registerInitialVerificationSend("new@example.com")
    ).resolves.toBeUndefined();

    expect(mockInvoke).toHaveBeenCalledWith("email-verification-resend", {
      body: {
        operation: "register_initial",
        email: "new@example.com",
      },
    });
  });

  it("returns authoritative server timestamps after resend", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        status: "sent",
        sentAt: "2026-10-04T10:00:00.000Z",
        resendAvailableAt: "2026-10-04T10:02:00.000Z",
        verificationExpiresAt: "2026-10-04T10:10:00.000Z",
      },
      error: null,
    });

    await expect(resendVerificationCode("new@example.com")).resolves.toEqual({
      status: "sent",
      sentAtMs: Date.parse("2026-10-04T10:00:00.000Z"),
      resendAvailableAtMs: Date.parse("2026-10-04T10:02:00.000Z"),
      verificationExpiresAtMs: Date.parse("2026-10-04T10:10:00.000Z"),
    });
  });

  it("preserves cooldown and limit retry timestamps", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        data: {
          status: "cooldown",
          retryAt: "2026-10-04T10:01:30.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "limit",
          retryAt: "2026-10-05T09:00:00.000Z",
        },
        error: null,
      });

    await expect(resendVerificationCode("new@example.com")).resolves.toEqual({
      status: "cooldown",
      retryAtMs: Date.parse("2026-10-04T10:01:30.000Z"),
    });
    await expect(resendVerificationCode("new@example.com")).resolves.toEqual({
      status: "limit",
      retryAtMs: Date.parse("2026-10-05T09:00:00.000Z"),
    });
  });

  it("maps invoke failures and malformed responses to temporary failure", async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: new Error("private") })
      .mockResolvedValueOnce({ data: { status: "mystery" }, error: null });

    await expect(resendVerificationCode("new@example.com")).resolves.toEqual({
      status: "temporary_failure",
    });
    await expect(resendVerificationCode("new@example.com")).resolves.toEqual({
      status: "temporary_failure",
    });
  });
});
