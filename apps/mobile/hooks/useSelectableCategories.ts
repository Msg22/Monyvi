/**
 * Canonical selection list for category pickers.
 *
 * The list is derived from the shared category rows and the published
 * per-backend catalogue snapshot: global system categories are offered only
 * while they belong to the currently accepted catalogue, while the owner's own
 * categories (including dirty or pending ones) are always offered. Legacy rows
 * stay in the shared lookup map, so old records keep their original labels.
 */

import type { Category } from "@monyvi/db";
import { useMemo } from "react";
import {
  useAllCategories,
  useCategoryCatalogueSnapshot,
  useOptionalCategoriesValue,
  useOptionalCategoryCatalogue,
} from "../context/CategoriesContext";
import {
  filterSelectableCategories,
  type CategoryCatalogueStatus,
} from "@/services/category-catalogue-service";

export interface UseSelectableCategoriesResult {
  /** Categories that may be offered for a new choice. */
  readonly categories: readonly Category[];
  /** True while the shared category rows are still loading. */
  readonly isLoading: boolean;
  /** Authoritative observation error of the shared category rows. */
  readonly error: unknown;
  /** Catalogue state: "ready", "loading" or "unavailable". */
  readonly status: CategoryCatalogueStatus;
}

/**
 * Optional access to the selectable categories.
 *
 * Returns null outside a CategoriesProvider so a component can fall back to
 * its own data source instead of failing.
 */
export function useOptionalSelectableCategories(): UseSelectableCategoriesResult | null {
  const context = useOptionalCategoriesValue();
  const catalogue = useOptionalCategoryCatalogue();
  const categories = context?.categories;

  return useMemo(() => {
    if (!categories || !catalogue) return null;
    const selectable = filterSelectableCategories(
      categories.filter((category) => !category.isInternal),
      catalogue.catalogue
    );
    return {
      categories: selectable,
      isLoading: context?.isLoading ?? true,
      error: context?.error ?? null,
      status: catalogue.catalogue.status,
    };
  }, [categories, catalogue, context?.isLoading, context?.error]);
}

/**
 * Returns the categories that belong to the current catalogue.
 */
export function useSelectableCategories(): UseSelectableCategoriesResult {
  const { categories: allCategories, isLoading, error } = useAllCategories();
  const catalogue = useCategoryCatalogueSnapshot();

  const selectable = useMemo(
    () =>
      filterSelectableCategories(
        allCategories.filter((category) => !category.isInternal),
        catalogue
      ),
    [allCategories, catalogue]
  );

  return {
    categories: selectable,
    isLoading,
    error,
    status: catalogue.status,
  };
}
