/**
 * Hook to get child categories of a given parent.
 *
 * Reads from the global CategoriesContext (single subscription) and
 * filters in-memory. No own DB subscription is created.
 */

import type { Category, TransactionType } from "@monyvi/db";
import { useMemo } from "react";
import { useSelectableCategories } from "./useSelectableCategories";

interface UseCategoryChildrenResult {
  /** Child categories of the given parent */
  readonly children: Category[];
  /** Whether the context is still loading */
  readonly isLoading: boolean;
}

/**
 * Returns child categories for a given parentId from the global context.
 * Returns an empty array when parentId is null.
 * Reactively updates whenever the global categories observation emits.
 */
export function useCategoryChildren(
  parentId: string | null,
  type?: TransactionType
): UseCategoryChildrenResult {
  const { categories, isLoading } = useSelectableCategories();

  const children = useMemo(() => {
    if (!parentId) return [];

    let result = categories.filter(
      (c) => c.parentId === parentId && !c.isInternal && !c.isHidden
    );

    if (type) {
      result = result.filter((c) => c.type === type);
    }

    return result;
  }, [categories, parentId, type]);

  return { children, isLoading };
}
