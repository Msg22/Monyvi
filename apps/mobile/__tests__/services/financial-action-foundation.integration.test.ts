import { createHash } from "node:crypto";

import {
  FINANCIAL_ACTION_ERROR_CODES,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "../../../../packages/logic/src/financial-actions";

const mockRecords: MockRecord[] = [];
let mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000003";
let nextLocalRowId = 0;
let mockSwitchUserDuringNextLookup = false;
let mockSwitchUserDuringBatch = false;

interface MockRecord {
  _raw: { id: string };
  id: string;
  actionId: string;
  userId: string;
  domain: string;
  kind: string;
  domainReferenceId: string;
  payloadJson: string;
  payloadHash: string;
  expectedAccountRevision: string | null;
  state: string;
  serverOutcome: string | null;
  outcomeJson: string | null;
  rejectionCode: string | null;
  deleted: boolean;
  updatedAt: Date;
  prepareUpdate: (updater: (record: MockRecord) => void) => MockRecord;
}

const mockCollection = {
  prepareCreate: jest.fn((updater: (record: MockRecord) => void): MockRecord => {
    const record = {
      _raw: { id: `local-financial-action-${++nextLocalRowId}` },
      id: "",
      actionId: "",
      userId: "",
      domain: "",
      kind: "",
      domainReferenceId: "",
      payloadJson: "",
      payloadHash: "",
      expectedAccountRevision: null,
      state: "",
      serverOutcome: null,
      outcomeJson: null,
      rejectionCode: null,
      deleted: false,
      updatedAt: new Date(0),
      prepareUpdate(update: (value: MockRecord) => void): MockRecord {
        update(this);
        return this;
      },
    } satisfies MockRecord;
    updater(record);
    record.id = record._raw.id;
    return record;
  }),
};
const mockDatabaseWrite = jest.fn(async <T>(action: () => Promise<T>): Promise<T> => {
  const snapshot = mockRecords.map((record) => ({ ...record }));
  try {
    return await action();
  } catch (error) {
    mockRecords.splice(0, mockRecords.length, ...snapshot);
    throw error;
  }
});
const mockDatabaseBatch = jest.fn(async (...operations: MockRecord[]): Promise<void> => {
  operations.forEach((operation) => {
    if (!mockRecords.includes(operation)) mockRecords.push(operation);
  });
  if (mockSwitchUserDuringBatch) {
    mockSwitchUserDuringBatch = false;
    mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";
  }
});

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => mockCollection),
    write: <T>(action: () => Promise<T>): Promise<T> =>
      mockDatabaseWrite(action) as Promise<T>,
    batch: (...operations: MockRecord[]): Promise<void> =>
      mockDatabaseBatch(...operations),
  },
}));

jest.mock("../../services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(async () => ({
    userId: mockCurrentUserId,
    queryOwned: (): { fetch: () => Promise<MockRecord[]> } => {
      const scopedUserId = mockCurrentUserId;
      return {
        fetch: async (): Promise<MockRecord[]> => {
          const records = mockRecords.filter((record) => record.userId === scopedUserId);
          if (mockSwitchUserDuringNextLookup) {
            mockSwitchUserDuringNextLookup = false;
            mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";
          }
          return records;
        },
      };
    },
    assertOwned: (record: MockRecord): MockRecord => {
      if (record.userId !== mockCurrentUserId) throw new Error("ownership_failed");
      return record;
    },
  })),
  assertExpectedCurrentUser: jest.fn(async (expectedUserId: string): Promise<void> => {
    if (expectedUserId !== mockCurrentUserId) throw new Error("auth_scope_changed");
  }),
}));

import {
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES,
  createFinancialActionGroup,
  getFinancialActionGroup,
  markFinancialActionGroupSyncFailed,
  retryFinancialActionGroup,
} from "../../services/financial-action-foundation-repository";

const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000001";
const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const DOMAIN_REFERENCE_ID = "018f0c7a-1234-7abc-8def-000000000002";
const sha256Provider: Sha256Provider = {
  digestUtf8: async (canonicalText: string): Promise<string> =>
    createHash("sha256").update(canonicalText, "utf8").digest("hex"),
};

function envelope(
  overrides: Partial<FinancialActionEnvelopeV1> = {}
): FinancialActionEnvelopeV1 {
  return {
    actionId: ACTION_ID,
    userId: USER_ID,
    domain: "metals" as const,
    kind: "sell" as const,
    domainReferenceId: DOMAIN_REFERENCE_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    expectedAccountRevision: null,
    occurredAt: "2026-08-31T10:15:30.123Z",
    payload: {
      feeMinorUnits: "80000",
      grossProceedsDecimal: "35500",
      holdingId: "018f0c7a-1234-7abc-8def-000000000004",
      includeAccountCredit: false,
      netProceedsMinorUnits: "3470000",
      notes: "ذهب",
      rateReferenceIds: [],
    },
    payloadVersion: "metals.sell/v1",
    ...overrides,
  };
}

function input(
  envelopeOverride: FinancialActionEnvelopeV1 = envelope(),
  hashProvider: Sha256Provider = sha256Provider
): Parameters<typeof createFinancialActionGroup>[0] {
  return { envelope: envelopeOverride, hashProvider };
}

describe("financial action foundation repository", () => {
  beforeEach(() => {
    mockRecords.splice(0);
    mockCurrentUserId = USER_ID;
    nextLocalRowId = 0;
    mockSwitchUserDuringNextLookup = false;
    mockSwitchUserDuringBatch = false;
    jest.clearAllMocks();
  });

  it("creates one durable owner-scoped root in one local writer", async () => {
    const result = await createFinancialActionGroup(input());

    expect(result.kind).toBe("created");
    expect(mockRecords).toHaveLength(1);
    expect(mockRecords[0]).toMatchObject({
      actionId: ACTION_ID,
      userId: USER_ID,
      state: "pending_local",
      expectedAccountRevision: null,
      deleted: false,
    });
    expect(mockRecords[0]?._raw.id).not.toBe(ACTION_ID);
    expect(mockRecords[0]?.id).toBe(mockRecords[0]?._raw.id);
    expect(mockRecords[0]?.payloadJson).toContain('"notes":"ذهب"');
    expect(mockRecords[0]?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mockDatabaseWrite).toHaveBeenCalledTimes(1);
    expect(mockDatabaseBatch).toHaveBeenCalledTimes(1);
    expect(mockRecords[0]).not.toHaveProperty("accountId");
    expect(mockRecords[0]).not.toHaveProperty("amountMinorUnits");
  });

  it("returns the stored root for same-user same-id same-hash replay after restart", async () => {
    await createFinancialActionGroup(input());
    jest.resetModules();

    const replay = await createFinancialActionGroup(input());
    const restored = await getFinancialActionGroup(ACTION_ID);

    expect(replay.kind).toBe("replay");
    expect(mockRecords).toHaveLength(1);
    expect(restored?.payloadHash).toBe(mockRecords[0]?.payloadHash);
  });

  it("rejects same-user same-id with a different payload hash without mutation", async () => {
    await createFinancialActionGroup(input());

    await expect(
      createFinancialActionGroup(
        input(envelope({ payload: { ...envelope().payload, notes: "changed" } }))
      )
    ).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH
    );
    expect(mockRecords).toHaveLength(1);
    expect(mockRecords[0]?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects changed canonical text when a faulty provider repeats a valid hash", async () => {
    const constantHashProvider: Sha256Provider = {
      digestUtf8: async (): Promise<string> => "a".repeat(64),
    };
    await createFinancialActionGroup(input(envelope(), constantHashProvider));

    await expect(
      createFinancialActionGroup(
        input(
          envelope({ payload: { ...envelope().payload, notes: "changed" } }),
          constantHashProvider
        )
      )
    ).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH
    );
    expect(mockRecords).toHaveLength(1);
  });

  it("allows different users to own the same action id with independent local row ids", async () => {
    const secondUserId = "018f0c7a-1234-7abc-8def-000000000099";
    await createFinancialActionGroup(input());
    mockCurrentUserId = secondUserId;

    await expect(
      createFinancialActionGroup(input(envelope({ userId: secondUserId })))
    ).resolves.toMatchObject({ kind: "created" });

    expect(mockRecords).toHaveLength(2);
    expect(mockRecords.map((record) => record.actionId)).toEqual([
      ACTION_ID,
      ACTION_ID,
    ]);
    expect(new Set(mockRecords.map((record) => record.id))).toHaveProperty(
      "size",
      2
    );
    await expect(getFinancialActionGroup(ACTION_ID)).resolves.toMatchObject({
      userId: secondUserId,
    });
  });

  it("never reads or mutates another user's same action id", async () => {
    await createFinancialActionGroup(input());
    mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";

    await expect(getFinancialActionGroup(ACTION_ID)).resolves.toBeNull();
    await expect(markFinancialActionGroupSyncFailed(ACTION_ID, "offline")).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.NOT_FOUND
    );
    expect(mockRecords[0]?.state).toBe("pending_local");
  });

  it("persists retry state across restart without changing immutable identity", async () => {
    await createFinancialActionGroup(input());
    mockRecords[0]!.state = "sync_pending";
    await markFinancialActionGroupSyncFailed(ACTION_ID, "network_failure");
    jest.resetModules();

    expect(await getFinancialActionGroup(ACTION_ID)).toMatchObject({
      state: "sync_failed",
      rejectionCode: "network_failure",
    });
    await retryFinancialActionGroup(ACTION_ID);
    expect(mockRecords[0]).toMatchObject({
      actionId: ACTION_ID,
      payloadHash: mockRecords[0]?.payloadHash,
      state: "sync_pending",
      rejectionCode: null,
    });
  });

  it("allows retry only from sync_failed", async () => {
    await createFinancialActionGroup(input());

    await expect(retryFinancialActionGroup(ACTION_ID)).rejects.toThrow(
      "financial_action_invalid_transition"
    );
    expect(mockRecords[0]?.state).toBe("pending_local");
  });

  it("rolls back the complete local create when the writer fails", async () => {
    mockDatabaseBatch.mockRejectedValueOnce(new Error("write_failed"));

    await expect(createFinancialActionGroup(input())).rejects.toThrow("write_failed");
    expect(mockRecords).toHaveLength(0);
  });

  it("rejects unvalidated root fields before opening a local writer", async () => {
    const untrustedEnvelope = {
      ...envelope(),
      attackerControlledRoot: "override",
    } as unknown as FinancialActionEnvelopeV1;

    await expect(createFinancialActionGroup(input(untrustedEnvelope))).rejects.toThrow(
      FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE
    );
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("rejects an envelope owned by another user before hashing or opening a writer", async () => {
    const digestUtf8 = jest.fn(sha256Provider.digestUtf8);

    await expect(
      createFinancialActionGroup(
        input(envelope({ userId: "018f0c7a-1234-7abc-8def-000000000099" }), {
          digestUtf8,
        })
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED);

    expect(digestUtf8).not.toHaveBeenCalled();
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("rechecks the authenticated user inside the writer after hashing", async () => {
    const switchingProvider: Sha256Provider = {
      digestUtf8: async (canonicalText: string): Promise<string> => {
        const digest = await sha256Provider.digestUtf8(canonicalText);
        mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";
        return digest;
      },
    };

    await expect(
      createFinancialActionGroup(input(envelope(), switchingProvider))
    ).rejects.toThrow("auth_scope_changed");
    expect(mockRecords).toHaveLength(0);
  });

  it("does not create when auth changes during the final lookup", async () => {
    mockSwitchUserDuringNextLookup = true;

    await expect(createFinancialActionGroup(input())).rejects.toThrow(
      "auth_scope_changed"
    );
    expect(mockRecords).toHaveLength(0);
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
  });

  it("does not return the prior owner's model when auth changes during the batch", async () => {
    mockSwitchUserDuringBatch = true;

    await expect(createFinancialActionGroup(input())).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
    );
    expect(mockDatabaseBatch).toHaveBeenCalledTimes(1);
  });

  it("does not retry or mutate when auth changes during the final lookup", async () => {
    await createFinancialActionGroup(input());
    mockRecords[0]!.state = "sync_failed";
    mockRecords[0]!.rejectionCode = "offline";
    mockSwitchUserDuringNextLookup = true;
    mockDatabaseBatch.mockClear();

    await expect(retryFinancialActionGroup(ACTION_ID)).rejects.toThrow(
      "auth_scope_changed"
    );
    expect(mockRecords[0]).toMatchObject({
      state: "sync_failed",
      rejectionCode: "offline",
    });
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
  });

  it("does not return a row when auth changes during the awaited read", async () => {
    await createFinancialActionGroup(input());
    mockSwitchUserDuringNextLookup = true;

    await expect(getFinancialActionGroup(ACTION_ID)).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
    );
  });

  it("rejects non-null expected account revisions until the account-effect gate", async () => {
    await expect(
      createFinancialActionGroup(
        input(
          envelope({
            expectedAccountRevision: "0" as unknown as null,
          })
        )
      )
    ).rejects.toThrow(
      FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE
    );
    expect(mockRecords).toHaveLength(0);
  });

});
