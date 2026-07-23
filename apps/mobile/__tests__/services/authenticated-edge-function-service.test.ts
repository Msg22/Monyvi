const mockInvoke = jest.fn();
const mockRefreshSession = jest.fn();
const mockSignOut = jest.fn();
const mockClearPersistedAuthSession = jest.fn();

jest.mock("@/services/supabase", () => ({
  clearPersistedAuthSession: (...args: readonly unknown[]): unknown =>
    mockClearPersistedAuthSession(...args),
  supabase: {
    auth: {
      refreshSession: (...args: readonly unknown[]): unknown =>
        mockRefreshSession(...args),
      signOut: (...args: readonly unknown[]): unknown => mockSignOut(...args),
    },
    functions: {
      invoke: (...args: readonly unknown[]): unknown => mockInvoke(...args),
    },
  },
}));

import {
  getEdgeFunctionErrorStatus,
  invokeAuthenticatedEdgeFunction,
} from "@/services/authenticated-edge-function-service";

function httpError(status: number): Error & { context: Response } {
  return Object.assign(new Error("Edge Function request failed"), {
    context: new Response(null, { status }),
  });
}

describe("authenticated-edge-function-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("returns non-auth failures without refreshing the session", async () => {
    const failure = { data: null, error: httpError(429) };
    mockInvoke.mockResolvedValue(failure);

    await expect(
      invokeAuthenticatedEdgeFunction("parse-sms", { body: { messages: [] } })
    ).resolves.toBe(failure);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it("refreshes once and retries a 401 with the new access token", async () => {
    const beforeRetry = jest.fn().mockResolvedValue(undefined);
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: httpError(401) })
      .mockResolvedValueOnce({ data: { transactions: [] }, error: null });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "fresh-access-token" } },
      error: null,
    });

    await expect(
      invokeAuthenticatedEdgeFunction(
        "sms-safeguard-qa",
        {
          body: { messages: [] },
          headers: { "x-sms-safeguard-qa-run-id": "run-1" },
        },
        {
          beforeRetry,
        }
      )
    ).resolves.toEqual({ data: { transactions: [] }, error: null });

    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      "sms-safeguard-qa",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer fresh-access-token",
          "x-sms-safeguard-qa-run-id": "run-1",
        },
      })
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(beforeRetry).toHaveBeenCalledTimes(1);
  });

  it("clears the local session when a 401 cannot be refreshed", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(401) });
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error("refresh token is invalid"),
    });

    await expect(
      invokeAuthenticatedEdgeFunction("sms-ai-availability", {
        method: "GET",
      })
    ).rejects.toMatchObject({
      name: "EdgeFunctionAuthenticationRequiredError",
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears the local session when the refreshed token is also refused", async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: httpError(401) })
      .mockResolvedValueOnce({ data: null, error: httpError(401) });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: "still-invalid-token" } },
      error: null,
    });

    await expect(
      invokeAuthenticatedEdgeFunction("parse-sms", {
        body: { messages: [] },
      })
    ).rejects.toMatchObject({
      name: "EdgeFunctionAuthenticationRequiredError",
    });

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("reads HTTP status only from a FunctionsHttpError response", () => {
    expect(getEdgeFunctionErrorStatus(httpError(401))).toBe(401);
    expect(getEdgeFunctionErrorStatus(new Error("network"))).toBeUndefined();
  });
});
