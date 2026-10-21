/**
 * Hook to determine which categories have children.
 *
 * Reads from the global CategoriesContext (single subscription) and
 * derives the parent-IDs set in-memory. No own DB subscription is created.
 */

import type { Category } from "@monyvi/db";
import { useMemo } from "react";
import { useSelectableCategories } from "./useSelectableCategories";

/**
 * Given a list of categories, determines which ones actually have
 * children. Returns a `Set<string>` of category IDs that are parents.
 *
 * Derived entirely from the global categories context — no extra
 * DB query is issued.
 */
export function useCategoriesWithChildren(
  categories: readonly Category[]
): Set<string> {
  const { categories: allCategories } = useSelectableCategories();

  return useMemo(() => {
    if (categories.length === 0) return new Set<string>();

    const targetIds = new Set(categories.map((c) => c.id));

    const parentIds = new Set<string>();
    for (const cat of allCategories) {
      if (
        cat.parentId &&
        targetIds.has(cat.parentId) &&
        !cat.isInternal &&
        !cat.isHidden
      ) {
        parentIds.add(cat.parentId);
      }
    }

    return parentIds;
  }, [categories, allCategories]);
}
