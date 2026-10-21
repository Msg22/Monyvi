import type { Database } from "@nozbe/watermelondb";
import {
  commitCategoryCatalogueAttempt,
  createCategoryCatalogueEnvironment,
  filterSelectableCategories,
  getCategoryCatalogueSnapshot,
  loadCategoryCatalogueSnapshot,
  resetCategoryCatalogueSnapshot,
  subscribeCategoryCatalogue,
  type CategoryCatalogueAttempt,
  type CategoryCatalogueEnvironment,
  type CategoryCatalogueSnapshot,
} from "@/services/category-catalogue-service";

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => Promise.resolve("owner-1"),
  getSupabaseClientOrigin: (): string | null => "https://project.supabase.co",
}));

jest.mock("@/services/user-data-access", () => ({
  queryAccessibleCategories: () => ({
    fetch: () => Promise.resolve([]),
  }),
}));

const OWNER = "owner-1";
const ORIGIN = "https://project.supabase.co";

function attempt(
  overrides: Partial<CategoryCatalogueAttempt> = {}
): CategoryCatalogueAttempt {
  return {
    origin: ORIGIN,
    ownerId: OWNER,
    capturedAt: 1_700_000_000_000,
    complete: true,
    systemIds: ["system-1"],
    customOwnerIds: ["custom-1"],
    ...overrides,
  };
}

interface FakeEnvironment extends CategoryCatalogueEnvironment {
  readonly store: Map<string, string>;
  readonly writes: string[];
  readonly verified: boolean;
}

function createEnvironment(
  overrides: {
    readonly origin?: string | null;
    readonly ownerId?: string | null;
    readonly store?: Map<string, string>;
    readonly verified?: boolean;
    readonly ownerAfter?: string | null;
    readonly originAfter?: string | null;
    readonly readDelay?: (() => void) | null;
  } = {}
): FakeEnvironment {
  const store = overrides.store ?? new Map<string, string>();
  const writes: string[] = [];
  const origin = overrides.origin === undefined ? ORIGIN : overrides.origin;
  let ownerCalls = 0;
  const environment: FakeEnvironment = {
    store,
    writes,
    verified: overrides.verified ?? true,
    getOrigin: () =>
      ownerCalls > 0 && overrides.originAfter !== undefined
        ? overrides.originAfter
        : origin,
    getOwnerId: () => {
      ownerCalls += 1;
      if (ownerCalls > 1 && overrides.ownerAfter !== undefined) {
        return Promise.resolve(overrides.ownerAfter);
      }
      return Promise.resolve(
        overrides.ownerId === undefined ? OWNER : overrides.ownerId
      );
    },
    readLocal: (key) => {
      if (overrides.readDelay) overrides.readDelay();
      return Promise.resolve(store.get(key) ?? null);
    },
    writeLocal: (key, value) => {
      writes.push(key);
      store.set(key, value);
      return Promise.resolve();
    },
    verifyLocalScope: () => Promise.resolve(environment.verified),
  };
  return environment;
}

function category(
  id: string,
  overrides: {
    readonly userId?: string | null;
    readonly isSystem?: boolean;
  } = {}
): { id: string; userId: string | null; isSystem: boolean } {
  return {
    id,
    userId: overrides.userId === undefined ? null : overrides.userId,
    isSystem: overrides.isSystem === undefined ? true : overrides.isSystem,
  };
}

describe("commitCategoryCatalogueAttempt", (): void => {
  afterEach((): void => {
    resetCategoryCatalogueSnapshot();
  });

  it("persists the manifest and publishes the selection for the owner", async (): Promise<void> => {
    const environment = createEnvironment();

    const committed = await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    expect(committed).toBe(true);
    expect(environment.writes).toHaveLength(1);
    const snapshot = getCategoryCatalogueSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.ownerId).toBe(OWNER);
    expect(snapshot.selectedSystemIds.has("system-1")).toBe(true);
    expect(snapshot.error).toBeNull();
  });

  it("refuses an incomplete attempt, a foreign owner and a foreign backend", async (): Promise<void> => {
    const incomplete = createEnvironment();
    expect(
      await commitCategoryCatalogueAttempt(incomplete, {
        attempt: attempt({ complete: false }),
        ownerId: OWNER,
      })
    ).toBe(false);
    expect(incomplete.writes).toHaveLength(0);

    const foreignOwner = createEnvironment();
    expect(
      await commitCategoryCatalogueAttempt(foreignOwner, {
        attempt: attempt({ ownerId: "owner-2" }),
        ownerId: OWNER,
      })
    ).toBe(false);

    const foreignBackend = createEnvironment({
      origin: "http://10.0.2.2:54321",
    });
    expect(
      await commitCategoryCatalogueAttempt(foreignBackend, {
        attempt: attempt(),
        ownerId: OWNER,
      })
    ).toBe(false);
    expect(foreignBackend.writes).toHaveLength(0);
  });

  it("refuses to commit when the local system ids do not verify", async (): Promise<void> => {
    const environment = createEnvironment({ verified: false });

    const committed = await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    expect(committed).toBe(false);
    expect(environment.writes).toHaveLength(0);
    expect(getCategoryCatalogueSnapshot().status).toBe("unavailable");
  });

  it("does not publish when the owner changed during the commit", async (): Promise<void> => {
    const environment = createEnvironment({ ownerAfter: "owner-2" });

    const committed = await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    expect(committed).toBe(false);
    expect(getCategoryCatalogueSnapshot().status).toBe("unavailable");
  });

  it("accepts a validated empty catalogue as ready (distinct from a failure)", async (): Promise<void> => {
    const environment = createEnvironment();

    const committed = await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt({ systemIds: [], customOwnerIds: [] }),
      ownerId: OWNER,
    });

    expect(committed).toBe(true);
    const snapshot = getCategoryCatalogueSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.selectedSystemIds.size).toBe(0);
    expect(snapshot.error).toBeNull();
  });

  it("a commit whose final owner read is overtaken by a scope reset cannot publish", async (): Promise<void> => {
    const store = new Map<string, string>();
    const release: { current: (() => void) | null } = { current: null };
    const signalReached: { current: (() => void) | null } = { current: null };
    const reached = new Promise<void>((resolve) => {
      signalReached.current = resolve;
    });
    const ownerGate = new Promise<void>((resolve) => {
      release.current = resolve;
    });
    let wrote = false;
    const environment: CategoryCatalogueEnvironment = {
      getOrigin: () => ORIGIN,
      getOwnerId: async () => {
        // The owner read that follows the manifest write is the last one
        // before the publication: it waits for the scope reset.
        if (wrote) {
          if (signalReached.current) signalReached.current();
          await ownerGate;
        }
        return OWNER;
      },
      readLocal: (key) => Promise.resolve(store.get(key) ?? null),
      writeLocal: (key, value) => {
        wrote = true;
        store.set(key, value);
        return Promise.resolve();
      },
      verifyLocalScope: () => Promise.resolve(true),
    };

    const commitPromise = commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });
    await reached;

    // The scope is reset (signout / owner switch) and a fresh catalogue for
    // the new scope is published while the old commit is still waiting. It
    // runs under a different manifest key so it is not queued behind the
    // stale commit.
    resetCategoryCatalogueSnapshot();
    const freshOrigin = "http://10.0.2.2:54321";
    const fresh = createEnvironment({ store, origin: freshOrigin });
    await commitCategoryCatalogueAttempt(fresh, {
      attempt: attempt({
        origin: freshOrigin,
        capturedAt: 2_000_000_000_000,
        systemIds: ["system-fresh"],
      }),
      ownerId: OWNER,
    });
    expect(
      getCategoryCatalogueSnapshot().selectedSystemIds.has("system-fresh")
    ).toBe(true);

    if (release.current) release.current();
    const committed = await commitPromise;

    expect(committed).toBe(false);
    expect(
      getCategoryCatalogueSnapshot().selectedSystemIds.has("system-fresh")
    ).toBe(true);
    expect(
      getCategoryCatalogueSnapshot().selectedSystemIds.has("system-1")
    ).toBe(false);
  });

  it("a commit queued behind another commit for the same key is invalidated by a scope reset", async (): Promise<void> => {
    const store = new Map<string, string>();
    const releaseFirst: { current: (() => void) | null } = { current: null };
    const signalReached: { current: (() => void) | null } = { current: null };
    const reached = new Promise<void>((resolve) => {
      signalReached.current = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst.current = resolve;
    });
    let first = true;
    const environment: CategoryCatalogueEnvironment = {
      getOrigin: () => ORIGIN,
      getOwnerId: () => Promise.resolve(OWNER),
      readLocal: (key) => Promise.resolve(store.get(key) ?? null),
      writeLocal: (key, value) => {
        store.set(key, value);
        return Promise.resolve();
      },
      verifyLocalScope: async () => {
        if (first) {
          first = false;
          if (signalReached.current) signalReached.current();
          await firstGate;
        }
        return true;
      },
    };

    const firstCommit = commitCategoryCatalogueAttempt(environment, {
      attempt: attempt({ capturedAt: 1_000_000_000_000 }),
      ownerId: OWNER,
    });
    const secondCommit = commitCategoryCatalogueAttempt(environment, {
      attempt: attempt({ capturedAt: 2_000_000_000_000 }),
      ownerId: OWNER,
    });
    await reached;
    resetCategoryCatalogueSnapshot();
    if (releaseFirst.current) releaseFirst.current();

    await firstCommit;
    const secondCommitted = await secondCommit;

    expect(secondCommitted).toBe(false);
  });

  it("keeps a ready catalogue when the same pair's manifest read fails", async (): Promise<void> => {
    const store = new Map<string, string>();
    const environment = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });
    expect(getCategoryCatalogueSnapshot().status).toBe("ready");

    const failing = createEnvironment({
      store,
      readDelay: () => {
        throw new Error("local_storage_unreadable");
      },
    });
    await loadCategoryCatalogueSnapshot(failing, { ownerId: OWNER });

    expect(getCategoryCatalogueSnapshot().status).toBe("ready");
    expect(
      getCategoryCatalogueSnapshot().selectedSystemIds.has("system-1")
    ).toBe(true);
  });

  it("keeps a ready catalogue when the same pair's stored manifest is corrupt", async (): Promise<void> => {
    const store = new Map<string, string>();
    const environment = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    const corrupt = createEnvironment({ store });
    store.clear();
    store.set("__monyvi_category_catalogue:v2:broken", "not-a-manifest");
    await loadCategoryCatalogueSnapshot(corrupt, { ownerId: OWNER });

    expect(getCategoryCatalogueSnapshot().status).toBe("ready");
  });

  it("replaces the catalogue when the same owner switches to another backend", async (): Promise<void> => {
    const store = new Map<string, string>();
    const environment = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    const otherOrigin = "http://10.0.2.2:54321";
    const switched = createEnvironment({ store, origin: otherOrigin });
    const snapshot = await loadCategoryCatalogueSnapshot(switched, {
      ownerId: OWNER,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.origin).toBe(otherOrigin);
    expect(snapshot.ownerId).toBe(OWNER);
  });

  it("never downgrades a newer accepted manifest", async (): Promise<void> => {
    const environment = createEnvironment();
    await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt({ capturedAt: 2_000_000_000_000 }),
      ownerId: OWNER,
    });
    resetCategoryCatalogueSnapshot();

    const stale = await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt({ capturedAt: 1_000_000_000_000 }),
      ownerId: OWNER,
    });

    expect(stale).toBe(false);
    const stored = [...environment.store.values()][0] ?? "";
    expect(stored).toContain("2000000000000");
  });
});

describe("loadCategoryCatalogueSnapshot", (): void => {
  afterEach((): void => {
    resetCategoryCatalogueSnapshot();
  });

  it("publishes unavailable when the current backend has no manifest", async (): Promise<void> => {
    const environment = createEnvironment();

    const snapshot = await loadCategoryCatalogueSnapshot(environment, {
      ownerId: OWNER,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.selectedSystemIds.size).toBe(0);
    expect(snapshot.error).toBe("manifest_unreadable");
  });

  it("never uses another backend's manifest", async (): Promise<void> => {
    const store = new Map<string, string>();
    const first = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(first, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    const otherBackend = createEnvironment({
      store,
      origin: "http://10.0.2.2:54321",
    });
    const snapshot = await loadCategoryCatalogueSnapshot(otherBackend, {
      ownerId: OWNER,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.selectedSystemIds.size).toBe(0);
  });

  it("publishes the accepted catalogue of the current backend and owner", async (): Promise<void> => {
    const store = new Map<string, string>();
    const environment = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });
    resetCategoryCatalogueSnapshot();

    const snapshot = await loadCategoryCatalogueSnapshot(environment, {
      ownerId: OWNER,
    });

    expect(snapshot.status).toBe("ready");
    expect(snapshot.selectedSystemIds.has("system-1")).toBe(true);
  });

  it("ends in a retryable unavailable state when the local read fails", async (): Promise<void> => {
    const environment = createEnvironment({
      readDelay: () => {
        throw new Error("local_storage_unreadable");
      },
    });

    const snapshot = await loadCategoryCatalogueSnapshot(environment, {
      ownerId: OWNER,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.error).toBe("manifest_unreadable");
  });

  it("keeps the current owner's publication untouched when another owner loads", async (): Promise<void> => {
    const store = new Map<string, string>();
    const environment = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(environment, {
      attempt: attempt(),
      ownerId: OWNER,
    });

    const snapshot = await loadCategoryCatalogueSnapshot(environment, {
      ownerId: "owner-2",
    });

    // A load for a foreign owner must not publish anything: the current
    // owner's accepted publication stays untouched and is returned as is.
    expect(snapshot.status).toBe("ready");
    expect(snapshot.ownerId).toBe(OWNER);
    expect(getCategoryCatalogueSnapshot().status).toBe("ready");
    expect(getCategoryCatalogueSnapshot().ownerId).toBe(OWNER);
  });

  it("a fresh commit wins over a cached load that started earlier", async (): Promise<void> => {
    const store = new Map<string, string>();
    const releaseRead: { current: (() => void) | null } = { current: null };
    const gate = new Promise<void>((resolve) => {
      releaseRead.current = resolve;
    });
    const delayed = createEnvironment({
      store,
      readDelay: () => {
        void gate;
      },
    });

    const loadPromise = loadCategoryCatalogueSnapshot(delayed, {
      ownerId: OWNER,
    });
    await Promise.resolve();

    const fresh = createEnvironment({ store });
    await commitCategoryCatalogueAttempt(fresh, {
      attempt: attempt({
        capturedAt: 2_000_000_000_000,
        systemIds: ["system-new"],
      }),
      ownerId: OWNER,
    });
    if (releaseRead.current) releaseRead.current();
    await loadPromise;

    const snapshot = getCategoryCatalogueSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.selectedSystemIds.has("system-new")).toBe(true);
  });
});

describe("selection rule", (): void => {
  const readySnapshot: CategoryCatalogueSnapshot = {
    status: "ready",
    origin: ORIGIN,
    ownerId: OWNER,
    selectedSystemIds: new Set(["system-1"]),
    acceptedAt: 1_700_000_000_000,
    error: null,
  };

  it("offers the owner's own categories and current system rows only", (): void => {
    const selection = filterSelectableCategories(
      [
        category("system-1"),
        category("system-legacy"),
        category("custom-1", { userId: OWNER, isSystem: false }),
        category("custom-pending", { userId: OWNER, isSystem: false }),
        category("foreign-1", { userId: "owner-2", isSystem: false }),
        category("unclassified", { userId: null, isSystem: false }),
      ],
      readySnapshot
    );

    expect(selection.map((entry) => entry.id)).toEqual([
      "system-1",
      "custom-1",
      "custom-pending",
    ]);
  });

  it("offers nothing while the catalogue is unavailable", (): void => {
    const selection = filterSelectableCategories(
      [category("system-1"), category("custom-1", { userId: OWNER })],
      {
        status: "unavailable",
        origin: ORIGIN,
        ownerId: OWNER,
        selectedSystemIds: new Set(),
        acceptedAt: null,
        error: "manifest_unreadable",
      }
    );

    expect(selection.map((entry) => entry.id)).toEqual(["custom-1"]);
  });
});

describe("publication store", (): void => {
  it("notifies subscribers and can be reset", (): void => {
    const listener = jest.fn();
    const unsubscribe = subscribeCategoryCatalogue(listener);

    resetCategoryCatalogueSnapshot();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callsAfterUnsubscribe = listener.mock.calls.length;
    resetCategoryCatalogueSnapshot();
    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe);
  });
});

describe("createCategoryCatalogueEnvironment", (): void => {
  it("exposes the runtime origin and owner seams", (): void => {
    const fakeDatabase = {
      adapter: {
        getLocal: () => Promise.resolve(null),
        setLocal: () => Promise.resolve(),
      },
      get: () => ({
        query: () => ({ fetch: () => Promise.resolve([]) }),
      }),
    };

    const environment = createCategoryCatalogueEnvironment(
      fakeDatabase as unknown as Database
    );

    expect(environment.getOrigin()).toBe(ORIGIN);
    expect(typeof environment.verifyLocalScope).toBe("function");
  });
});
