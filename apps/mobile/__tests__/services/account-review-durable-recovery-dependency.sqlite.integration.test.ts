/**
 * #395 T044/T050 tests-FIRST: actual independent optimistic actions and
 * protected push ordering. The RPC is a transport-only test double;
 * Save, financial roots, default snapshots and dependency capture stay real.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import type {
  FinancialActionGroup,
} from "@monyvi/db";
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  serializeCanonicalJsonValue,
} from "@monyvi/logic";
import {
  parseAccountReviewLocalSaveSnapshot,
} from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  createFinancialActionSyncService,
  type FinancialActionSyncDependencies,
} from "../../services/financial-action-sync-service";
import { clearAndSeed } from "./account-review-save-sqlite-test-helpers";
import {
  ACTION, FOREIGN_OWNER, OWNER, SESSION,
  makeSaveFixture, testUuid, type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  database, resetRecoverySqlite, saveReview, seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";
import {
  financialRepository,
} from "./account-review-durable-recovery-test-helpers";

/**
 * TEST-ONLY Node SHA-256 bridge for expo-crypto's Jest stub. The real Save
 * hashProvider, reducers, reconciliation, SQLite and immutable root hashing
 * remain intact; only the unavailable native crypto primitive is replaced.
 * Deterministic canonical v4 IDs also avoid non-UUID native Jest randomUUIDs.
 */
let mockCryptoUuidCounter = 0;
jest.mock("expo-crypto", () => {
  const { createHash } = jest.requireActual<typeof import("node:crypto")>(
    "node:crypto"
  );
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, input: string): Promise<string> => {
      if (algorithm !== "SHA-256")
        return Promise.reject(new Error("unsupported_test_crypto_algorithm"));
      return Promise.resolve(createHash("sha256").update(input, "utf8").digest("hex"));
    },
    randomUUID: (): string => {
      mockCryptoUuidCounter += 1;
      return "e1000000-0000-4000-8000-" +
        String(mockCryptoUuidCounter).padStart(12, "0");
    },
  };
});

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
let mockActiveOwner = OWNER;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockActiveOwner),
  supabase: {},
}));

const SECOND_ACTION = testUuid(2100);
type FinancialRpcInput = Parameters<
  FinancialActionSyncDependencies["invokeAccountFinancialActionRpc"]
>[0];

function independentlyFrozenSecondSave(): SaveFixture {
  const original = makeSaveFixture("sms-new-bank");
  const nextIntent = accountReviewSaveIntentSchema.parse({
    ...original.intent,
    actionId: SECOND_ACTION,
    // Existing canonical localRefs bind the unchanged owner/session/group/row.
    // Only new PHYSICAL create UUIDs change; no financial DTOs are invented.
    plannedEntityIds: original.intent.plannedEntityIds.map((ref, index) => ({
      ...ref,
      id: testUuid(2200 + index),
    })),
  });
  const session = accountReviewSessionSchema.parse({
    ...original.session,
    saveIntent: nextIntent,
  });
  return { session, intent: nextIntent };
}

async function prepareTwoOfflineSaves(): Promise<{
  readonly firstRoot: FinancialActionGroup;
  readonly secondRoot: FinancialActionGroup;
}> {
  // No active account: the genuine first Voice Cash save creates the default.
  // The second SMS Bank save sees that local optimistic default before push.
  await clearAndSeed(database, { onlyCategories: true });
  const first = makeSaveFixture("voice-cash");
  await expect(saveReview(first)).resolves.toMatchObject({ kind: "committed" });
  const second = independentlyFrozenSecondSave();
  await seedBoundSmsReview(second);
  await expect(saveReview(second)).resolves.toMatchObject({ kind: "committed" });
  const roots = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("user_id", OWNER)).fetch();
  const firstRoot = roots.find((row) => row.actionId === ACTION);
  const secondRoot = roots.find((row) => row.actionId === SECOND_ACTION);
  if (roots.length !== 2 || !firstRoot || !secondRoot)
    throw new Error("missing_two_genuine_optimistic_roots");
  return { firstRoot, secondRoot };
}

function privateDependencies(root: FinancialActionGroup): readonly string[] {
  const bytes = root.localRecoverySnapshotJson;
  if (typeof bytes !== "string")
    throw new Error("missing_genuine_private_predecessor_evidence");
  return parseAccountReviewLocalSaveSnapshot({
    json: bytes,
    expectedRoot: {
      actionId: SECOND_ACTION,
      ownerId: OWNER,
      sessionId: SESSION,
      source: "SMS",
    },
  }).defaultDependencyActionIds;
}

async function attemptSecondPush(): Promise<readonly FinancialRpcInput[]> {
  const attempted: FinancialRpcInput[] = [];
  const sync = createFinancialActionSyncService({
    foundationRepository: financialRepository(database),
    invokeAccountFinancialActionRpc: (input): Promise<unknown> => {
      attempted.push(input);
      return Promise.reject(new Error("synthetic_transport_stop_after_dispatch"));
    },
  });
  try {
    await sync.syncAction(SECOND_ACTION);
  } catch (error: unknown) {
    if (!(error instanceof Error)) throw error;
    // A pending/rejected predecessor may defer or report a blocked failure;
    // an eligible successor reaches the transport test double and fails there.
  }
  return attempted;
}

beforeEach(async (): Promise<void> => {
  mockCryptoUuidCounter = 0;
  mockActiveOwner = OWNER;
  await resetRecoverySqlite();
});
afterEach((): void => {
  mockActiveOwner = OWNER;
});

describe("#395 T044 real SQLite predecessor-aware protected sync", () => {
  it("D09 blocks the second default-dependent action until the first canonical acceptance, then sends exactly its immutable envelope", async () => {
    const { secondRoot } = await prepareTwoOfflineSaves();
    expect(privateDependencies(secondRoot)).toEqual([ACTION]);
    expect(await attemptSecondPush()).toEqual([]);

    // Only the remote-transport outcome is injected, NOT the local root,
    // snapshot, action writer or production dependency resolver.
    const repository = financialRepository(database);
    await repository.markFinancialActionGroupSyncPending(ACTION);
    await repository.recordFinancialActionGroupServerOutcome(
      ACTION, "accepted",
      serializeCanonicalJsonValue({
        actionId: ACTION, status: "accepted",
      }), null
    );
    expect(await attemptSecondPush()).toEqual([{
      payloadHash: secondRoot.payloadHash,
      payloadJson: secondRoot.payloadJson,
    }]);
    const replayed = await repository.getFinancialActionGroup(SECOND_ACTION);
    expect(replayed?.actionId).toBe(SECOND_ACTION);
    expect(replayed?.payloadJson).toBe(secondRoot.payloadJson);
  });

  it.each(["rejected", "unsupported"] as const)(
    "D10 refuses dependent RPC when a genuine first local root becomes %s",
    async (outcome): Promise<void> => {
      const { secondRoot } = await prepareTwoOfflineSaves();
      expect(privateDependencies(secondRoot)).toEqual([ACTION]);
      const repository = financialRepository(database);
      if (outcome === "rejected") {
        await repository.markFinancialActionGroupSyncPending(ACTION);
        await repository.recordFinancialActionGroupServerOutcome(
          ACTION, "stale",
          serializeCanonicalJsonValue({
            actionId: ACTION, status: "stale", code: "REVISION_STALE",
          }),
          "REVISION_STALE"
        );
      } else {
        await repository.markFinancialActionGroupSyncPending(ACTION);
        await repository.markFinancialActionGroupSyncFailed(
          ACTION, "unsupported_operation"
        );
      }
      expect(await attemptSecondPush()).toEqual([]);
      const unchanged = await repository.getFinancialActionGroup(SECOND_ACTION);
      expect(unchanged?.payloadHash).toBe(secondRoot.payloadHash);
      expect(unchanged?.payloadJson).toBe(secondRoot.payloadJson);
      expect(unchanged?.state).not.toBe("accepted");
    }
  );

  it("D11 changes authenticated actor without leaking or dispatching the prior owner's dependent action", async () => {
    const { secondRoot } = await prepareTwoOfflineSaves();
    expect(privateDependencies(secondRoot)).toEqual([ACTION]);
    mockActiveOwner = FOREIGN_OWNER;
    try {
      expect(await attemptSecondPush()).toEqual([]);
    } finally {
      mockActiveOwner = OWNER;
    }
    const retained = await financialRepository(database)
      .getFinancialActionGroup(SECOND_ACTION);
    expect(retained?.payloadJson).toBe(secondRoot.payloadJson);
    expect(retained?.state).toBe("local_complete");
  });
});
