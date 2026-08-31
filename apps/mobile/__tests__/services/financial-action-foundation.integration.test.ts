import { createHash } from "node:crypto";

import {
  FINANCIAL_ACTION_ERROR_CODES,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "../../../../packages/logic/src/financial-actions";
import type { Model } from "@nozbe/watermelondb";

const mockRecords: MockRecord[] = [];
let mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000003";
let nextLocalRowId = 0;
let mockSwitchUserDuringNextLookup = false;
let mockSwitchUserDuringBatch = false;
let mockFailBatchAfterApply = false;

interface MockRecord {
  table?: string;
  _raw: { id: string; state?: string };
  id: string;
  actionId: string;
  userId: string;
  domain: string;
  kind: string;
  domainReferenceId: string;
  payloadJson: string;
  payloadHash: string;
  accountGuardsJson: string;
  state: string;
  serverOutcome: string | null;
  outcomeJson: string | null;
  rejectionCode: string | null;
  deleted: boolean;
  updatedAt: Date;
  prepareUpdate: (updater: (record: MockRecord) => void) => MockRecord;
}

const mockCollection = {
  prepareCreate: jest.fn(
    (updater: (record: MockRecord) => void): MockRecord => {
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
        accountGuardsJson: "[]",
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
    }
  ),
};
const mockDatabaseWrite = jest.fn(
  async <T>(action: () => Promise<T>): Promise<T> => {
    const snapshot = mockRecords.map((record) => ({ ...record }));
    try {
      return await action();
    } catch (error) {
      mockRecords.splice(0, mockRecords.length, ...snapshot);
      throw error;
    }
  }
);
const mockDatabaseBatch = jest.fn(
  (...operations: MockRecord[]): Promise<void> => {
    operations.forEach((operation) => {
      if (!mockRecords.includes(operation)) mockRecords.push(operation);
    });
    if (mockFailBatchAfterApply) {
      mockFailBatchAfterApply = false;
      throw new Error("linked_write_failed");
    }
    if (mockSwitchUserDuringBatch) {
      mockSwitchUserDuringBatch = false;
      mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";
    }
    return Promise.resolve();
  }
);

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
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      userId: mockCurrentUserId,
      queryOwned: (): { fetch: () => Promise<MockRecord[]> } => {
        const scopedUserId = mockCurrentUserId;
        return {
          fetch: (): Promise<MockRecord[]> => {
            const records = mockRecords.filter(
              (record) => record.userId === scopedUserId
            );
            if (mockSwitchUserDuringNextLookup) {
              mockSwitchUserDuringNextLookup = false;
              mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";
            }
            return Promise.resolve(records);
          },
        };
      },
      assertOwned: (record: MockRecord): MockRecord => {
        if (record.userId !== mockCurrentUserId)
          throw new Error("ownership_failed");
        return record;
      },
    })
  ),
  assertExpectedCurrentUser: jest.fn(
    (expectedUserId: string): Promise<void> => {
      if (expectedUserId !== mockCurrentUserId)
        throw new Error("auth_scope_changed");
      return Promise.resolve();
    }
  ),
}));

import {
  type CommitFinancialActionGroupLocallyInput,
  type FinancialActionLinkedOperationOwnershipInput,
  type FinancialActionLinkedOperationPlan,
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES,
  commitFinancialActionGroupLocally,
  createFinancialActionGroup,
  getFinancialActionGroup,
  markFinancialActionGroupSyncFailed,
  retryFinancialActionGroup,
} from "../../services/financial-action-foundation-repository";

const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000001";
const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const DOMAIN_REFERENCE_ID = "018f0c7a-1234-7abc-8def-000000000002";
const sha256Provider: Sha256Provider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Promise.resolve(
      createHash("sha256").update(canonicalText, "utf8").digest("hex")
    ),
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
    accountGuards: [],
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

function linkedOperation(id: string): MockRecord {
  return {
    table: "linked_domain_evidence",
    _raw: { id, state: "local_complete" },
    id,
    actionId: id,
    userId: USER_ID,
    domain: "metals",
    kind: "linked_evidence",
    domainReferenceId: DOMAIN_REFERENCE_ID,
    payloadJson: "{}",
    payloadHash: "b".repeat(64),
    accountGuardsJson: "[]",
    state: "local_complete",
    serverOutcome: null,
    outcomeJson: null,
    rejectionCode: null,
    deleted: false,
    updatedAt: new Date(0),
    prepareUpdate(update: (value: MockRecord) => void): MockRecord {
      update(this);
      return this;
    },
  };
}

function requireMockRecord(index = 0): MockRecord {
  const record = mockRecords[index];
  if (!record) throw new Error(`Missing mock record at index ${index}`);
  return record;
}

function inputWithLinkedOperations(
  prepareOperations: () => readonly Model[],
  cachedModels: readonly Model[] = [],
  assertOwnership: (
    input: FinancialActionLinkedOperationOwnershipInput
  ) => Promise<void> = assertDirectLinkedOperationOwnership
): CommitFinancialActionGroupLocallyInput {
  return {
    ...input(),
    prepareLinkedOperationPlan:
      (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve({
          cachedModels,
          prepareOperations,
          assertOwnership,
        }),
  };
}

function assertDirectLinkedOperationOwnership(
  input: FinancialActionLinkedOperationOwnershipInput
): Promise<void> {
  [...input.cachedModels, ...input.preparedOperations].forEach((model) => {
    const record = model as unknown as MockRecord;
    if (record.userId !== input.userId) throw new Error("ownership_failed");
  });
  return Promise.resolve();
}

describe("financial action foundation repository", () => {
  beforeEach(() => {
    mockRecords.splice(0);
    mockCurrentUserId = USER_ID;
    nextLocalRowId = 0;
    mockSwitchUserDuringNextLookup = false;
    mockSwitchUserDuringBatch = false;
    mockFailBatchAfterApply = false;
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
      accountGuardsJson: "[]",
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
        input(
          envelope({ payload: { ...envelope().payload, notes: "changed" } })
        )
      )
    ).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH
    );
    expect(mockRecords).toHaveLength(1);
    expect(mockRecords[0]?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects changed canonical text when a faulty provider repeats a valid hash", async () => {
    const constantHashProvider: Sha256Provider = {
      digestUtf8: (): Promise<string> => Promise.resolve("a".repeat(64)),
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
    await expect(
      markFinancialActionGroupSyncFailed(ACTION_ID, "offline")
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.NOT_FOUND);
    expect(mockRecords[0]?.state).toBe("pending_local");
  });

  it("persists retry state across restart without changing immutable identity", async () => {
    await createFinancialActionGroup(input());
    requireMockRecord().state = "sync_pending";
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

    await expect(createFinancialActionGroup(input())).rejects.toThrow(
      "write_failed"
    );
    expect(mockRecords).toHaveLength(0);
  });

  it("atomically rolls back root and linked operation when the batch fails", async () => {
    const linked = linkedOperation("linked-domain-row");
    const prepareLinkedOperations = jest.fn((): readonly Model[] => [
      linked as unknown as Model,
    ]);
    mockFailBatchAfterApply = true;

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations(prepareLinkedOperations)
      )
    ).rejects.toThrow("linked_write_failed");

    expect(prepareLinkedOperations).toHaveBeenCalledTimes(1);
    expect(mockRecords).toHaveLength(0);
  });

  it("does not persist a root when linked operation preparation fails", async () => {
    const prepareOperations = jest.fn((): readonly Model[] => {
      throw new Error("linked_prepare_failed");
    });

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations(prepareOperations)
      )
    ).rejects.toThrow("linked_prepare_failed");

    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("rejects an empty linked local commit", async () => {
    const prepareOperations = jest.fn((): readonly Model[] => []);

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations(prepareOperations)
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("rejects linked operations that target the generic root table", async () => {
    const linked = linkedOperation("second-root");
    linked.table = "financial_action_groups";

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations((): readonly Model[] => [
          linked as unknown as Model,
        ])
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("rejects a linked plan that omits mandatory ownership validation", async () => {
    const linked = linkedOperation("unvalidated-domain-row");

    await expect(
      commitFinancialActionGroupLocally({
        ...input(),
        prepareLinkedOperationPlan:
          (): Promise<FinancialActionLinkedOperationPlan> =>
            Promise.resolve({
              cachedModels: [],
              prepareOperations: (): readonly Model[] => [
                linked as unknown as Model,
              ],
            } as unknown as FinancialActionLinkedOperationPlan),
      })
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(mockDatabaseBatch).not.toHaveBeenCalled();
  });

  it("requires ownership validation for the exact cached and prepared models before one atomic batch", async () => {
    const cached = linkedOperation("cached-domain-row");
    const prepared = linkedOperation("prepared-domain-row");
    const assertOwnership = jest.fn(assertDirectLinkedOperationOwnership);

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations(
          (): readonly Model[] => [prepared as unknown as Model],
          [cached as unknown as Model],
          assertOwnership
        )
      )
    ).resolves.toMatchObject({ kind: "committed" });

    expect(assertOwnership).toHaveBeenCalledTimes(1);
    expect(assertOwnership).toHaveBeenCalledWith({
      userId: USER_ID,
      cachedModels: [cached],
      preparedOperations: [prepared],
    });
    expect(mockDatabaseBatch).toHaveBeenCalledTimes(1);
    expect(mockDatabaseBatch).toHaveBeenCalledWith(
      expect.objectContaining({ state: "local_complete", userId: USER_ID }),
      prepared
    );
  });

  it("rolls back cached preparation and never batches a foreign direct-owner model", async () => {
    const foreign = linkedOperation("foreign-domain-row");
    foreign.userId = "018f0c7a-1234-7abc-8def-000000000099";

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations((): readonly Model[] => {
          foreign.prepareUpdate((record) => {
            record.state = "mutated-before-validation";
            record._raw.state = "mutated-before-validation";
          });
          return [foreign as unknown as Model];
        }, [foreign as unknown as Model])
      )
    ).rejects.toThrow("ownership_failed");

    expect(foreign._raw.state).toBe("local_complete");
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("never batches a child model whose owned parent is foreign", async () => {
    const child = linkedOperation("foreign-owned-parent-row");
    const parentUserId = "018f0c7a-1234-7abc-8def-000000000099";
    const assertOwnedParent = jest.fn(
      (expectedUserId: string): Promise<void> => {
        if (parentUserId !== expectedUserId)
          throw new Error("ownership_failed");
        return Promise.resolve();
      }
    );
    const assertOwnership = jest.fn(
      async (
        ownershipInput: FinancialActionLinkedOperationOwnershipInput
      ): Promise<void> => {
        expect(ownershipInput.cachedModels).toEqual([child]);
        expect(ownershipInput.preparedOperations).toEqual([child]);
        await assertOwnedParent(ownershipInput.userId);
      }
    );

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations(
          (): readonly Model[] => [child as unknown as Model],
          [child as unknown as Model],
          assertOwnership
        )
      )
    ).rejects.toThrow("ownership_failed");

    expect(assertOwnership).toHaveBeenCalledTimes(1);
    expect(assertOwnedParent).toHaveBeenCalledWith(USER_ID);
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
  });

  it("rechecks auth after the asynchronous linked plan", async () => {
    const linked = linkedOperation("linked-domain-row");

    await expect(
      commitFinancialActionGroupLocally({
        ...input(),
        prepareLinkedOperationPlan:
          async (): Promise<FinancialActionLinkedOperationPlan> => {
            await Promise.resolve();
            mockCurrentUserId = "018f0c7a-1234-7abc-8def-000000000099";
            return {
              cachedModels: [],
              prepareOperations: (): readonly Model[] => [
                linked as unknown as Model,
              ],
              assertOwnership: assertDirectLinkedOperationOwnership,
            };
          },
      })
    ).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
    );

    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(0);
  });

  it("commits linked operations once and does not reapply them on replay", async () => {
    const linked = linkedOperation("linked-domain-row");
    const firstPrepare = jest.fn((): readonly Model[] => [
      linked as unknown as Model,
    ]);
    const replayPrepare = jest.fn((): readonly Model[] => [
      linkedOperation("duplicate-domain-row") as unknown as Model,
    ]);
    const replayAssertOwnership = jest.fn(assertDirectLinkedOperationOwnership);

    await expect(
      commitFinancialActionGroupLocally(inputWithLinkedOperations(firstPrepare))
    ).resolves.toMatchObject({
      kind: "committed",
      record: { state: "local_complete" },
    });
    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations(replayPrepare, [], replayAssertOwnership)
      )
    ).resolves.toMatchObject({ kind: "replay" });

    expect(firstPrepare).toHaveBeenCalledTimes(1);
    expect(replayPrepare).not.toHaveBeenCalled();
    expect(replayAssertOwnership).not.toHaveBeenCalled();
    expect(mockRecords.map((record) => record.id)).toEqual([
      expect.stringMatching(/^local-financial-action-/),
      "linked-domain-row",
    ]);
  });

  it("resumes a matching pending root without creating a duplicate", async () => {
    const linked = linkedOperation("linked-domain-row");
    await createFinancialActionGroup(input());

    await expect(
      commitFinancialActionGroupLocally(
        inputWithLinkedOperations((): readonly Model[] => [
          linked as unknown as Model,
        ])
      )
    ).resolves.toMatchObject({
      kind: "committed",
      record: { state: "local_complete" },
    });

    expect(
      mockRecords.filter((record) => record.actionId === ACTION_ID)
    ).toHaveLength(1);
    expect(mockRecords).toHaveLength(2);
  });

  it("rejects a pending-root hash mismatch before preparing linked operations", async () => {
    await createFinancialActionGroup(input());
    const prepareLinkedOperationPlan = jest.fn(
      (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve({
          cachedModels: [],
          prepareOperations: (): readonly Model[] => [
            linkedOperation("linked-domain-row") as unknown as Model,
          ],
          assertOwnership: assertDirectLinkedOperationOwnership,
        })
    );

    await expect(
      commitFinancialActionGroupLocally({
        ...input(
          envelope({
            payload: { ...envelope().payload, notes: "changed" },
          })
        ),
        prepareLinkedOperationPlan,
      })
    ).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.ACTION_ID_PAYLOAD_MISMATCH
    );

    expect(prepareLinkedOperationPlan).not.toHaveBeenCalled();
    expect(mockRecords).toHaveLength(1);
  });

  it("rejects unvalidated root fields before opening a local writer", async () => {
    const untrustedEnvelope = {
      ...envelope(),
      attackerControlledRoot: "override",
    } as unknown as FinancialActionEnvelopeV1;

    await expect(
      createFinancialActionGroup(input(untrustedEnvelope))
    ).rejects.toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE);
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
    ).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
    );

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
    const record = requireMockRecord();
    record.state = "sync_failed";
    record.rejectionCode = "offline";
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

  it("rejects update completion when auth changes during the awaited batch", async () => {
    await createFinancialActionGroup(input());
    const record = requireMockRecord();
    record.state = "sync_failed";
    record.rejectionCode = "offline";
    mockSwitchUserDuringBatch = true;

    await expect(retryFinancialActionGroup(ACTION_ID)).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
    );
    expect(mockDatabaseBatch).toHaveBeenCalledTimes(2);
  });

  it("does not return a row when auth changes during the awaited read", async () => {
    await createFinancialActionGroup(input());
    mockSwitchUserDuringNextLookup = true;

    await expect(getFinancialActionGroup(ACTION_ID)).rejects.toThrow(
      FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.AUTH_SCOPE_CHANGED
    );
  });

  it("rejects non-empty account guards until the account-effect gate", async () => {
    await expect(
      createFinancialActionGroup(
        input(
          envelope({
            accountGuards: [
              {
                accountId: "018f0c7a-1234-7abc-8def-000000000007",
                expectedRevision: "0",
              },
            ] as unknown as [],
          })
        )
      )
    ).rejects.toThrow(FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE);
    expect(mockRecords).toHaveLength(0);
  });
});
