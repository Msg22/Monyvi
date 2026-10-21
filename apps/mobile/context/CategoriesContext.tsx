import { Category, database } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { queryAccessibleCategories } from "@/services/user-data-access";
import { runUserScopedEffect, useCurrentUser } from "@/hooks/useCurrentUser";
import {
  createCategoryCatalogueEnvironment,
  getCategoryCatalogueSnapshot,
  loadCategoryCatalogueSnapshot,
  resetCategoryCatalogueSnapshot,
  subscribeCategoryCatalogue,
  type CategoryCatalogueSnapshot,
} from "@/services/category-catalogue-service";
import { emitCategorySnapshotDiagnostics } from "@/utils/dev-category-aggregate-diagnostics";
import { logger } from "@/utils/logger";
import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoriesContextValue {
  /** Full array of all non-deleted categories, sorted by sort_order. */
  readonly categories: readonly Category[];
  /** O(1) lookup map: category ID → Category model. */
  readonly categoryMap: ReadonlyMap<string, Category>;
  /**
   * Per-backend catalogue selection snapshot. Legacy categories stay in the
   * map above (history and labels keep working) but are not offered for new
   * choices while they are outside the current catalogue.
   */
  readonly catalogue: CategoryCatalogueSnapshot;
  /** Re-reads the accepted catalogue manifest for the current owner. */
  readonly reloadCatalogue: () => Promise<void>;
  /** True while the initial observation result hasn't arrived yet. */
  readonly isLoading: boolean;
  /** Observation failure; prior category data remains available when present. */
  readonly error: unknown;
  /** Recreate the scoped observation after a failure. */
  readonly retry: () => void;
}

interface CategoriesProviderProps {
  readonly children: React.ReactNode;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CategoriesProvider({
  children,
}: CategoriesProviderProps): React.JSX.Element {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  const { userId, isResolvingUser } = useCurrentUser();

  const catalogue = useSyncExternalStore(
    subscribeCategoryCatalogue,
    getCategoryCatalogueSnapshot,
    getCategoryCatalogueSnapshot
  );

  // Load the accepted catalogue manifest for the current backend and owner.
  // This is a local read only: no network request is triggered here.
  useEffect(() => {
    if (userId === null) {
      // Signout: no owner scope may survive the session end.
      resetCategoryCatalogueSnapshot();
      return;
    }
    let cancelled = false;
    // A new owner never reuses the previous owner's published selection.
    resetCategoryCatalogueSnapshot();
    void loadCategoryCatalogueSnapshot(
      createCategoryCatalogueEnvironment(database),
      { ownerId: userId }
    )
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        if (cancelled) return;
        logger.warn("categoryCatalogue.manifestLoadFailed");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    return runUserScopedEffect({
      userId,
      isResolvingUser,
      onResolving: () => {
        setCategories([]);
        setIsLoading(true);
        setError(null);
      },
      onSignedOut: () => {
        setCategories([]);
        setIsLoading(false);
        setError(null);
      },
      onAuthenticated: (currentUserId) => {
        setIsLoading(true);
        setError(null);
        const subscription = queryAccessibleCategories(
          database.get<Category>("categories"),
          currentUserId,
          Q.where("deleted", false),
          Q.sortBy("sort_order", Q.asc)
        )
          .observe()
          .subscribe({
            next: (result) => {
              emitCategorySnapshotDiagnostics(result);
              setCategories(result);
              setIsLoading(false);
              setError(null);
            },
            error: (err) => {
              logger.error("categoriesProvider.observe.failed", err);
              setIsLoading(false);
              setError(err);
            },
          });

        return () => subscription.unsubscribe();
      },
    });
  }, [userId, isResolvingUser, retryCounter]);

  const retry = useCallback((): void => {
    setRetryCounter((counter) => counter + 1);
  }, []);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const reloadCatalogue = useCallback(async (): Promise<void> => {
    if (userId === null) return;
    await loadCategoryCatalogueSnapshot(
      createCategoryCatalogueEnvironment(database),
      { ownerId: userId }
    );
  }, [userId]);

  const value = useMemo<CategoriesContextValue>(
    () => ({
      categories,
      categoryMap,
      catalogue,
      reloadCatalogue,
      isLoading,
      error,
      retry,
    }),
    [
      categories,
      categoryMap,
      catalogue,
      reloadCatalogue,
      isLoading,
      error,
      retry,
    ]
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns a Map<string, Category> for O(1) lookups by category ID.
 *
 * @example
 * const categoryMap = useCategoryLookup();
 * const cat = categoryMap.get(transaction.categoryId);
 */
export function useCategoryLookup(): ReadonlyMap<string, Category> {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error(
      "useCategoryLookup must be used within a CategoriesProvider"
    );
  }
  return context.categoryMap;
}

/**
 * Returns the full categories array (all non-deleted, sorted by sort_order).
 * Use this when you need list iteration, not individual lookups.
 */
export function useAllCategories(): {
  readonly categories: readonly Category[];
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly retry: () => void;
} {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error(
      "useAllCategories must be used within a CategoriesProvider"
    );
  }
  return {
    categories: context.categories,
    isLoading: context.isLoading,
    error: context.error,
    retry: context.retry,
  };
}

/**
 * Returns the published per-backend catalogue selection snapshot.
 *
 * "ready" means the current backend's accepted catalogue is known, so the
 * selection list can be derived from it. "unavailable" means no accepted
 * catalogue exists for the current backend (for example a first run against a
 * backend that was never synced); history lookups keep working regardless.
 */
export function useCategoryCatalogueSnapshot(): CategoryCatalogueSnapshot {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error(
      "useCategoryCatalogueSnapshot must be used within a CategoriesProvider"
    );
  }
  return context.catalogue;
}

/**
 * Optional access to the shared categories value.
 *
 * Returns null outside a CategoriesProvider so a component can fall back to
 * its own data source instead of failing.
 */
export function useOptionalCategoriesValue(): CategoriesContextValue | null {
  return useContext(CategoriesContext);
}

/**
 * Optional access to the catalogue snapshot and its reload action.
 *
 * Returns null outside a CategoriesProvider so a component can render its
 * normal content when no catalogue authority is mounted.
 */
export function useOptionalCategoryCatalogue(): {
  readonly catalogue: CategoryCatalogueSnapshot;
  readonly reloadCatalogue: () => Promise<void>;
} | null {
  const context = useContext(CategoriesContext);
  if (!context) return null;
  return {
    catalogue: context.catalogue,
    reloadCatalogue: context.reloadCatalogue,
  };
}

/**
 * Returns the catalogue snapshot and the action that re-reads the accepted
 * manifest for the current owner (a local read only; it never performs a
 * network request).
 */
export function useCategoryCatalogue(): {
  readonly catalogue: CategoryCatalogueSnapshot;
  readonly reloadCatalogue: () => Promise<void>;
} {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error(
      "useCategoryCatalogue must be used within a CategoriesProvider"
    );
  }
  return {
    catalogue: context.catalogue,
    reloadCatalogue: context.reloadCatalogue,
  };
}
