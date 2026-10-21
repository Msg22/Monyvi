import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "@nozbe/watermelondb";
import {
  analyzeCategoryReconciliation,
  emitCategoryReconciliationDiagnostics,
  normalizeServerCategoryRow,
  runCategoryReconciliationDiagnostics,
  type CategoryReconciliationDiagnosticsDeps,
  type CategoryReconciliationDiagnosticsEvent,
  type LocalCategorySnapshot,
  type ServerCategorySnapshot,
} from "@/services/sync/dev-category-reconciliation-diagnostics";

interface PulledCategoryChangeSet {
  readonly created: readonly unknown[];
  readonly updated: ReadonlyArray<Record<string, unknown>>;
  readonly deleted: readonly string[];
}

const mockGetCurrentUserId = jest.fn<Promise<string | null>, []>();
const mockPullCategories = jest.fn<
  Promise<PulledCategoryChangeSet>,
  [string, string | null, string]
>();
const mockDebug = jest.fn<void, [string]>();

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => mockGetCurrentUserId(),
}));

jest.mock("@/services/sync/pull-strategies", () => ({
  pullCategories: (
    userId: string,
    lastSyncDate: string | null,
    upperWatermark: string
  ) => mockPullCategories(userId, lastSyncDate, upperWatermark),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: (message: string) => mockDebug(message),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const OWNER = "owner-1";

function localRow(
  overrides: Partial<LocalCategorySnapshot> & {
    readonly id: string;
    readonly systemName: string;
    readonly level: number;
  }
): LocalCategorySnapshot {
  return {
    type: "EXPENSE",
    parentId: undefined,
    isSystem: true,
    userId: undefined,
    syncStatus: "synced",
    ...overrides,
  };
}

function serverRow(
  overrides: Partial<ServerCategorySnapshot> & {
    readonly id: string;
    readonly system_name: string;
    readonly level: number;
  }
): ServerCategorySnapshot {
  return {
    type: "EXPENSE",
    parent_id: null,
    is_system: true,
    user_id: null,
    ...overrides,
  };
}

/** A duplicated level 2 system category: one server row, one extra local row. */
function duplicatePair(
  prefix: string,
  systemName = "electricity"
): {
  readonly local: readonly LocalCategorySnapshot[];
  readonly server: readonly ServerCategorySnapshot[];
} {
  const parentId = `${prefix}-l1`;
  return {
    local: [
      localRow({ id: `${prefix}-server`, systemName, level: 2, parentId }),
      localRow({ id: `${prefix}-local`, systemName, level: 2, parentId }),
    ],
    server: [
      serverRow({
        id: `${prefix}-server`,
        system_name: systemName,
        level: 2,
        parent_id: parentId,
      }),
    ],
  };
}

function parseEvent(raw: string): CategoryReconciliationDiagnosticsEvent {
  return JSON.parse(raw) as CategoryReconciliationDiagnosticsEvent;
}

interface ServerSnapshotStub {
  readonly rows: readonly ServerCategorySnapshot[];
  readonly malformedRowCount: number;
  readonly complete: boolean;
}

interface Harness {
  readonly deps: CategoryReconciliationDiagnosticsDeps;
  readonly events: string[];
  readonly serverSnapshotCalls: () => number;
}

function createHarness(options: {
  readonly local: readonly LocalCategorySnapshot[];
  readonly localSequence?: ReadonlyArray<readonly LocalCategorySnapshot[]>;
  readonly server?: readonly ServerCategorySnapshot[];
  readonly serverSequence?: readonly ServerSnapshotStub[];
  readonly serverComplete?: boolean;
  readonly ownerBefore?: string | null;
  readonly ownerAfter?: string | null;
  readonly serverError?: boolean;
  readonly isDev?: boolean;
  readonly referenceCounts?: {
    readonly transactions: number;
    readonly budgets: number;
    readonly recurringPayments: number;
    readonly userCategorySettings: number;
    readonly childCategories: number;
  };
}): Harness {
  const events: string[] = [];
  let serverCalls = 0;
  let ownerCalls = 0;
  let localCalls = 0;
  const ownerBefore = options.ownerBefore ?? OWNER;
  const ownerAfter = options.ownerAfter ?? OWNER;
  const localSequence = options.localSequence ?? [options.local];

  const deps: CategoryReconciliationDiagnosticsDeps = {
    isDev: options.isDev ?? true,
    loadLocalCategories: () => {
      const index = Math.min(localCalls, localSequence.length - 1);
      localCalls += 1;
      return Promise.resolve(localSequence[index] ?? []);
    },
    loadServerSnapshot: () => {
      const index = serverCalls;
      serverCalls += 1;
      if (options.serverError) {
        return Promise.reject(new Error("snapshot_failed"));
      }
      const sequence = options.serverSequence;
      if (sequence && sequence.length > 0) {
        const stub = sequence[Math.min(index, sequence.length - 1)];
        if (stub) return Promise.resolve(stub);
      }
      return Promise.resolve({
        rows: options.server ?? [],
        malformedRowCount: 0,
        complete: options.serverComplete ?? true,
      });
    },
    countReferences: () =>
      Promise.resolve(
        options.referenceCounts ?? {
          transactions: 0,
          budgets: 0,
          recurringPayments: 0,
          userCategorySettings: 0,
          childCategories: 0,
        }
      ),
    getOwnerId: () => {
      ownerCalls += 1;
      return Promise.resolve(ownerCalls === 1 ? ownerBefore : ownerAfter);
    },
    emit: (event: string) => {
      events.push(event);
    },
  };

  return { deps, events, serverSnapshotCalls: () => serverCalls };
}

describe("analyzeCategoryReconciliation", (): void => {
  it("counts a duplicated level 2 group against the complete server snapshot", (): void => {
    const { local, server } = duplicatePair("count");
    const localRows = [
      ...local,
      localRow({ id: "count-l1", systemName: "utilities_bills", level: 1 }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows,
      serverRows: server,
      serverSnapshotComplete: true,
    });

    expect(analysis.duplicateGroupCount).toBe(1);
    expect(analysis.duplicateCandidateRowCount).toBe(2);
    expect(analysis.groupsWithExactlyOneServerMatch).toBe(1);
    expect(analysis.groupsWithServerCanonicalIdentified).toBe(1);
    expect(analysis.missingFromServerCandidateCount).toBe(1);
    expect(analysis.missingFromServerCandidateIds).toEqual(["count-local"]);
    expect(analysis.singletonsMissingServerCount).toBe(0);
    expect(analysis.localSystemScopeL1RowCount).toBe(1);
    expect(analysis.localSystemScopeL2RowCount).toBe(2);
  });

  it("identifies the canonical row by server membership, not by age", (): void => {
    const local = [
      localRow({
        id: "older-twin",
        systemName: "electricity",
        level: 2,
        parentId: "l1",
      }),
      localRow({
        id: "server-twin",
        systemName: "electricity",
        level: 2,
        parentId: "l1",
      }),
    ];
    const server = [
      serverRow({
        id: "server-twin",
        system_name: "electricity",
        level: 2,
        parent_id: "l1",
      }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows: local,
      serverRows: server,
      serverSnapshotComplete: true,
    });

    expect(analysis.missingFromServerCandidateIds).toEqual(["older-twin"]);
    expect(analysis.groupsWithServerCanonicalIdentified).toBe(1);
  });

  it("fails closed when no or multiple server rows match", (): void => {
    const local = [
      localRow({
        id: "absent-a",
        systemName: "water",
        level: 2,
        parentId: "l1",
      }),
      localRow({
        id: "absent-b",
        systemName: "water",
        level: 2,
        parentId: "l1",
      }),
      localRow({
        id: "present-a",
        systemName: "phone",
        level: 2,
        parentId: "l1",
      }),
      localRow({
        id: "present-b",
        systemName: "phone",
        level: 2,
        parentId: "l1",
      }),
    ];
    const server = [
      serverRow({
        id: "present-a",
        system_name: "phone",
        level: 2,
        parent_id: "l1",
      }),
      serverRow({
        id: "present-b",
        system_name: "phone",
        level: 2,
        parent_id: "l1",
      }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows: local,
      serverRows: server,
      serverSnapshotComplete: true,
    });

    expect(analysis.groupsWithNoServerMatch).toBe(1);
    expect(analysis.groupsWithMultipleServerMatches).toBe(1);
    expect(analysis.groupsWithServerCanonicalIdentified).toBe(0);
  });

  it("rejects a server group with more than one row even when one local id matches", (): void => {
    const local = [
      localRow({
        id: "local-a",
        systemName: "internet",
        level: 2,
        parentId: "l1",
      }),
      localRow({
        id: "local-b",
        systemName: "internet",
        level: 2,
        parentId: "l1",
      }),
    ];
    const server = [
      serverRow({
        id: "local-a",
        system_name: "internet",
        level: 2,
        parent_id: "l1",
      }),
      serverRow({
        id: "server-other",
        system_name: "internet",
        level: 2,
        parent_id: "l1",
      }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows: local,
      serverRows: server,
      serverSnapshotComplete: true,
    });

    expect(analysis.groupsWithMultipleServerMatches).toBe(1);
    expect(analysis.groupsWithServerCanonicalIdentified).toBe(0);
  });

  it("reports an id collision when the server id carries a different logical identity", (): void => {
    const local = [
      localRow({
        id: "shared-id",
        systemName: "electricity",
        level: 2,
        parentId: "l1",
      }),
      localRow({
        id: "other-id",
        systemName: "electricity",
        level: 2,
        parentId: "l1",
      }),
    ];
    const server = [
      serverRow({
        id: "shared-id",
        system_name: "electricity",
        level: 2,
        parent_id: "different-parent",
      }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows: local,
      serverRows: server,
      serverSnapshotComplete: true,
    });

    expect(analysis.idCollisionGroupCount).toBe(1);
    expect(analysis.groupsWithServerCanonicalIdentified).toBe(0);
    expect(analysis.missingFromServerCandidateCount).toBe(2);
  });

  it("does not claim a canonical when the server snapshot is incomplete", (): void => {
    const { local, server } = duplicatePair("incomplete");

    const analysis = analyzeCategoryReconciliation({
      localRows: local,
      serverRows: server,
      serverSnapshotComplete: false,
    });

    expect(analysis.groupsWithServerCanonicalIdentified).toBe(0);
    expect(analysis.groupsWithExactlyOneServerMatch).toBe(0);
    expect(analysis.groupsWithNoServerMatch).toBe(0);
    expect(analysis.groupsWithMultipleServerMatches).toBe(0);
  });

  it("keeps level 1 and owner-scoped rows out of the candidate set", (): void => {
    const local = [
      localRow({ id: "l1-a", systemName: "shopping", level: 1 }),
      localRow({ id: "l1-b", systemName: "shopping", level: 1 }),
      localRow({
        id: "user-scoped",
        systemName: "electricity",
        level: 2,
        parentId: "l1-a",
        userId: OWNER,
      }),
      localRow({
        id: "unclassified",
        systemName: "electricity",
        level: 2,
        parentId: "l1-a",
        isSystem: false,
      }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows: local,
      serverRows: [],
      serverSnapshotComplete: true,
    });

    expect(analysis.localSystemScopeL1RowCount).toBe(2);
    expect(analysis.localSystemScopeL2RowCount).toBe(0);
    expect(analysis.localUserScopedRowCount).toBe(1);
    expect(analysis.localUnclassifiedScopeRowCount).toBe(1);
    // Level 1 duplicates are preserved and never counted as candidates.
    expect(analysis.duplicateGroupCount).toBe(0);
  });

  it("counts dirty pending candidates across all candidates", (): void => {
    const { local, server } = duplicatePair("dirty");
    const localRows = [
      local[0],
      localRow({
        id: "dirty-local",
        systemName: "electricity",
        level: 2,
        parentId: "dirty-l1",
        syncStatus: "created",
      }),
    ];

    const analysis = analyzeCategoryReconciliation({
      localRows,
      serverRows: server,
      serverSnapshotComplete: true,
    });

    expect(analysis.dirtyPendingCandidateCount).toBe(1);
  });
});

describe("normalizeServerCategoryRow", (): void => {
  it("accepts a well formed server row", (): void => {
    const normalized = normalizeServerCategoryRow({
      id: "server-id",
      system_name: "electricity",
      level: 2,
      type: "EXPENSE",
      parent_id: "parent-id",
      is_system: true,
      user_id: null,
    });

    expect(normalized).toEqual({
      id: "server-id",
      system_name: "electricity",
      level: 2,
      type: "EXPENSE",
      parent_id: "parent-id",
      is_system: true,
      user_id: null,
    });
  });

  it("rejects rows with a missing or mistyped required field", (): void => {
    const base = {
      id: "server-id",
      system_name: "electricity",
      level: 2,
      type: "EXPENSE",
      parent_id: null,
      is_system: true,
      user_id: null,
    };

    expect(normalizeServerCategoryRow({ ...base, id: undefined })).toBeNull();
    expect(normalizeServerCategoryRow({ ...base, level: "2" })).toBeNull();
    expect(
      normalizeServerCategoryRow({ ...base, is_system: undefined })
    ).toBeNull();
    expect(
      normalizeServerCategoryRow({ ...base, user_id: undefined })
    ).toBeNull();
    expect(
      normalizeServerCategoryRow({ ...base, type: "UNKNOWN_TYPE" })
    ).toBeNull();
  });
});

describe("runCategoryReconciliationDiagnostics", (): void => {
  it("emits one JSON string with counts only and no raw values", async (): Promise<void> => {
    const { local, server } = duplicatePair("privacy");
    const harness = createHarness({
      local,
      server,
      referenceCounts: {
        transactions: 3,
        budgets: 1,
        recurringPayments: 0,
        userCategorySettings: 2,
        childCategories: 0,
      },
    });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.events).toHaveLength(1);
    const raw = harness.events[0];
    const event = parseEvent(raw);
    expect(event.event).toBe("categories.reconciliationDiagnostics");
    expect(event.phase).toBe("pre_apply");
    expect(event.snapshotScope).toBe("full");
    expect(event.snapshotComplete).toBe(true);
    expect(event.canonicalProofAvailable).toBe(true);
    expect(event.snapshotRowCount).toBe(1);
    expect(event.duplicateGroupCount).toBe(1);
    expect(event.groupsWithServerCanonicalIdentified).toBe(1);
    expect(event.missingFromServerCandidateCount).toBe(1);
    expect(event.transactionReferenceCount).toBe(3);
    expect(event.budgetReferenceCount).toBe(1);
    expect(event.userCategorySettingsReferenceCount).toBe(2);
    expect(event.serializedReferencesUnassessed).toBe(true);
    expect(event.referenceScanScope).toBe("watermelon_tables_only");
    expect(raw).not.toContain("privacy-local");
    expect(raw).not.toContain("privacy-server");
    expect(raw).not.toContain("electricity");
    expect(raw).not.toContain(OWNER);
  });

  it("does not read the server snapshot when no duplicate candidate exists", async (): Promise<void> => {
    const harness = createHarness({
      local: [
        localRow({ id: "solo-l1", systemName: "shopping", level: 1 }),
        localRow({
          id: "solo-l2",
          systemName: "clothes",
          level: 2,
          parentId: "solo-l1",
        }),
      ],
    });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(0);
    expect(harness.events).toHaveLength(0);
  });

  it("does nothing outside development builds", async (): Promise<void> => {
    const { local } = duplicatePair("prod");
    const harness = createHarness({ local, isDev: false });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(0);
    expect(harness.events).toHaveLength(0);
  });

  it("discards the evidence when the auth scope changed", async (): Promise<void> => {
    const { local, server } = duplicatePair("scope");
    const harness = createHarness({
      local,
      server,
      ownerAfter: "owner-2",
    });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(1);
    expect(harness.events).toHaveLength(0);
  });

  it("suppresses a failed snapshot without breaking the caller", async (): Promise<void> => {
    const { local } = duplicatePair("failure");
    const harness = createHarness({ local, serverError: true });

    await expect(
      runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER })
    ).resolves.toBeUndefined();
    expect(harness.events).toHaveLength(0);
  });

  it("reads the server snapshot once for an unchanged local candidate snapshot", async (): Promise<void> => {
    const { local, server } = duplicatePair("once");
    const harness = createHarness({ local, server });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });
    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(1);
    expect(harness.events).toHaveLength(1);
  });

  it("does not promote an incomplete snapshot, so a later complete one is read", async (): Promise<void> => {
    const { local, server } = duplicatePair("retry");
    const harness = createHarness({
      local,
      serverSequence: [
        { rows: server, malformedRowCount: 1, complete: false },
        { rows: server, malformedRowCount: 0, complete: true },
      ],
    });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });
    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(2);
    expect(harness.events).toHaveLength(2);
    const first = parseEvent(harness.events[0]);
    const second = parseEvent(harness.events[1]);
    expect(first.canonicalProofAvailable).toBe(false);
    expect(first.groupsWithServerCanonicalIdentified).toBe(0);
    expect(second.canonicalProofAvailable).toBe(true);
    expect(second.groupsWithServerCanonicalIdentified).toBe(1);
  });

  it("treats reordered candidate rows as the same snapshot", async (): Promise<void> => {
    const { local, server } = duplicatePair("order");
    const harness = createHarness({
      local,
      localSequence: [local, [local[1], local[0]]],
      server,
    });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });
    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(1);
    expect(harness.events).toHaveLength(1);
  });

  it("reads again when a candidate status changes from pending to synced", async (): Promise<void> => {
    const { server } = duplicatePair("status");
    const pending = [
      localRow({
        id: "status-server",
        systemName: "electricity",
        level: 2,
        parentId: "status-l1",
        syncStatus: "created",
      }),
      localRow({
        id: "status-local",
        systemName: "electricity",
        level: 2,
        parentId: "status-l1",
        syncStatus: "created",
      }),
    ];
    const synced = [
      localRow({
        id: "status-server",
        systemName: "electricity",
        level: 2,
        parentId: "status-l1",
        syncStatus: "synced",
      }),
      localRow({
        id: "status-local",
        systemName: "electricity",
        level: 2,
        parentId: "status-l1",
        syncStatus: "synced",
      }),
    ];
    const harness = createHarness({
      local: pending,
      localSequence: [pending, synced],
      server,
    });

    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });
    await runCategoryReconciliationDiagnostics(harness.deps, { userId: OWNER });

    expect(harness.serverSnapshotCalls()).toBe(2);
    expect(harness.events).toHaveLength(2);
  });
});

describe("emitCategoryReconciliationDiagnostics runtime wiring", (): void => {
  function createFakeDatabase(
    rows: readonly LocalCategorySnapshot[]
  ): Database {
    const counts: Record<string, number> = {
      transactions: 4,
      budgets: 1,
      recurring_payments: 2,
      user_category_settings: 3,
      categories: 0,
    };
    const fake = {
      get: (table: string) => ({
        query: () => ({
          fetch: (): Promise<readonly LocalCategorySnapshot[]> =>
            Promise.resolve(table === "categories" ? rows : []),
          fetchCount: (): Promise<number> =>
            Promise.resolve(counts[table] ?? 0),
        }),
      }),
    };
    // Test double for the WatermelonDB database: only reads are provided.
    return fake as unknown as Database;
  }

  beforeEach((): void => {
    mockGetCurrentUserId.mockReset();
    mockPullCategories.mockReset();
    mockDebug.mockReset();
    mockGetCurrentUserId.mockResolvedValue(OWNER);
  });

  it("emits the counts event from the real runtime path", async (): Promise<void> => {
    const { local, server } = duplicatePair("clean");
    mockPullCategories.mockResolvedValue({
      created: [],
      updated: server.map((row) => ({ ...row })),
      deleted: [],
    });

    await emitCategoryReconciliationDiagnostics({
      database: createFakeDatabase(local),
      userId: OWNER,
      upperWatermark: "2026-10-21T00:00:00.000Z",
    });

    // The diagnostic snapshot is a separate full-window pull.
    expect(mockPullCategories).toHaveBeenCalledWith(
      OWNER,
      null,
      "2026-10-21T00:00:00.000Z"
    );
    expect(mockDebug).toHaveBeenCalledTimes(1);
    const raw = mockDebug.mock.calls[0]?.[0] ?? "";
    const event = parseEvent(raw);
    expect(event.event).toBe("categories.reconciliationDiagnostics");
    expect(event.phase).toBe("pre_apply");
    expect(event.snapshotComplete).toBe(true);
    expect(event.canonicalProofAvailable).toBe(true);
    expect(event.duplicateGroupCount).toBe(1);
    expect(event.groupsWithServerCanonicalIdentified).toBe(1);
    expect(event.missingFromServerCandidateCount).toBe(1);
    expect(event.transactionReferenceCount).toBe(4);
    expect(event.budgetReferenceCount).toBe(1);
    expect(event.recurringPaymentReferenceCount).toBe(2);
    expect(event.userCategorySettingsReferenceCount).toBe(3);
    expect(raw).not.toContain("clean-local");
    expect(raw).not.toContain("clean-server");
    expect(raw).not.toContain("electricity");
  });

  it("does not claim a canonical when a pulled row is malformed", async (): Promise<void> => {
    const { local, server } = duplicatePair("malformed");
    mockPullCategories.mockResolvedValue({
      created: [],
      updated: [...server.map((row) => ({ ...row })), { id: "malformed-row" }],
      deleted: [],
    });

    await emitCategoryReconciliationDiagnostics({
      database: createFakeDatabase(local),
      userId: OWNER,
      upperWatermark: "2026-10-21T00:00:01.000Z",
    });

    const raw = mockDebug.mock.calls[0]?.[0] ?? "";
    const event = parseEvent(raw);
    expect(event.snapshotComplete).toBe(false);
    expect(event.canonicalProofAvailable).toBe(false);
    expect(event.malformedSnapshotRowCount).toBe(1);
    expect(event.groupsWithServerCanonicalIdentified).toBe(0);
  });

  it("does nothing without a database", async (): Promise<void> => {
    await emitCategoryReconciliationDiagnostics({
      database: undefined,
      userId: OWNER,
      upperWatermark: "2026-10-21T00:00:02.000Z",
    });

    expect(mockPullCategories).not.toHaveBeenCalled();
    expect(mockDebug).not.toHaveBeenCalled();
  });
});

describe("source contracts", (): void => {
  const servicesRoot = join(__dirname, "..", "..", "services", "sync");

  it("keeps the diagnostic free of database writes and server mutations", (): void => {
    const source = readFileSync(
      join(servicesRoot, "dev-category-reconciliation-diagnostics.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/\.create\(/);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/markAsDeleted/);
    expect(source).not.toMatch(/destroyPermanently/);
    expect(source).not.toMatch(/database\.write\(/);
    expect(source).not.toMatch(/setLocal\(/);
    expect(source).not.toMatch(/upsert\(/);
  });

  it("runs the diagnostic after the real category change set is assigned and ignores its result", (): void => {
    const source = readFileSync(
      join(servicesRoot, "atomic-pull-strategies.ts"),
      "utf8"
    );
    const assignIndex = source.indexOf(
      "changes.categories = await pullCategories("
    );
    const diagnosticIndex = source.indexOf(
      "await emitCategoryReconciliationDiagnostics("
    );

    expect(assignIndex).toBeGreaterThan(-1);
    expect(diagnosticIndex).toBeGreaterThan(assignIndex);
    expect(source).not.toMatch(
      /=\s*await emitCategoryReconciliationDiagnostics\(/
    );
  });
});
