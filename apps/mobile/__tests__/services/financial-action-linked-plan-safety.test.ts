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
  type FinancialActionLinkedOperationCachedOwnershipInput,
  type FinancialActionLinkedOperationPlan,
  type FinancialActionLinkedOperationPreparedOwnershipInput,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";
import type { FinancialActionEnvelopeV1 } from "../../../../packages/logic/src/financial-actions";

interface FakeRaw {
  _status?: string;
  amount_minor?: string;
  deleted?: boolean;
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

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

interface MutableUpdateOperation {
  kind: "update";
  model: Model;
  update: (model: Model) => void;
}

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const mockBatch = jest.fn(
  (..._operations: Model[]): Promise<void> => Promise.resolve()
);
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
    get id(): string {
      return this._raw.id;
    },
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

function deferred(): Deferred {
  let resolvePromise = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (): void => resolvePromise() };
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
  let ownedRoot: Model | null = null;
  const rootCollection = {
    prepareCreate: (update: (model: FakeModel) => void): Model => {
      const root = fakeModel("root-row", "financial_action_groups", "create");
      update(root);
      return root as unknown as Model;
    },
  };
  const database = {
    batch: async (...operations: Model[]): Promise<void> => {
      await mockBatch(...operations);
      const root = operations.find(
        (operation) => operation.table === "financial_action_groups"
      );
      if (root) {
        root._preparedState = null;
        root._isEditing = false;
        ownedRoot = root;
      }
    },
    get: jest.fn(() => rootCollection),
    write: async <T>(action: () => Promise<T>): Promise<T> => action(),
  } as unknown as Database;
  const emptyOwnedQuery = {
    fetch: (): Promise<Model[]> => Promise.resolve(ownedRoot ? [ownedRoot] : []),
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
  assertPreparedOwnership: FinancialActionLinkedOperationPlan["assertPreparedOwnership"] = mockAssertPreparedOwnership,
  assertCachedOwnership: FinancialActionLinkedOperationPlan["assertCachedOwnership"] = mockAssertCachedOwnership
): FinancialActionLinkedOperationPlan {
  return {
    preparedCreates,
    existingOperations,
    assertCachedOwnership,
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

async function createPendingRootAndCommit(
  linkedPlan: FinancialActionLinkedOperationPlan,
  mutateRoot: (root: FakeModel) => void
): Promise<FakeModel> {
  const repository = createRepository();
  const createResult = await repository.createFinancialActionGroup({
    envelope: envelope(),
    hashProvider: {
      digestUtf8: (value): Promise<string> =>
        Promise.resolve(createHash("sha256").update(value).digest("hex")),
    },
  });
  const root = createResult.record as unknown as FakeModel;
  const assertCachedOwnership = jest.fn((): Promise<void> => {
    mutateRoot(root);
    return Promise.resolve();
  });

  await expect(
    repository.commitFinancialActionGroupLocally({
      envelope: envelope(),
      hashProvider: {
        digestUtf8: (value): Promise<string> =>
          Promise.resolve(createHash("sha256").update(value).digest("hex")),
      },
      prepareLinkedOperationPlan: (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve({ ...linkedPlan, assertCachedOwnership }),
    })
  ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);
  return root;
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
          { id: child.id, kind: "update", table: child.table, raw: originalRaw },
        ]);
        expect(Object.isFrozen(input.cachedPreimages)).toBe(true);
        expect(Object.isFrozen(input.cachedPreimages[0]?.raw)).toBe(true);
        const preimage = input.cachedPreimages[0];
        if (!preimage) throw new Error("missing_preimage");
        assertFakeRaw(preimage.raw);
        const preparedChild = input.preparedPostimages[0];
        if (!preparedChild) throw new Error("missing_postimage");
        assertFakeRaw(preparedChild.raw);
        if (preimage.raw.parent_id !== preparedChild.raw.parent_id) {
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

  it("uses frozen plan copies when retained arrays and descriptors mutate during cached validation", async () => {
    const validationStarted = deferred();
    const releaseValidation = deferred();
    const safeExisting = fakeModel("safe-existing", "asset_metals");
    const swappedForeign = fakeModel("swapped-foreign", "asset_metals");
    const appendedForeign = fakeModel("appended-foreign", "asset_metals");
    const initialCreate = fakeModel("initial-create", "asset_metals", "create");
    const appendedCreate = fakeModel(
      "appended-create",
      "asset_metals",
      "create"
    );
    const safeUpdate = jest.fn();
    const swappedUpdate = jest.fn();
    const appendedUpdate = jest.fn();
    const retainedDescriptor: MutableUpdateOperation = {
      kind: "update",
      model: safeExisting as unknown as Model,
      update: safeUpdate,
    };
    const retainedExistingOperations: Array<
      FinancialActionLinkedOperationPlan["existingOperations"][number]
    > = [retainedDescriptor];
    const retainedPreparedCreates: Model[] = [
      initialCreate as unknown as Model,
    ];
    const assertCachedOwnership = jest.fn(
      async (
        input: FinancialActionLinkedOperationCachedOwnershipInput
      ): Promise<void> => {
        const areCachedPreimagesFrozen = Object.isFrozen(input.cachedPreimages);
        validationStarted.resolve();
        await releaseValidation.promise;
        expect(areCachedPreimagesFrozen).toBe(true);
      }
    );
    const assertPreparedOwnership = jest.fn(
      (
        input: FinancialActionLinkedOperationPreparedOwnershipInput
      ): Promise<void> => {
        expect(Object.isFrozen(input.cachedPreimages)).toBe(true);
        expect(Object.isFrozen(input.preparedPostimages)).toBe(true);
        return Promise.resolve();
      }
    );
    const commitPromise = commit(
      plan(
        retainedExistingOperations,
        retainedPreparedCreates,
        assertPreparedOwnership,
        assertCachedOwnership
      )
    );

    await validationStarted.promise;
    retainedDescriptor.model = swappedForeign as unknown as Model;
    retainedDescriptor.update = swappedUpdate;
    retainedExistingOperations.push({
      kind: "update",
      model: appendedForeign as unknown as Model,
      update: appendedUpdate,
    });
    retainedPreparedCreates.push(appendedCreate as unknown as Model);
    releaseValidation.resolve();

    await expect(commitPromise).resolves.toBeUndefined();
    expect(safeUpdate).toHaveBeenCalledTimes(1);
    expect(swappedUpdate).not.toHaveBeenCalled();
    expect(appendedUpdate).not.toHaveBeenCalled();
    expect(swappedForeign._preparedState).toBeNull();
    expect(appendedForeign._preparedState).toBeNull();
    expect(appendedCreate._preparedState).toBe("create");
    expect(mockBatch).toHaveBeenCalledWith(
      expect.anything(),
      initialCreate as unknown as Model,
      safeExisting as unknown as Model
    );
  });

  it("rejects cached-validator update-model tampering before update preparation", async () => {
    const existing = fakeModel("cached-update", "asset_metals");
    existing._raw.user_id = USER_ID;
    existing._raw.parent_id = "holding-a";
    existing._raw.amount_minor = "100";
    existing._raw.deleted = false;
    const originalRaw = { ...existing._raw };
    const update = jest.fn();
    const prepareUpdate = jest.spyOn(existing, "prepareUpdate");
    const assertCachedOwnership = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      existing._raw.user_id = "018f0c7a-1234-7abc-8def-000000000099";
      existing._raw.parent_id = "holding-b";
      existing._raw.amount_minor = "999";
    });

    await expect(
      commit(
        plan(
          [
            {
              kind: "update",
              model: existing as unknown as Model,
              update,
            },
          ],
          [],
          mockAssertPreparedOwnership,
          assertCachedOwnership
        )
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(prepareUpdate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(mockAssertPreparedOwnership).not.toHaveBeenCalled();
    expect(mockBatch).not.toHaveBeenCalled();
    expect(existing._raw).toEqual(originalRaw);
    expect(existing._preparedState).toBeNull();
    expect(existing._isEditing).toBe(false);
  });

  it("rejects cached-validator delete-model tampering before delete preparation", async () => {
    const existing = fakeModel("cached-delete", "asset_metals");
    existing._raw.user_id = USER_ID;
    existing._raw.parent_id = "holding-a";
    existing._raw.amount_minor = "100";
    existing._raw.deleted = false;
    const originalRaw = { ...existing._raw };
    const prepareMarkAsDeleted = jest.spyOn(existing, "prepareMarkAsDeleted");
    const assertCachedOwnership = jest.fn(async (): Promise<void> => {
      await Promise.resolve();
      existing._raw.user_id = "018f0c7a-1234-7abc-8def-000000000099";
      existing._raw.parent_id = "holding-b";
      existing._raw.amount_minor = "999";
    });

    await expect(
      commit(
        plan(
          [
            {
              kind: "markAsDeleted",
              model: existing as unknown as Model,
            },
          ],
          [],
          mockAssertPreparedOwnership,
          assertCachedOwnership
        )
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(prepareMarkAsDeleted).not.toHaveBeenCalled();
    expect(mockAssertPreparedOwnership).not.toHaveBeenCalled();
    expect(mockBatch).not.toHaveBeenCalled();
    expect(existing._raw).toEqual(originalRaw);
    expect(existing._preparedState).toBeNull();
    expect(existing._isEditing).toBe(false);
  });

  it.each([
    [
      "state",
      (model: FakeModel): void => {
        model._preparedState = "update";
      },
    ],
    [
      "identity",
      (model: FakeModel): void => {
        Object.defineProperty(model, "id", { value: "mutated-create-id" });
      },
    ],
  ] as const)(
    "reasserts prepared-create %s after prepared ownership validation",
    async (_case, mutatePreparedCreate) => {
      const preparedCreate = fakeModel(
        "validator-mutated-create",
        "asset_metals",
        "create"
      );
      const assertPreparedOwnership = jest.fn((): Promise<void> => {
        mutatePreparedCreate(preparedCreate);
        return Promise.resolve();
      });

      await expect(
        commit(
          plan(
            [],
            [preparedCreate as unknown as Model],
            assertPreparedOwnership
          )
        )
      ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

      expect(mockBatch).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["later", "update"],
    ["later", "soft-delete"],
    ["earlier", "update"],
    ["earlier", "soft-delete"],
  ] as const)(
    "rejects an updater mutating an %s prepared %s model",
    async (targetPosition, targetKind) => {
      const earlier = fakeModel(`earlier-${targetKind}`, "asset_metals");
      const later = fakeModel(`later-${targetKind}`, "asset_metals");
      const target = targetPosition === "earlier" ? earlier : later;
      target._raw.amount_minor = "100";
      target._raw.deleted = false;
      const earlierRaw = { ...earlier._raw };
      const laterRaw = { ...later._raw };
      const targetUpdate = jest.fn();
      const prepareTarget = jest.spyOn(
        target,
        targetKind === "update" ? "prepareUpdate" : "prepareMarkAsDeleted"
      );
      const mutateTarget = (): void => {
        target._raw.amount_minor = "999";
        target._raw.deleted = true;
      };
      const earlierOperation =
        targetPosition === "later"
          ? { kind: "update" as const, model: earlier as unknown as Model, update: mutateTarget }
          : targetKind === "update"
            ? { kind: "update" as const, model: earlier as unknown as Model, update: targetUpdate }
            : { kind: "markAsDeleted" as const, model: earlier as unknown as Model };
      const laterOperation =
        targetPosition === "earlier"
          ? { kind: "update" as const, model: later as unknown as Model, update: mutateTarget }
          : targetKind === "update"
            ? { kind: "update" as const, model: later as unknown as Model, update: targetUpdate }
            : { kind: "markAsDeleted" as const, model: later as unknown as Model };

      await expect(
        commit(plan([earlierOperation, laterOperation]))
      ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

      expect(prepareTarget).toHaveBeenCalledTimes(
        targetPosition === "earlier" ? 1 : 0
      );
      expect(mockAssertPreparedOwnership).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
      expect(earlier._raw).toEqual(earlierRaw);
      expect(later._raw).toEqual(laterRaw);
      expect(earlier._preparedState).toBeNull();
      expect(later._preparedState).toBeNull();
      expect(earlier._isEditing).toBe(false);
      expect(later._isEditing).toBe(false);
    }
  );

  it.each([
    [
      "raw",
      (model: FakeModel): void => {
        model._raw.amount_minor = "999";
      },
    ],
    [
      "identity",
      (model: FakeModel): void => {
        model._raw.id = "updater-tampered-id";
      },
    ],
    [
      "prepared state",
      (model: FakeModel): void => {
        model._preparedState = "update";
        model._isEditing = true;
      },
    ],
  ] as const)(
    "rejects existing updater closure tampering with prepared-create %s",
    async (_case, tamperPreparedCreate) => {
      const existing = fakeModel("updater-existing", "asset_metals");
      const preparedCreate = fakeModel(
        "updater-create",
        "asset_metals",
        "create"
      );
      preparedCreate._raw.amount_minor = "100";
      const originalRaw = { ...preparedCreate._raw };

      await expect(
        commit(
          plan(
            [
              {
                kind: "update",
                model: existing as unknown as Model,
                update: (): void => tamperPreparedCreate(preparedCreate),
              },
            ],
            [preparedCreate as unknown as Model]
          )
        )
      ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

      expect(preparedCreate._raw).toEqual(originalRaw);
      expect(preparedCreate._preparedState).toBe("create");
      expect(preparedCreate._isEditing).toBe(false);
      expect(mockAssertPreparedOwnership).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "owner",
      (root: FakeModel): void => {
        root._raw.user_id = "018f0c7a-1234-7abc-8def-000000000099";
      },
    ],
    [
      "state",
      (root: FakeModel): void => {
        (root._raw as FakeRaw & { state?: string }).state = "accepted";
      },
    ],
    [
      "payload",
      (root: FakeModel): void => {
        (root._raw as FakeRaw & { payload_json?: string }).payload_json =
          '{"tampered":true}';
      },
    ],
  ] as const)(
    "rejects pending-root %s closure mutation during cached ownership validation",
    async (_case, mutateRoot) => {
      const preparedCreate = fakeModel(
        "pending-root-linked-row",
        "asset_metals",
        "create"
      );
      const root = await createPendingRootAndCommit(
        plan([], [preparedCreate as unknown as Model]),
        mutateRoot
      );

      expect(root._raw).toEqual({ id: "root-row", _status: "created" });
      expect(root._preparedState).toBeNull();
      expect(root._isEditing).toBe(false);
      expect(preparedCreate._preparedState).toBe("create");
      expect(mockBatch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [
      "update",
      "identity",
      (model: FakeModel): void => {
        model._raw.id = "tampered-existing-id";
      },
    ],
    [
      "update",
      "prepared state",
      (model: FakeModel): void => {
        model._preparedState = "destroyPermanently";
        model._isEditing = true;
      },
    ],
    [
      "markAsDeleted",
      "identity",
      (model: FakeModel): void => {
        model._raw.id = "tampered-existing-id";
      },
    ],
    [
      "markAsDeleted",
      "prepared state",
      (model: FakeModel): void => {
        model._preparedState = "destroyPermanently";
        model._isEditing = true;
      },
    ],
    [
      "update",
      "raw parent",
      (model: FakeModel): void => {
        model._raw.parent_id = "tampered-parent";
      },
    ],
    [
      "markAsDeleted",
      "raw deleted flag",
      (model: FakeModel): void => {
        model._raw.deleted = false;
      },
    ],
  ] as const)(
    "rejects %s descriptor %s tampering and restores its cached model",
    async (operationKind, _tamperKind, tamper) => {
      const existing = fakeModel("tampered-existing", "asset_metals");
      const originalRaw = { ...existing._raw };
      const existingOperation: FinancialActionLinkedOperationPlan["existingOperations"][number] =
        operationKind === "update"
          ? {
              kind: "update",
              model: existing as unknown as Model,
              update: (): void => undefined,
            }
          : {
              kind: "markAsDeleted",
              model: existing as unknown as Model,
            };
      const assertPreparedOwnership = jest.fn(
        (
          input: FinancialActionLinkedOperationPreparedOwnershipInput
        ): Promise<void> => {
          expect(Object.isFrozen(input.preparedPostimages[0])).toBe(true);
          expect(Object.isFrozen(input.preparedPostimages[0]?.raw)).toBe(true);
          const snapshotRaw = input.preparedPostimages[0]?.raw as unknown as FakeRaw;
          snapshotRaw.parent_id = "snapshot-tamper";
          expect(snapshotRaw.parent_id).not.toBe("snapshot-tamper");
          tamper(existing);
          return Promise.resolve();
        }
      );

      await expect(
        commit(plan([existingOperation], [], assertPreparedOwnership))
      ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

      expect(existing._raw).toEqual(originalRaw);
      expect(existing._preparedState).toBeNull();
      expect(existing._isEditing).toBe(false);
      expect(mockBatch).not.toHaveBeenCalled();
    }
  );

  it("rejects prepared-create raw tampering before batch", async () => {
    const preparedCreate = fakeModel("tampered-create", "asset_metals", "create");
    preparedCreate._raw.amount_minor = "100";
    const originalRaw = { ...preparedCreate._raw };
    const assertPreparedOwnership = jest.fn((
      input: FinancialActionLinkedOperationPreparedOwnershipInput
    ): Promise<void> => {
      expect(Object.isFrozen(input.preparedPostimages[0]?.raw)).toBe(true);
      const snapshotRaw = input.preparedPostimages[0]?.raw as unknown as FakeRaw;
      snapshotRaw.amount_minor = "snapshot-tamper";
      expect(snapshotRaw.amount_minor).toBe("100");
      preparedCreate._raw.amount_minor = "999";
      return Promise.resolve();
    });

    await expect(
      commit(
        plan([], [preparedCreate as unknown as Model], assertPreparedOwnership)
      )
    ).rejects.toThrow(FINANCIAL_ACTION_FOUNDATION_ERROR_CODES.INVALID_INPUT);

    expect(preparedCreate._raw).toEqual(originalRaw);
    expect(preparedCreate._preparedState).toBe("create");
    expect(preparedCreate._isEditing).toBe(false);
    expect(mockBatch).not.toHaveBeenCalled();
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
