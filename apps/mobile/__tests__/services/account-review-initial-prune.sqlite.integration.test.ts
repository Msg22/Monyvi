/**
 * #395 T049 narrow original-queue prune ownership repair.
 * Real Watermelon/SQLite adapter and real T048 Save/foundation/private snapshot.
 * The only fault injection edits a cached original queue AFTER frozen ownership
 * validation and BEFORE the genuine private snapshot builder. No SUT stub.
 */
import { Q, type Model } from "@nozbe/watermelondb";
import type {
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
} from "@monyvi/db";
import {
  createAccountReviewFinancialRegistry,
} from "../../services/account-review-financial-command-service";
import { physicalRawField } from
  "../../services/account-review-local-snapshot-postimages";
import {
  createFinancialActionFoundationRepository,
} from "../../services/financial-action-foundation-repository";
import type {
  FinancialActionLinkedOperationPlan,
} from "../../services/financial-action-foundation-contracts";
import {
  constructReviewSave,
} from "../../services/account-review-save-plan";
import {
  freezeSelectedAccountReview,
} from "../../services/account-review-save-preparation";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "../../services/user-data-access";
import {
  physicalSaveLedgerSnapshot,
} from "./account-review-save-sqlite-test-helpers";
import {
  database,
  cloneRecoverySqlite,
  hashProvider,
  readPrivateOwnedRoot,
  requireActionRoot,
  resetRecoverySqlite,
  saveReview,
  seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";
import {
  FINGERPRINT_A,
  FOREIGN_OWNER,
  OWNER,
  SESSION,
  makeSaveFixture,
  testUuid,
} from "./account-review-save-test-fixtures";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Adapter({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database, __adapter: adapter, schema, Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => {
    const { OWNER: owner } = jest.requireActual<
      typeof import("./account-review-save-test-fixtures")
    >("./account-review-save-test-fixtures");
    return Promise.resolve(owner);
  },
  supabase: {},
}));

beforeEach(async (): Promise<void> => {
  await resetRecoverySqlite();
});

async function originalSmsQueue(): Promise<SmsReviewQueue> {
  const rows = await database.get<SmsReviewQueue>(
    "sms_review_queues"
  ).query(Q.where("user_id", OWNER)).fetch();
  const queue = rows[0];
  if (rows.length !== 1 || !queue || queue.id !== SESSION)
    throw new Error("expected_exact_owned_sms_queue");
  return queue;
}

describe("#395 T049 initial selected Save prunes only proven original queue", () => {
  it("P01 commits the root, effects, all selected drafts and original queue tombstone in ONE real SQLite batch", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const original = await originalSmsQueue();
    const header = {
      id: original.id,
      userId: original.userId,
      createdAt: original.createdAt.toISOString(),
      updatedAt: original.updatedAt.toISOString(),
    };
    const batch = jest.spyOn(database, "batch");
    try {
      await expect(saveReview(fixture)).resolves.toMatchObject({
        kind: "committed",
      });
      const financialBatches = batch.mock.calls.filter((call) => {
        const operations = call[0];
        return Array.isArray(operations) && operations.some(
          (record: Model) => record.table === "financial_action_groups"
        );
      });
      expect(financialBatches).toHaveLength(1);
      const linked = financialBatches[0]?.[0];
      if (!Array.isArray(linked))
        throw new Error("missing_real_atomic_financial_batch");
      const kinds = linked.map((model: Model) => model.table);
      expect(kinds).toEqual(expect.arrayContaining([
        "financial_action_groups", "accounts", "bank_details",
        "account_financial_effects", "transactions",
        "sms_review_draft_items", "sms_review_queues",
      ]));
      expect(kinds.filter((table: string) =>
        table === "sms_review_queues"
      )).toHaveLength(1);
      expect(linked.filter((model: Model) =>
        model.table === "sms_review_draft_items"
      )).toHaveLength(2);
      expect(linked.find((model: Model) =>
        model.table === "sms_review_queues"
      )?._raw._status).toBe("deleted");
    } finally {
      batch.mockRestore();
    }

    const cloned = await cloneRecoverySqlite();
    const root = await requireActionRoot(cloned);
    const privateProof = readPrivateOwnedRoot(root);
    expect(privateProof.queuePreimage).toMatchObject({
      ...header,
      disposition: "pruned_empty",
      expectedPostimageHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(privateProof.smsDrafts).toHaveLength(2);
    expect(privateProof.smsDrafts.every(
      (draft) => draft.retentionState === "available" &&
        draft.operation === "delete_saved"
    )).toBe(true);
    expect(await cloned.get<SmsReviewQueue>(
      "sms_review_queues"
    ).query(Q.where("user_id", OWNER)).fetch()).toHaveLength(0);
    expect(await cloned.get<SmsReviewDraftItem>(
      "sms_review_draft_items"
    ).query(Q.where("user_id", OWNER)).fetch()).toHaveLength(0);
    expect(root.state).toBe("local_complete");
  });

  it("P02 preserves an original queue when even one linked unselected draft remains", async () => {
    const fixture = makeSaveFixture("sms-shared");
    await seedBoundSmsReview(fixture);
    const original = await originalSmsQueue();
    await expect(saveReview(fixture)).resolves.toMatchObject({
      kind: "committed",
    });
    const cloned = await cloneRecoverySqlite();
    const root = readPrivateOwnedRoot(await requireActionRoot(cloned));
    expect(root.queuePreimage?.disposition).toBe("present");
    const queues = await cloned.get<SmsReviewQueue>(
      "sms_review_queues"
    ).query(Q.where("user_id", OWNER)).fetch();
    expect(queues.map((queue) => queue.id)).toEqual([original.id]);
    const remaining = await cloned.get<SmsReviewDraftItem>(
      "sms_review_draft_items"
    ).query(Q.where("user_id", OWNER)).fetch();
    expect(remaining).toHaveLength(3);
    expect(remaining.some((draft) =>
      draft.smsFingerprint !== FINGERPRINT_A
    )).toBe(true);
  });

  it("P03 refuses a physically foreign queue before any selected financial write", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const queue = await originalSmsQueue();
    await database.write(() => queue.update((row): void => {
      row.userId = FOREIGN_OWNER;
    }));
    const before = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    await expect(saveReview(fixture)).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    )).toEqual(before);
    expect(await database.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query().fetch()).toHaveLength(0);
  });

  it("P04 rejects a stale original queue header between validated prepared ownership and the private snapshot", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const before = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    const frozen = freezeSelectedAccountReview(fixture);
    const scope = await getCurrentUserDataScope();
    const built = await constructReviewSave(frozen, {
      database,
      hashProvider,
      assertOwner: (): Promise<void> => assertExpectedCurrentUser(OWNER),
      loadCurrentSession: (): Promise<typeof fixture.session> =>
        Promise.resolve(fixture.session),
    }, scope);
    const originalPlan = built.plan;
    if (!built.envelope || !originalPlan ||
        !originalPlan.buildLocalRecoverySnapshot || !built.sms.queue)
      throw new Error("missing_real_original_queue_capture_plan");
    const originalBuilder = originalPlan.buildLocalRecoverySnapshot;
    const queue = built.sms.queue;
    const tamperedPlan: FinancialActionLinkedOperationPlan = {
      ...originalPlan,
      buildLocalRecoverySnapshot: async (evidence) => {
        const updated = physicalRawField(queue._raw, "updated_at");
        if (typeof updated !== "number" || !Number.isSafeInteger(updated))
          throw new Error("invalid_actual_original_queue_header");
        // Fault injection only: alter a cached physical header AFTER the
        // foundation's frozen prepared postimage; never persist this value.
        Object.assign(queue._raw, { updated_at: updated + 1000 });
        return originalBuilder(evidence);
      },
    };
    const foundation = createFinancialActionFoundationRepository({
      database,
      registry: createAccountReviewFinancialRegistry(),
      getCurrentUserDataScope,
      assertExpectedCurrentUser,
    });
    await expect(foundation.commitFinancialActionGroupLocally({
      envelope: built.envelope,
      hashProvider,
      prepareLinkedOperationPlan: (): Promise<
        FinancialActionLinkedOperationPlan
      > => Promise.resolve(tamperedPlan),
    })).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    )).toEqual(before);
    expect(await database.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query().fetch()).toHaveLength(0);
  });

  it("P05 refuses a physical draft rebound to a nonexistent queue without posting effects or creating a root", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const drafts = await database.get<SmsReviewDraftItem>(
      "sms_review_draft_items"
    ).query(Q.where("sms_fingerprint", FINGERPRINT_A)).fetch();
    const target = drafts[0];
    if (drafts.length !== 1 || !target)
      throw new Error("expected_real_original_draft");
    await database.write(() => target.update((row): void => {
      row.queueId = testUuid(999);
    }));
    const before = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    await expect(saveReview(fixture)).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    )).toEqual(before);
    expect(await database.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query().fetch()).toHaveLength(0);
  });
  it("P06 refuses a real Save plan whose original queue tombstone was omitted before foundation preparation", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const before = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    const frozen = freezeSelectedAccountReview(fixture);
    const scope = await getCurrentUserDataScope();
    const built = await constructReviewSave(frozen, {
      database,
      hashProvider,
      assertOwner: (): Promise<void> => assertExpectedCurrentUser(OWNER),
      loadCurrentSession: (): Promise<typeof fixture.session> =>
        Promise.resolve(fixture.session),
    }, scope);
    if (!built.envelope || !built.plan)
      throw new Error("missing_actual_linked_review_save");
    const plan = built.plan;
    expect(plan.existingOperations.some((op) =>
      op.model.table === "sms_review_queues"
    )).toBe(true);
    const incomplete: FinancialActionLinkedOperationPlan = {
      ...plan,
      existingOperations: plan.existingOperations.filter(
        (op) => op.model.table !== "sms_review_queues"
      ),
    };
    const foundation = createFinancialActionFoundationRepository({
      database,
      registry: createAccountReviewFinancialRegistry(),
      getCurrentUserDataScope,
      assertExpectedCurrentUser,
    });
    await expect(foundation.commitFinancialActionGroupLocally({
      envelope: built.envelope,
      hashProvider,
      prepareLinkedOperationPlan: (): Promise<
        FinancialActionLinkedOperationPlan
      > => Promise.resolve(incomplete),
    })).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    )).toEqual(before);
    expect(await database.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query().fetch()).toHaveLength(0);
  });
});
