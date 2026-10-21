/**
 * Per-backend, per-owner category catalogue service.
 *
 * The service owns the selection authority for the shared category pickers:
 * it commits the attempt-bound snapshot produced by the categories pull (only
 * after the SDK applied it and the system ids were verified locally with their
 * scope classification), persists it per (backend origin, owner) in local
 * storage, and publishes the resulting selection snapshot to the app.
 *
 * It never deletes or mutates category rows, never rewrites an existing
 * category reference and never touches financial data. Legacy rows stay
 * resolvable for old records; they are simply not offered for new choices.
 *
 * There is no module-global attempt state: the attempt is carried by the
 * protected sync invocation that produced it, and only that invocation may
 * commit it.
 */

import type { Category } from "@monyvi/db";
import { Q, type Database } from "@nozbe/watermelondb";
import { getCurrentUserId, getSupabaseClientOrigin } from "@/services/supabase";
import { queryAccessibleCategories } from "@/services/user-data-access";
import {
  buildCategoryCatalogueManifestKey,
  normalizeCatalogueOrigin,
  parseCategoryCatalogueManifest,
  serializeCategoryCatalogueManifest,
  type CategoryCatalogueManifest,
  type CategoryId,
} from "@/utils/category-catalogue-source";

/** Publication state of the catalogue for the current (backend, owner). */
export type CategoryCatalogueStatus = "loading" | "ready" | "unavailable";

/** Error code of the last catalogue failure (never a raw message). */
export type CategoryCatalogueErrorCode = "manifest_unreadable" | null;

/** Published selection snapshot (stable object identity between changes). */
export interface CategoryCatalogueSnapshot {
  readonly status: CategoryCatalogueStatus;
  readonly origin: string | null;
  /** Owner the published selection belongs to (never logged). */
  readonly ownerId: string | null;
  /** Active system ids of the currently accepted catalogue. */
  readonly selectedSystemIds: ReadonlySet<CategoryId>;
  readonly acceptedAt: number | null;
  readonly error: CategoryCatalogueErrorCode;
}

/** Attempt-bound snapshot captured by one categories pull. */
export interface CategoryCatalogueAttempt {
  readonly origin: string;
  readonly ownerId: string;
  readonly capturedAt: number;
  /** True only for a complete, page-validated full-window pull. */
  readonly complete: boolean;
  readonly systemIds: readonly CategoryId[];
  readonly customOwnerIds: readonly CategoryId[];
}

/**
 * Receives the attempt-bound snapshot of one categories pull.
 *
 * The listener is owned by the sync invocation that requested the pull, so the
 * attempt never lives in module-global state.
 */
export type CategoryCatalogueAttemptListener = (
  attempt: CategoryCatalogueAttempt
) => void;

/** Environment seams (production wiring plus focused test doubles). */
export interface CategoryCatalogueEnvironment {
  readonly getOrigin: () => string | null;
  readonly getOwnerId: () => Promise<string | null>;
  readonly readLocal: (key: string) => Promise<string | null>;
  readonly writeLocal: (key: string, value: string) => Promise<void>;
  /**
   * True when every system id exists locally as an active global system row.
   * The owner's own category ids are informational and never gate the
   * catalogue: a pending custom deletion must not make the global catalogue
   * unavailable.
   */
  readonly verifyLocalScope: (options: {
    readonly systemIds: readonly CategoryId[];
    readonly ownerId: string;
  }) => Promise<boolean>;
}

/** The initial publication is a pending read, not a failure. */
const INITIAL_SNAPSHOT: CategoryCatalogueSnapshot = {
  status: "loading",
  origin: null,
  ownerId: null,
  selectedSystemIds: new Set<CategoryId>(),
  acceptedAt: null,
  error: null,
};

const UNKNOWN_SNAPSHOT: CategoryCatalogueSnapshot = {
  status: "unavailable",
  origin: null,
  ownerId: null,
  selectedSystemIds: new Set<CategoryId>(),
  acceptedAt: null,
  error: "manifest_unreadable",
};

let published: CategoryCatalogueSnapshot = INITIAL_SNAPSHOT;
/** Monotonic version of the published snapshot. */
let publicationVersion = 0;
/**
 * Scope generation: bumped only when the published scope is reset (owner or
 * backend switch, signout). A commit that started before a reset must not
 * publish afterwards, while cached loads (which bump only
 * `publicationVersion`) never abort a fresh commit.
 */
let scopeGeneration = 0;
const listeners = new Set<() => void>();
/** Serializes commits per manifest key so concurrent commits cannot downgrade. */
const commitQueues = new Map<string, Promise<unknown>>();

function publish(next: CategoryCatalogueSnapshot): void {
  publicationVersion += 1;
  published = next;
  for (const listener of listeners) listener();
}

/** Subscribes to catalogue publications (useSyncExternalStore compatible). */
export function subscribeCategoryCatalogue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current published catalogue snapshot. */
export function getCategoryCatalogueSnapshot(): CategoryCatalogueSnapshot {
  return published;
}

/**
 * Invalidates in-flight load/commit continuations and clears the published
 * selection (used when the owner or the backend changes).
 */
export function resetCategoryCatalogueSnapshot(): void {
  scopeGeneration += 1;
  publish(UNKNOWN_SNAPSHOT);
}

function withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = commitQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  commitQueues.set(
    key,
    next.catch(() => undefined)
  );
  return next;
}

/**
 * True when a load for the given pair may publish.
 *
 * A load never disturbs a publication that belongs to another owner or
 * backend, and it never downgrades an already ready catalogue of the same
 * pair to "loading" (which would empty the selection for a moment).
 */
/**
 * True when a load for the given pair may publish.
 *
 * - An unknown publication (no owner yet) may always be replaced.
 * - A publication of another owner is never touched.
 * - A backend switch for the same owner replaces the catalogue.
 * - A ready catalogue of the same pair is never downgraded to
 *   "loading"/"unavailable" by a cached load.
 */
function canPublishFor(origin: string | null, ownerId: string): boolean {
  if (published.ownerId === null) return true;
  if (published.ownerId !== ownerId) return false;
  if (origin !== null && published.origin !== origin) return true;
  if (published.status === "ready") return false;
  return true;
}

/**
 * Reads the attempt-bound catalogue snapshot carried by a categories pull
 * result. The reader is structural and fails closed on any unexpected shape.
 */
export function readCategoryCatalogueAttempt(
  value: unknown
): CategoryCatalogueAttempt | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const attempt = record["catalogueAttempt"];
  if (typeof attempt !== "object" || attempt === null) return null;
  const entry = attempt as Record<string, unknown>;
  const origin = entry["origin"];
  const ownerId = entry["ownerId"];
  const capturedAt = entry["capturedAt"];
  const complete = entry["complete"];
  const systemIds = entry["systemIds"];
  const customOwnerIds = entry["customOwnerIds"];
  if (typeof origin !== "string" || origin.length === 0) return null;
  if (typeof ownerId !== "string" || ownerId.length === 0) return null;
  if (typeof capturedAt !== "number" || !Number.isFinite(capturedAt))
    return null;
  if (complete !== true) return null;
  if (!Array.isArray(systemIds)) return null;
  if (!systemIds.every((id) => typeof id === "string")) return null;
  if (!Array.isArray(customOwnerIds)) return null;
  if (!customOwnerIds.every((id) => typeof id === "string")) return null;
  return {
    origin,
    ownerId,
    capturedAt,
    complete,
    systemIds,
    customOwnerIds,
  };
}

/**
 * Commits one attempt-bound snapshot.
 *
 * The manifest is persisted only when the attempt is complete, belongs to the
 * given owner and backend, the live client still points at that backend, the
 * owner did not change, and every system id was verified locally as an active
 * global system row. Acceptance is monotonic and serialized per manifest key:
 * a newer accepted manifest is never downgraded, a concurrent commit for the
 * same key cannot overwrite it, and a crash between apply and commit keeps the
 * previously accepted manifest so the next sync retries.
 */
export async function commitCategoryCatalogueAttempt(
  environment: CategoryCatalogueEnvironment,
  options: {
    readonly attempt: CategoryCatalogueAttempt;
    readonly ownerId: string;
  }
): Promise<boolean> {
  const { attempt, ownerId } = options;
  if (!attempt.complete) return false;
  if (attempt.ownerId !== ownerId) return false;

  const expectedOrigin = normalizeCatalogueOrigin(attempt.origin);
  if (expectedOrigin === null) return false;
  if (environment.getOrigin() !== expectedOrigin) return false;

  const manifestKey = buildCategoryCatalogueManifestKey(
    expectedOrigin,
    ownerId
  );
  // Captured before the per-key queue wait: a scope reset during the wait
  // must invalidate this commit.
  const scopeGenerationAtStart = scopeGeneration;

  return withKeyLock(manifestKey, async (): Promise<boolean> => {
    const ownerBefore = await environment.getOwnerId();
    if (ownerBefore === null || ownerBefore !== ownerId) return false;
    if (environment.getOrigin() !== expectedOrigin) return false;

    const verified = await environment.verifyLocalScope({
      systemIds: attempt.systemIds,
      ownerId,
    });
    if (!verified) return false;

    const ownerAfterVerify = await environment.getOwnerId();
    if (ownerAfterVerify === null || ownerAfterVerify !== ownerId) return false;
    if (environment.getOrigin() !== expectedOrigin) return false;

    const existingRaw = await environment.readLocal(manifestKey);
    const existing = parseCategoryCatalogueManifest(
      existingRaw,
      expectedOrigin,
      ownerId
    );
    // Monotonic acceptance: a newer accepted manifest is never downgraded.
    if (existing !== null && existing.acceptedAt > attempt.capturedAt) {
      return false;
    }

    const manifest: CategoryCatalogueManifest = {
      version: 2,
      origin: expectedOrigin,
      ownerId,
      acceptedAt: attempt.capturedAt,
      snapshotComplete: true,
      systemIds: attempt.systemIds,
      customOwnerIds: attempt.customOwnerIds,
    };
    await environment.writeLocal(
      manifestKey,
      serializeCategoryCatalogueManifest(manifest)
    );

    const ownerAfterWrite = await environment.getOwnerId();
    if (ownerAfterWrite === null || ownerAfterWrite !== ownerId) return false;
    if (environment.getOrigin() !== expectedOrigin) return false;

    // Publish only what is actually persisted: a newer commit for the same key
    // must not be replaced by an older one.
    const persistedRaw = await environment.readLocal(manifestKey);
    const persisted = parseCategoryCatalogueManifest(
      persistedRaw,
      expectedOrigin,
      ownerId
    );
    if (persisted === null) return false;
    if (persisted.acceptedAt < attempt.capturedAt) return false;

    // Final scope checks immediately before the publication: the scope may
    // have been reset (owner switch, signout) while this commit was running.
    const ownerFinal = await environment.getOwnerId();
    if (ownerFinal === null || ownerFinal !== ownerId) return false;
    if (environment.getOrigin() !== expectedOrigin) return false;
    // The scope generation is re-checked after the last await: a reset during
    // that await must invalidate this commit.
    if (scopeGeneration !== scopeGenerationAtStart) return false;

    publish({
      status: "ready",
      origin: persisted.origin,
      ownerId: persisted.ownerId,
      selectedSystemIds: new Set(persisted.systemIds),
      acceptedAt: persisted.acceptedAt,
      error: null,
    });
    return true;
  });
}

/**
 * Loads the accepted manifest for the currently configured backend and owner.
 *
 * - A known backend with an accepted manifest publishes "ready".
 * - A backend without an accepted manifest publishes "unavailable" (never
 *   another backend's manifest, never another owner's manifest, never an empty
 *   selection presented as valid).
 * - A load that started before a newer publication (a fresh commit, a reset or
 *   another load) never overwrites that publication.
 */
export async function loadCategoryCatalogueSnapshot(
  environment: CategoryCatalogueEnvironment,
  options: { readonly ownerId: string }
): Promise<CategoryCatalogueSnapshot> {
  const { ownerId } = options;
  const versionAtStart = publicationVersion;
  const rawOrigin = environment.getOrigin();
  const origin =
    rawOrigin === null ? null : normalizeCatalogueOrigin(rawOrigin);
  if (origin === null) {
    if (publicationVersion === versionAtStart && canPublishFor(null, ownerId)) {
      publish(UNKNOWN_SNAPSHOT);
    }
    return published;
  }
  if (canPublishFor(origin, ownerId)) {
    publish({
      status: "loading",
      origin,
      ownerId,
      selectedSystemIds: new Set<CategoryId>(),
      acceptedAt: null,
      error: null,
    });
  }
  // The version is captured after the loading publication, so this load can
  // still publish its own result, while any newer publication (a fresh
  // commit, a reset) makes it step aside.
  const versionAfterLoad = publicationVersion;

  let raw: string | null = null;
  try {
    const ownerBefore = await environment.getOwnerId();
    if (ownerBefore === null || ownerBefore !== ownerId) {
      if (
        publicationVersion === versionAfterLoad &&
        canPublishFor(origin, ownerId)
      ) {
        publish({
          status: "unavailable",
          origin,
          ownerId,
          selectedSystemIds: new Set<CategoryId>(),
          acceptedAt: null,
          error: "manifest_unreadable",
        });
      }
      return published;
    }
    raw = await environment.readLocal(
      buildCategoryCatalogueManifestKey(origin, ownerId)
    );
    const ownerAfter = await environment.getOwnerId();
    if (ownerAfter === null || ownerAfter !== ownerId) {
      if (
        publicationVersion === versionAfterLoad &&
        canPublishFor(origin, ownerId)
      ) {
        publish({
          status: "unavailable",
          origin,
          ownerId,
          selectedSystemIds: new Set<CategoryId>(),
          acceptedAt: null,
          error: "manifest_unreadable",
        });
      }
      return published;
    }
  } catch {
    // A failing local read must end in a retryable unavailable state, never in
    // a permanent loading state.
    if (
      publicationVersion === versionAfterLoad &&
      canPublishFor(origin, ownerId)
    ) {
      publish({
        status: "unavailable",
        origin,
        ownerId,
        selectedSystemIds: new Set<CategoryId>(),
        acceptedAt: null,
        error: "manifest_unreadable",
      });
    }
    return published;
  }
  if (environment.getOrigin() !== origin) {
    if (
      publicationVersion === versionAfterLoad &&
      canPublishFor(origin, ownerId)
    ) {
      publish({
        status: "unavailable",
        origin,
        ownerId,
        selectedSystemIds: new Set<CategoryId>(),
        acceptedAt: null,
        error: "manifest_unreadable",
      });
    }
    return published;
  }
  // A newer publication (for example a fresh commit) wins over this load.
  if (publicationVersion !== versionAfterLoad) return published;

  const manifest = parseCategoryCatalogueManifest(raw, origin, ownerId);
  if (manifest === null) {
    if (
      publicationVersion === versionAfterLoad &&
      canPublishFor(origin, ownerId)
    ) {
      publish({
        status: "unavailable",
        origin,
        ownerId,
        selectedSystemIds: new Set<CategoryId>(),
        acceptedAt: null,
        error: "manifest_unreadable",
      });
    }
    return published;
  }
  publish({
    status: "ready",
    origin: manifest.origin,
    ownerId: manifest.ownerId,
    selectedSystemIds: new Set(manifest.systemIds),
    acceptedAt: manifest.acceptedAt,
    error: null,
  });
  return published;
}

/**
 * True when a category may be offered for a new choice.
 *
 * - The owner's own categories (including dirty or pending ones) are always
 *   selectable.
 * - Global system categories are selectable only while they belong to the
 *   currently accepted catalogue of the same backend and owner.
 * - Everything else (foreign owner rows, global rows that are not classified
 *   as system categories) fails closed.
 */
export function isCategorySelectable(
  category: {
    readonly id: CategoryId;
    readonly userId?: string | null;
    readonly isSystem: boolean;
  },
  snapshot: CategoryCatalogueSnapshot
): boolean {
  const ownerId = snapshot.ownerId;
  if (ownerId === null) return false;
  if (category.userId === ownerId) return true;
  if (category.userId !== null && category.userId !== undefined) return false;
  if (category.isSystem !== true) return false;
  if (snapshot.status !== "ready") return false;
  return snapshot.selectedSystemIds.has(category.id);
}

/** Filters categories down to the current selection. */
export function filterSelectableCategories<
  T extends {
    readonly id: CategoryId;
    readonly userId?: string | null;
    readonly isSystem: boolean;
  },
>(categories: readonly T[], snapshot: CategoryCatalogueSnapshot): readonly T[] {
  return categories.filter((category) =>
    isCategorySelectable(category, snapshot)
  );
}

/**
 * Production environment for the catalogue service.
 *
 * The local verification reads the accessible category rows once (global system
 * rows plus the current owner's own rows) and compares the system ids with
 * them. Nothing is written to the category table.
 */
export function createCategoryCatalogueEnvironment(
  database: Database
): CategoryCatalogueEnvironment {
  return {
    getOrigin: () => getSupabaseClientOrigin(),
    getOwnerId: async () => (await getCurrentUserId()) ?? null,
    readLocal: async (key) => (await database.adapter.getLocal(key)) ?? null,
    writeLocal: (key, value) => database.adapter.setLocal(key, value),
    verifyLocalScope: async ({ systemIds, ownerId }) => {
      if (systemIds.length === 0) return true;
      const rows = await queryAccessibleCategories(
        database.get<Category>("categories"),
        ownerId,
        Q.where("deleted", false)
      ).fetch();
      const globalSystemIds = new Set(
        rows
          .filter(
            (row) =>
              row.isSystem === true &&
              (row.userId === null || row.userId === undefined)
          )
          .map((row) => row.id)
      );
      return systemIds.every((id) => globalSystemIds.has(id));
    },
  };
}
