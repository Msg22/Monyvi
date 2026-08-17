/**
 * CategoriesContext — Global category data provider.
 *
 * Loads ALL non-deleted categories via a single WatermelonDB observation
 * and exposes them as a Map<string, Category> for O(1) lookups.
 * Any category update (add, rename, reorder) propagates automatically.
 */

import { Category, database } from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { queryAccessibleCategories } from "@/services/user-data-access";
import { runUserScopedEffect, useCurrentUser } from "@/hooks/useCurrentUser";
import { logger } from "@/utils/logger";
import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoriesContextValue {
  /** Full array of all non-deleted categories, sorted by sort_order. */
  readonly categories: readonly Category[];
  /** O(1) lookup map: category ID → Category model. */
  readonly categoryMap: ReadonlyMap<string, Category>;
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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

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

  const value = useMemo<CategoriesContextValue>(
    () => ({ categories, categoryMap, isLoading, error, retry }),
    [categories, categoryMap, error, isLoading, retry]
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
