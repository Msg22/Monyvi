import { readFileSync } from "fs";
import path from "path";

const mockFetch = jest.fn();
const mockQueryOwned = jest.fn(() => ({ fetch: mockFetch }));
const mockSyncDatabase = jest.fn<Promise<void>, [unknown]>();
const mockGetCurrentUserDataScope = jest.fn(() =>
  Promise.resolve({ userId: "user-a", queryOwned: mockQueryOwned })
);

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => ({ table: "sms_ai_negative_outcomes" })),
  },
}));
jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: () => mockGetCurrentUserDataScope(),
}));
jest.mock("@/services/sync", () => ({
  syncDatabase: (database: unknown): Promise<void> =>
    mockSyncDatabase(database),
}));

import {
  getSmsProcessingOutcomes,
  getTerminalSmsFingerprints,
  refreshSmsProcessingOutcomes,
} from "@/services/sms-processing-outcome-service";

describe("sms-processing-outcome-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue([]);
    mockSyncDatabase.mockResolvedValue(undefined);
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-a",
      queryOwned: mockQueryOwned,
    });
  });

  it("returns only scoped active outcomes requested by fingerprint", async () => {
    mockFetch.mockResolvedValue([
      {
        smsFingerprint: "terminal",
        strikeCount: 3,
        isTerminal: true,
        deleted: false,
        originalReceivedAt: "2026-07-20T00:00:00.000Z",
        lastClassifiedAt: "2026-07-20T01:00:00.000Z",
      },
      {
        smsFingerprint: "deleted",
        strikeCount: 1,
        isTerminal: false,
        deleted: true,
        originalReceivedAt: "2026-07-20T00:00:00.000Z",
        lastClassifiedAt: "2026-07-20T01:00:00.000Z",
      },
    ]);

    await expect(
      getSmsProcessingOutcomes(["terminal", "deleted"])
    ).resolves.toEqual([
      expect.objectContaining({ smsFingerprint: "terminal", isTerminal: true }),
    ]);
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("returns terminal fingerprints as an immutable lookup set", async () => {
    mockFetch.mockResolvedValue([
      {
        smsFingerprint: "a",
        isTerminal: true,
        deleted: false,
        originalReceivedAt: "2020-01-01T00:00:00.000Z",
      },
      {
        smsFingerprint: "b",
        isTerminal: false,
        deleted: false,
        originalReceivedAt: new Date().toISOString(),
      },
    ]);

    await expect(getTerminalSmsFingerprints(["a", "b"])).resolves.toEqual(
      new Set(["a"])
    );
  });

  it("ignores expired non-terminal outcomes while preserving terminal history", async () => {
    mockFetch.mockResolvedValue([
      {
        smsFingerprint: "expired-non-terminal",
        strikeCount: 2,
        isTerminal: false,
        deleted: false,
        originalReceivedAt: "2020-01-01T00:00:00.000Z",
        lastClassifiedAt: "2020-01-02T00:00:00.000Z",
      },
      {
        smsFingerprint: "terminal",
        strikeCount: 3,
        isTerminal: true,
        deleted: false,
        originalReceivedAt: "2020-01-01T00:00:00.000Z",
        lastClassifiedAt: "2020-01-03T00:00:00.000Z",
      },
    ]);

    await expect(
      getSmsProcessingOutcomes(["expired-non-terminal", "terminal"])
    ).resolves.toEqual([
      expect.objectContaining({ smsFingerprint: "terminal", isTerminal: true }),
    ]);
  });

  it("evaluates non-terminal outcome expiry against the supplied scan boundary", async () => {
    mockFetch.mockResolvedValue([
      {
        smsFingerprint: "at-boundary",
        strikeCount: 1,
        isTerminal: false,
        deleted: false,
        originalReceivedAt: "2026-05-25T12:00:00.000Z",
        lastClassifiedAt: "2026-05-25T12:00:00.000Z",
      },
    ]);

    await expect(
      getSmsProcessingOutcomes(
        ["at-boundary"],
        undefined,
        Date.parse("2026-06-21T12:00:00.000Z")
      )
    ).resolves.toEqual([
      expect.objectContaining({ smsFingerprint: "at-boundary" }),
    ]);
  });

  it("refreshes synchronized server outcomes before reading", async () => {
    await refreshSmsProcessingOutcomes(["a"]);

    expect(mockSyncDatabase).toHaveBeenCalledTimes(1);
    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
  });

  it("rejects an outcome read after the authenticated user changes", async () => {
    mockGetCurrentUserDataScope.mockResolvedValueOnce({
      userId: "user-b",
      queryOwned: mockQueryOwned,
    });

    await expect(
      getSmsProcessingOutcomes(["terminal"], "user-a")
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");
    expect(mockQueryOwned).not.toHaveBeenCalled();
  });

  it("contains no local mutation path for the server-authored table", () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../services/sms-processing-outcome-service.ts"
      ),
      "utf8"
    );

    expect(source).not.toMatch(
      /database\.write|\.create\(|\.update\(|\.destroy/
    );
  });
});
