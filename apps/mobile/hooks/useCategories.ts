/**
 * Hook to get filtered category lists.
 *
 * Reads from the global CategoriesContext (single subscription) and
 * applies in-memory filters. No own DB subscription is created.
 */

import { Category, TransactionType } from "@monyvi/db";
import { useMemo } from "react";
import { useAllCategories } from "../context/CategoriesContext";

interface UseCategoriesResult {
  readonly categories: readonly Category[];
  readonly expenseCategories: readonly Category[];
  readonly incomeCategories: readonly Category[];
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly retry: () => void;
}

interface UseCategoriesOptions {
  readonly topLevelOnly?: boolean;
  readonly type?: TransactionType;
  readonly includeHidden?: boolean;
}

/**
 * Hook to get filtered category lists from the global CategoriesContext.
 *
 * @example
 * // Expense categories, top-level only (default)
 * const { expenseCategories } = useCategories({ type: "EXPENSE" });
 *
 * // All categories including subcategories
 * const { categories } = useCategories({ topLevelOnly: false });
 */
export function useCategories(
  options: UseCategoriesOptions = {}
): UseCategoriesResult {
  const { topLevelOnly = true, type, includeHidden = false } = options;
  const {
    categories: allCategories,
    isLoading,
    error,
    retry,
  } = useAllCategories();

  const filtered = useMemo(() => {
    let result = allCategories.filter((c) => !c.isInternal);

    if (topLevelOnly) {
      result = result.filter((c) => c.level === 1);
    }

    if (type) {
      result = result.filter((c) => c.type === type);
    }

    if (!includeHidden) {
      result = result.filter((c) => !c.isHidden);
    }

    return result;
  }, [allCategories, topLevelOnly, type, includeHidden]);

  const expenseCategories = useMemo(
    () => filtered.filter((c) => c.isExpense),
    [filtered]
  );

  const incomeCategories = useMemo(
    () => filtered.filter((c) => c.isIncome),
    [filtered]
  );

  return {
    categories: filtered,
    expenseCategories,
    incomeCategories,
    isLoading,
    error,
    retry,
  };
}
