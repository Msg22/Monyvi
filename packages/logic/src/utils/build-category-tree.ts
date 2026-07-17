/**
 * Builds a human-readable category tree string from a flat category array.
 *
 * Produces output matching the L1/L2 format expected by the parse-sms
 * Edge Function's system prompt, e.g.:
 *
 * ```
 * EXPENSE categories (return the system_name value):
 *   L1: food_drinks
 *     L2: groceries, restaurant, coffee_tea
 *   L1: transportation
 *     L2: public_transport, private_transport
 *
 * INCOME categories:
 *   L1: income
 *     L2: salary, bonus, freelance
 * ```
 *
 * @module build-category-tree
 */

import type { Category } from "@monyvi/db";
import type { CategoryMapSource } from "./ai-parser-utils";

// ---------------------------------------------------------------------------
// Types (minimal shape required — decoupled from WatermelonDB model)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CategoryTreeSource extends CategoryMapSource {
  readonly level: Category["level"];
  readonly parentId?: Category["parentId"];
  readonly type: Category["type"];
  readonly isSystem?: Category["isSystem"];
  readonly isHidden?: Category["isHidden"];
  readonly isInternal?: Category["isInternal"];
  readonly deleted?: Category["deleted"];
}

/**
 * Builds an AI-friendly category tree string from a flat category list.
 *
 * Categories are grouped by type (EXPENSE, then INCOME), with L1 parents
 * listed first and their L2 children indented beneath.
 *
 * @param categories - Flat array of all non-deleted categories (any order).
 * @returns Formatted category tree string ready for the AI system prompt.
 */
export function buildCategoryTree(
  categories: readonly CategoryTreeSource[]
): string {
  const l1Categories = categories.filter((c) => c.level === 1);
  const l2Categories = categories.filter((c) => c.level === 2);

  // Index L2s by parentId for O(1) child lookups
  const childrenByParentId = new Map<string, CategoryTreeSource[]>();
  for (const child of l2Categories) {
    if (child.parentId) {
      const siblings = childrenByParentId.get(child.parentId) ?? [];
      siblings.push(child);
      childrenByParentId.set(child.parentId, siblings);
    }
  }

  const sections: string[] = [];

  for (const type of ["EXPENSE", "INCOME"] as const) {
    const header =
      type === "EXPENSE"
        ? "EXPENSE categories (return the system_name value):"
        : "INCOME categories:";

    const parents = l1Categories.filter((c) => c.type === type);
    if (parents.length === 0) continue;

    const lines: string[] = [header];

    for (const parent of parents) {
      lines.push(`  L1: ${parent.systemName}`);

      const children = childrenByParentId.get(parent.id);
      if (children && children.length > 0) {
        const childNames = children.map((c) => c.systemName).join(", ");
        lines.push(`    L2: ${childNames}`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
