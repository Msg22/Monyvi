/** Shared real SQLite harness. Imported before any service under test. */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type { SmsReviewQueue, SmsReviewDraftItem } from "@monyvi/db";
import { seedCapturedSmsReviewContext } from "./sms-review-real-sqlite-fixture";
import {
  acquireOwnedSmsReviewQueueNamespace,
  releaseOwnedSmsReviewQueueNamespace,
} from "@/services/sms-review-namespace-lease-service";

interface RealSqliteDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

export interface EdgeReply {
  readonly data: unknown;
  readonly error: Error | null;
}
export const mockEdge = jest.fn<
  Promise<EdgeReply>,
  [string, unknown, unknown?]
>();
let mockParserRoute: "ai" | "hybrid" | "local" = "ai";

jest.mock("@/services/authenticated-edge-function-service", () => ({
  invokeAuthenticatedEdgeFunction: (
    name: string,
    options: unknown,
    retryOptions?: unknown
  ): Promise<EdgeReply> => mockEdge(name, options, retryOptions),
  isEdgeFunctionAuthenticationError: (): boolean => false,
}));

jest.mock("@/config/e2e-test-config", () => ({
  isE2eTestMode: (): boolean => false,
  shouldBlockUnsafeSmsParserConfiguration: (): boolean => false,
  shouldUseFixtureSmsParser: (): boolean => false,
  shouldUseHybridSmsParser: (): boolean => mockParserRoute === "hybrid",
  shouldUseLocalSmsParser: (): boolean => mockParserRoute === "local",
}));

jest.mock("@/config/sms-safeguard-qa-config", () => ({
  getSmsSafeguardQaConfig: () => ({
    enabled: false,
    profileId: null,
    runId: null,
  }),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{
    readonly userId: string;
    readonly isConsented: true;
  }> => {
    if (mockCurrentUserId === null)
      return Promise.reject(new Error("auth_scope_changed"));
    return Promise.resolve({ userId: mockCurrentUserId, isConsented: true });
  },
  revokeAiProcessingConsent: (): Promise<void> => Promise.resolve(),
}));

export const OWNER = "00000000-0000-4000-8000-000000000101";
export const FOREIGN = "00000000-0000-4000-8000-000000000201";
let mockCurrentUserId: string | null = OWNER;
let nextId = 1;
type AuthListener = Parameters<
  (typeof import("@/services/supabase"))["subscribeToCoordinatedAuthStateChange"]
>[0];
const mockAuthListeners = new Set<AuthListener>();

export function setCurrentUser(ownerId: string | null): void {
  mockCurrentUserId = ownerId;
}
export function setParserRoute(route: "ai" | "hybrid" | "local"): void {
  mockParserRoute = route;
}
export function emitSignOut(): void {
  mockCurrentUserId = null;
  for (const listener of [...mockAuthListeners]) listener("SIGNED_OUT", null);
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const ledgerModels = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const { Profile } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Profile")
  >("../../../../packages/db/src/models/Profile");
  // Retention queries actual immutable roots even when this queue has never
  // saved a financial action. Keep the production schema and real model;
  // never make missing collection registration a successful empty query.
  const modelClasses = [...ledgerModels.LEDGER_MODEL_CLASSES, Profile];
  const adapter = new Adapter({ schema });
  return {
    ...ledgerModels,
    Profile,
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
});

// Real queryOwned/current-user/accessible-category implementations, not a
// successful snapshot fixture. getRequiredCurrentUserId is the real auth guard.
jest.mock("@/services/user-data-access", () =>
  jest.requireActual<typeof import("@/services/user-data-access")>(
    "@/services/user-data-access"
  )
);

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    Promise.resolve(mockCurrentUserId),
  subscribeToCoordinatedAuthStateChange: (callback: AuthListener) => {
    mockAuthListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: (): void => {
            mockAuthListeners.delete(callback);
          },
        },
      },
    };
  },
}));

jest.mock("expo-crypto", () => {
  const crypto =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (_algorithm: string, value: string): Promise<string> =>
      Promise.resolve(
        crypto.createHash("sha256").update(value, "utf8").digest("hex")
      ),
    randomUUID: (): string => crypto.randomUUID(),
  };
});
export const { database, __adapter: adapter } =
  jest.requireMock<RealSqliteDatabaseModule>("@monyvi/db");
export type Lease = Awaited<
  ReturnType<typeof acquireOwnedSmsReviewQueueNamespace>
>;
const liveTokens = new Map<string, Lease>();

export function track(lease: Lease): Lease {
  liveTokens.set(lease.leaseToken, lease);
  return lease;
}

export async function acquire(expectedUserId: string = OWNER): Promise<Lease> {
  return track(await acquireOwnedSmsReviewQueueNamespace({ expectedUserId }));
}

export async function release(
  lease: Lease,
  disposition: Parameters<
    typeof releaseOwnedSmsReviewQueueNamespace
  >[0]["disposition"]
): Promise<void> {
  await releaseOwnedSmsReviewQueueNamespace({ lease, disposition });
  if (disposition !== "published") liveTokens.delete(lease.leaseToken);
}

export async function ownedQueues(
  owner: string = OWNER
): Promise<SmsReviewQueue[]> {
  return database
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", owner))
    .fetch();
}

export async function draftItems(
  owner: string = OWNER
): Promise<SmsReviewDraftItem[]> {
  return database
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", owner))
    .fetch();
}

export async function initializeSmsReviewSqlite(): Promise<void> {
  setGenerator(() => {
    const suffix = String(nextId++).padStart(12, "0");
    return "00000000-0000-4000-8000-" + suffix;
  });
  await adapter.initializingPromise;
}

export async function resetSmsReviewSqlite(): Promise<void> {
  mockCurrentUserId = OWNER;
  nextId = 1;
  mockParserRoute = "ai";
  jest.restoreAllMocks();
  mockEdge.mockReset();
  await database.write(async (): Promise<void> => {
    await database.unsafeResetDatabase();
  });
  await seedCapturedSmsReviewContext(database, OWNER);
}

export async function cleanupSmsReviewSqlite(): Promise<void> {
  mockCurrentUserId = OWNER;
  for (const lease of [...liveTokens.values()]) {
    await release(lease, "cancelled");
  }
  expect(liveTokens.size).toBe(0);
  const queues = await ownedQueues();
  const queue = queues[0];
  if (queues.length === 1 && queue) {
    const { discardAllSmsReviewDrafts } = jest.requireActual<
      typeof import("@/services/sms-review-draft-repository")
    >("@/services/sms-review-draft-repository");
    await discardAllSmsReviewDrafts(
      OWNER,
      queue.id,
      (await draftItems()).map((row) => row.id)
    );
  }
  emitSignOut();
  setCurrentUser(OWNER);
}

export function installSmsReviewSqliteHooks(): void {
  beforeAll(initializeSmsReviewSqlite);
  beforeEach(resetSmsReviewSqlite);
  afterEach(cleanupSmsReviewSqlite);
}
