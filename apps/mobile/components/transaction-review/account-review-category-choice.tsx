/** #395 row-only category shortcut, with the existing authenticated category reader. */
import type { AccountReviewRow, AccountReviewSession } from "@monyvi/logic";
import type { UseAccountReviewInput } from "@/hooks/account-review-facade-state";
import React, { useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAccountReviewEditorCategories } from "@/hooks/useAccountReviewEditorCategories";
import { CategorySelectorModal } from "@/components/modals/CategorySelectorModal";
import { useModalBottomInset } from "@/hooks/useModalBottomInset";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";
import { ReviewInlineNotice } from "./ReviewInlineNotice";

export interface ReviewCategoryChoiceTarget {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly rowId: string;
  readonly reviewRevision: string;
  readonly operationGeneration: string;
  readonly rowRevision: string;
}

export function currentReviewCategoryRow(
  session: AccountReviewSession | null,
  boundary: Pick<UseAccountReviewInput, "ownerId" | "sessionId" | "signal">,
  target: ReviewCategoryChoiceTarget | null
): AccountReviewRow | null {
  if (
    !session ||
    !target ||
    boundary.signal?.aborted ||
    boundary.ownerId !== target.ownerId ||
    boundary.sessionId !== target.sessionId ||
    session.ownerId !== target.ownerId ||
    session.sessionId !== target.sessionId ||
    session.revision !== target.reviewRevision ||
    session.operationGeneration !== target.operationGeneration
  )
    return null;
  return (
    session.rows.find(
      (row) =>
        row.rowId === target.rowId &&
        row.revision === target.rowRevision &&
        !(row.source === "SMS" && row.transaction.isAtmWithdrawal === true)
    ) ?? null
  );
}

export interface ReviewCategoryChoiceProps {
  readonly row: AccountReviewRow | null;
  readonly ownerId: string;
  readonly signal?: AbortSignal;
  readonly reviewFeedback?: ReviewFeedbackBoundary;
  readonly onSelect: (categoryId: string) => Promise<boolean>;
  readonly onClose: () => void;
}

function LiveCategoryChoice({
  row,
  ownerId,
  signal,
  reviewFeedback,
  onSelect,
  onClose,
}: Omit<ReviewCategoryChoiceProps, "row"> & {
  readonly row: AccountReviewRow;
}): React.JSX.Element {
  const { t } = useTranslation("transactions");
  const bottomInset = useModalBottomInset();
  const inFlight = React.useRef(false);
  const loaded = useAccountReviewEditorCategories({
    visible: true,
    ownerId,
    rowId: row.rowId,
    rowRevision: row.revision,
    signal,
  });
  const selectable = loaded.categories.filter(
    (category) =>
      category.type === row.transaction.type &&
      !category.deleted &&
      !category.isHidden &&
      !category.isInternal
  );
  const roots = selectable.filter(
    (category) => category.level === 1 || !category.parentId
  );
  return (
    <>
      {!loaded.isReady ? (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={onClose}
        >
          <View
            className="flex-1 justify-end bg-black/60"
            style={{ paddingBottom: bottomInset }}
          >
            <View className="min-h-32 gap-3 rounded-t-3xl bg-surface p-5 dark:bg-surface-dark">
              <Text
                accessibilityRole="alert"
                className="text-base text-text-primary dark:text-text-primary-dark"
              >
                {loaded.hasError ? t("sms_review_load_failed") : t("loading")}
              </Text>
              <ReviewInlineNotice
                notice={reviewFeedback?.modalNotice ?? null}
                surface="modal"
                onDismiss={() => reviewFeedback?.dismiss("modal")}
              />
              <TouchableOpacity
                testID="account-review-category-cancel"
                accessibilityRole="button"
                onPress={onClose}
                className="min-h-12 items-center justify-center"
              >
                <Text className="text-nileGreen-700 dark:text-nileGreen-400">
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : (
        <CategorySelectorModal
          visible
          inlineNotice={
            <ReviewInlineNotice
              notice={reviewFeedback?.modalNotice ?? null}
              surface="modal"
              onDismiss={() => reviewFeedback?.dismiss("modal")}
            />
          }
          rootCategories={roots}
          selectedId={row.transaction.categoryId}
          type={row.transaction.type}
          onSelect={(id) => {
            if (
              !inFlight.current &&
              selectable.some((category) => category.id === id) &&
              !signal?.aborted
            ) {
              inFlight.current = true;
              void onSelect(id).finally(() => {
                inFlight.current = false;
              });
            }
          }}
          onClose={() => {
            // The existing picker fires onClose immediately after onSelect.
            // Keep it mounted until the canonical writer accepts its row CAS.
            if (!inFlight.current) onClose();
          }}
        />
      )}
    </>
  );
}

/** Mount the scoped reader only for an actual currently-authorized row. */
export function AccountReviewCategoryChoice(
  props: ReviewCategoryChoiceProps
): React.JSX.Element | null {
  if (!props.row || props.signal?.aborted) return null;
  return (
    <LiveCategoryChoice
      row={props.row}
      ownerId={props.ownerId}
      signal={props.signal}
      reviewFeedback={props.reviewFeedback}
      onSelect={props.onSelect}
      onClose={props.onClose}
    />
  );
}

/** Stamped row-only category entry point. No category database access here. */
export function useReviewCategoryShortcut(input: {
  readonly session: AccountReviewSession | null;
  readonly boundary: Pick<
    UseAccountReviewInput,
    "ownerId" | "sessionId" | "signal"
  >;
  readonly busy: boolean;
  readonly send: (command: unknown) => Promise<boolean>;
}): {
  readonly currentRow: AccountReviewRow | null;
  readonly open: (rowId: string) => void;
  readonly choose: (categoryId: string) => Promise<boolean>;
  readonly close: () => void;
} {
  const [target, setTarget] = useState<ReviewCategoryChoiceTarget | null>(null);
  const currentRow = currentReviewCategoryRow(
    input.session,
    input.boundary,
    target
  );
  useEffect(() => {
    if (target !== null && currentRow === null) setTarget(null);
  }, [target, currentRow]);
  const open = (rowId: string): void => {
    const session = input.session;
    const row = session?.rows.find((item) => item.rowId === rowId);
    if (
      !session ||
      !row ||
      input.busy ||
      input.boundary.signal?.aborted ||
      input.boundary.ownerId !== session.ownerId ||
      input.boundary.sessionId !== session.sessionId ||
      (row.source === "SMS" && row.transaction.isAtmWithdrawal === true)
    )
      return;
    setTarget({
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      rowId,
      rowRevision: row.revision,
      reviewRevision: session.revision,
      operationGeneration: session.operationGeneration,
    });
  };
  const choose = async (categoryId: string): Promise<boolean> => {
    if (!target || !currentRow || input.busy || input.boundary.signal?.aborted)
      return false;
    const accepted = await input.send({
      kind: "edit_row_transaction",
      ownerId: target.ownerId,
      sessionId: target.sessionId,
      expectedReviewRevision: target.reviewRevision,
      expectedOperationGeneration: target.operationGeneration,
      rowId: target.rowId,
      expectedRowRevision: target.rowRevision,
      patch: { categoryId },
    });
    if (accepted && !input.boundary.signal?.aborted)
      setTarget((current) => (current === target ? null : current));
    return accepted;
  };
  return { currentRow, open, choose, close: () => setTarget(null) };
}
