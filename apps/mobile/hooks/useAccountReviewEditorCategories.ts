/**
 * #395 T054 — the controlled review editor's authenticated category-read
 * lifecycle. The service alone queries WatermelonDB; UI receives shaped
 * options, readiness and safe failure state, never account/user query helpers.
 */
import { useEffect, useState } from "react";
import type { Category } from "@monyvi/db";

export interface UseAccountReviewEditorCategoriesInput {
  readonly visible: boolean;
  readonly ownerId: string;
  readonly rowId: string;
  readonly rowRevision: string;
  readonly signal?: AbortSignal;
}

export interface AccountReviewEditorCategoryView {
  readonly categories: readonly Category[];
  readonly isReady: boolean;
  readonly hasError: boolean;
}

interface ScopedCategoryState extends AccountReviewEditorCategoryView {
  readonly scopeKey: string;
}

const EMPTY_CATEGORIES: readonly Category[] = Object.freeze([]);

type AccountReviewCategoryRuntime = Pick<
  typeof import("@/services/account-review-transaction-edit-category-service"),
  "loadCurrentAccountReviewEditorCategories"
>;

function loadCategoryRuntime(): AccountReviewCategoryRuntime {
  // The real owner-scoped reader is needed only when this editor is visible.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded: unknown = require("@/services/account-review-transaction-edit-category-service");
  if (
    typeof loaded !== "object" ||
    loaded === null ||
    !("loadCurrentAccountReviewEditorCategories" in loaded) ||
    typeof loaded.loadCurrentAccountReviewEditorCategories !== "function"
  )
    throw new Error("account_review_category_reader_unavailable");
  return loaded as AccountReviewCategoryRuntime;
}

export function useAccountReviewEditorCategories({
  visible,
  ownerId,
  rowId,
  rowRevision,
  signal,
}: UseAccountReviewEditorCategoriesInput): AccountReviewEditorCategoryView {
  // Identity is resolved during render so even before a cleanup/effect runs,
  // old actor/row categories cannot be exposed to a replacement editor.
  const scopeKey = JSON.stringify([ownerId, rowId, rowRevision]);
  const [current, setCurrent] = useState<ScopedCategoryState | null>(null);

  useEffect(() => {
    setCurrent(null);
    if (!visible || signal?.aborted) return;

    const controller = new AbortController();
    const onExternalAbort = (): void => {
      controller.abort();
      setCurrent(null);
    };
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (signal?.aborted) {
      onExternalAbort();
    } else {
      void Promise.resolve()
        .then(() => {
          if (controller.signal.aborted || signal?.aborted) return null;
          return loadCategoryRuntime().loadCurrentAccountReviewEditorCategories(
            ownerId,
            controller.signal
          );
        })
        .then((result) => {
          if (!result || controller.signal.aborted || signal?.aborted) return;
          const { snapshot, records } = result;
          if (snapshot.ownerId !== ownerId) {
            setCurrent({
              scopeKey,
              categories: EMPTY_CATEGORIES,
              isReady: false,
              hasError: true,
            });
            return;
          }
          setCurrent({
            scopeKey,
            categories: records,
            isReady: true,
            hasError: false,
          });
        })
        .catch(() => {
          if (controller.signal.aborted || signal?.aborted) return;
          setCurrent({
            scopeKey,
            categories: EMPTY_CATEGORIES,
            isReady: false,
            hasError: true,
          });
        });
    }

    return () => {
      controller.abort();
      signal?.removeEventListener("abort", onExternalAbort);
    };
  }, [visible, ownerId, rowId, rowRevision, scopeKey, signal]);

  if (!visible || signal?.aborted || current?.scopeKey !== scopeKey) {
    return { categories: EMPTY_CATEGORIES, isReady: false, hasError: false };
  }
  return {
    categories: current.categories,
    isReady: current.isReady,
    hasError: current.hasError,
  };
}
