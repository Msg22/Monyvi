import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Database, Model } from "@nozbe/watermelondb";

jest.mock("@monyvi/db", () => ({ database: {} }));
jest.mock("@nozbe/watermelondb", () => ({
  Q: { where: jest.fn(() => ({})) },
}));
jest.mock("../../services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn(),
  getCurrentUserDataScope: jest.fn(),
}));

import {
  FINANCIAL_ACTION_FOUNDATION_ERROR_CODES,
  createFinancialActionFoundationRepository,
  type FinancialActionFoundationRepository,
  type FinancialActionLinkedOperationPlan,
  type FinancialActionLinkedOperationPreparedOwnershipInput,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";
import type { FinancialActionEnvelopeV1 } from "../../../../packages/logic/src/financial-actions";

interface FakeRaw {
  _status?: string;
  id: string;
  parent_id?: string;
  user_id?: string;
}

interface FakeModel {
  readonly id: string;
  readonly table: string;
  _isEditing: boolean;
  _preparedState: Model["_preparedState"];
  _raw: FakeRaw;
  actionId?: string;
  userId?: string;
  domain?: string;
  kind?: string;
  domainReferenceId?: string;
  payloadJson?: string;
  payloadHash?: string;
  accountGuardsJson?: string;
  state?: string;
  serverOutcome?: string | null;
  outcomeJson?: string | null;
  rejectionCode?: string | null;
  deleted?: boolean;
  updatedAt?: Date;
  prepareUpdate: (update: (model: Model) => void) => Model;
  prepareMarkAsDeleted: () => Model;
}

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const mockBatch = jest.fn((): Promise<void> => Promise.resolve());
const mockAssertCachedOwnership = jest.fn(
  (): Promise<void> => Promise.resolve()
);
const mockAssertPreparedOwnership = jest.fn(
  (): Promise<void> => Promise.resolve()
);

function fakeModel(
  id: string,
  table: string,
  preparedState: Model["_preparedState"] = null
): FakeModel {
  const model: FakeModel = {
    id,
    table,
    _isEditing: false,
    _preparedState: preparedState,
    _raw: { id, _status: preparedState === "create" ? "created" : "synced" },
    prepareUpdate(update): Model {
      if (this._preparedState || this._isEditing) {
        throw new Error("watermelon_pending_changes");
      }
      this._isEditing = true;
      update(this as unknown as Model);
      this._isEditing = false;
      this._preparedState = "update";
      return this as unknown as Model;
    },
    prepareMarkAsDeleted(): Model {
      if (this._preparedState || this._isEditing) {
        throw new Error("watermelon_pending_changes");
      }
      this._raw._status = "deleted";
      this._preparedState = "markAsDeleted";
      return this as unknown as Model;
    },
  };
  return model;
}

function assertFakeRaw(
  raw: Readonly<Model["_raw"]>
): asserts raw is Readonly<Model["_raw"]> & Readonly<FakeRaw> {
  const candidate = raw as unknown as Partial<FakeRaw>;
  if (
    typeof candidate.id !== "string" ||
    (candidate.parent_id !== undefined &&
      typeof candidate.parent_id !== "string") ||
    (candidate.user_id !== undefined && typeof candidate.user_id !== "string")
  ) {
    throw new Error("invalid_fake_raw");
  }
}

function envelope(): FinancialActionEnvelopeV1 {
  return {
    actionId: "018f0c7a-1234-7abc-8def-000000000001",
    userId: USER_ID,
    domain: "metals",
    kind: "sell",
    domainReferenceId: "018f0c7a-1234-7abc-8def-000000000002",
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
  };
}

function createRepository(): FinancialActionFoundationRepository {
  const rootCollection = {
    prepareCreate: (update: (model: FakeModel) => void): Model => {
      const root = fakeModel("root-row", "financial_action_groups", "create");
      update(root);
      return root as unknown as Model;
    },
  };
  const database = {
    batch: mockBatch,
    get: jest.fn(() => rootCollection),
    write: async <T>(action: () => Promise<T>): Promise<T> => action(),
  } as unknown as Database;
  const emptyOwnedQuery = {
    fetch: (): Promise<never[]> => Promise.resolve([]),
  };
  const queryOwned: FinancialActionUserDataScope["queryOwned"] = () =>
    emptyOwnedQuery as never;
  const assertOwned: FinancialActionUserDataScope["assertOwned"] = (model) =>
    model;
  const scope: FinancialActionUserDataScope = {
    userId: USER_ID,
    queryOwned,
    assertOwned,
  };

  return createFinancialActionFoundationRepository({
    database,
    getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
      Promise.resolve(scope),
    assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
  });
}

function plan(
  existingOperations: FinancialActionLinkedOperationPlan["existingOperations"],
  preparedCreates: readonly Model[] = [],
  assertPreparedOwnership: FinancialActionLinkedOperationPlan["assertPreparedOwnership"] = mockAssertPreparedOwnership
): FinancialActionLinkedOperationPlan {
  return {
    preparedCreates,
    existingOperations,
    assertCachedOwnership: mockAssertCachedOwnership,
    assertPreparedOwnership,
  };
}

async function commit(
  linkedPlan: FinancialActionLinkedOperationPlan
): Promise<void> {
  const repository = createRepository();
  await repository.commitFinancialActionGroupLocally({
    envelope: envelope(),
    hashProvider: {
      digestUtf8: (value): Promise<string> =>
        Promise.resolve(createHash("sha256").update(value).digest("hex")),
    },
    prepareLinkedOperationPlan:
      (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve(linkedPlan),
  });
}

describe("financial action linked plan safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("provides an immutable preimage so same-user A-to-B reparenting is rejected and rolled back", async () => {
    const child = fakeModel("child-row", "asset_metals");
    child._raw.user_id = USER_ID;
    child._raw.parent_id = "parent-a";
    const originalRaw = { ...child._raw };
    const assertPreparedOwnership = jest.fn(
      (
        input: FinancialActionLinkedOperationPreparedOwnershipInput
      ): Promise<void> => {
        expect(input.cachedPreimages).toEqual([
          { id: child.id, table: child.table, raw: originalRaw },
        ]);
        expect(Object.isFrozen(input.cachedPreimages)).toBe(true);
        expect(Object.isFrozen(input.cachedPreimages[0]?.raw)).toBe(true);
        const preimage = input.cachedPreimages[0];
        if (!preimage) throw new Error("missing_preimage");
        assertFakeRaw(preimage.raw);
        const preparedChild = input
          .preparedOperations[0] as unknown as FakeModel;
        if (preimage.raw.parent_id !== preparedChild._raw.parent_id) {
          throw new Error("ownership_failed");
        }
        return Promise.resolve();
      }
    );

    await expect(
      commit(
        plan(
          [
            {
              kind: "update",
              model: child as unknown as Model,
              update: (model): void => {
                (model as unknown as FakeModel)._raw.parent_id = "parent-b";
              },
            },
          ],
          [],
          assertPreparedOwnership as never
        )
      )
    ).rejects.toThrow("ownership_failed");

    expect(child._raw).toEqual(originalRaw);
    expect(child._preparedState).toBeNull();
    expect(child._isEditing).toBe(false);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it.each([
    ["prepared", "update" as const, false],
    ["editing", null, true],
  ])(
    "rejects a %s existing model without changing its state",
    async (_case, state, isEditing) => {
      const model = fakeModel("existing-row", "asset_metals", state);
      model._isEditing = isEditing;

      await expect(
        commit(
          plan([
            {
              kind: "update",
              model: model as unknown as Model,
              update: jest.fn(),
            },
          ])
        )
      ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

      expect(model._preparedState).toBe(state);
      expect(model._isEditing).toBe(isEditing);
      expect(mockAssertCachedOwnership).not.toHaveBeenCalled();
    }
  );

  it("rejects duplicate existing descriptors before either updater runs", async () => {
    const model = fakeModel("duplicate-row", "asset_metals");
    const update = jest.fn();

    await expect(
      commit(
        plan([
          { kind: "update", model: model as unknown as Model, update },
          { kind: "update", model: model as unknown as Model, update },
        ])
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(update).not.toHaveBeenCalled();
    expect(model._preparedState).toBeNull();
  });

  it("rejects model identity overlap between prepared creates and existing descriptors", async () => {
    const overlapped = fakeModel("overlap-row", "asset_metals", "create");

    await expect(
      commit(
        plan(
          [
            {
              kind: "update",
              model: overlapped as unknown as Model,
              update: jest.fn(),
            },
          ],
          [overlapped as unknown as Model]
        )
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(overlapped._preparedState).toBe("create");
    expect(overlapped._isEditing).toBe(false);
  });

  it("prepares markAsDeleted through the snapshotted existing-model branch", async () => {
    const model = fakeModel("soft-delete-row", "asset_metals");

    await expect(
      commit(
        plan([{ kind: "markAsDeleted", model: model as unknown as Model }])
      )
    ).resolves.toBeUndefined();

    expect(model._preparedState).toBe("markAsDeleted");
    expect(mockBatch).toHaveBeenCalledWith(
      expect.anything(),
      model as unknown as Model
    );
  });

  it("does not expose unrestricted hard-delete preparation", () => {
    const repositorySource = readFileSync(
      resolve(
        __dirname,
        "../../services/financial-action-foundation-repository.ts"
      ),
      "utf8"
    );

    expect(repositorySource).not.toContain('kind: "destroyPermanently"');
    expect(repositorySource).not.toContain("prepareDestroyPermanently");
  });
});
