import {
  type AccountReviewSession,
  type AccountReviewRow,
  type AccountReviewCommand,
} from "@monyvi/logic";
import { getExplicitAccountCurrencyOptions } from "../../../../packages/logic/src/account-review/candidates";
import {
  freshAccountReviewChoice,
  makeExplicitRowAccountCurrencyCommand,
  dispatchReviewChoiceCommand,
  submitPreparedManualReviewDraft,
  preselectedOwnedAccountId,
  reviewGroupChoiceRole,
  renderAccountReviewChoiceSheets,
  type ReviewChoice,
} from "./account-review-choice-controller";
import { accountType } from "../../../../packages/logic/src/account-review/schema-primitives";
import { useAccountReview } from "@/hooks/useAccountReview";
import { useReviewNotice } from "@/hooks/useReviewNotice";
import { ReviewInlineNotice } from "./ReviewInlineNotice";
import { AccountReviewPanel } from "./AccountReviewPanel";
import {
  type ReviewIssueKey,
  presentReviewDefaultAccountName,
  presentReviewIssues,
  intersectGuardedGroupAccountChoices,
  presentIssueRecoveryTarget,
  reviewChoiceStamp,
  presentCanonicalRowDetails,
  presentReviewGroup,
} from "./shared-account-presentation";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/navigation/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";
import { TransactionEditModal } from "./edit-modal/TransactionEditModal";
import { getExpandedContent } from "./get-expanded-content";
import { ReviewActionBar } from "./ReviewActionBar";
import { TransactionItem } from "./TransactionItem";
import { AtmDestinationStatus } from "./account-review-row-presentation";
import {
  AccountReviewCategoryChoice,
  useReviewCategoryShortcut,
} from "./account-review-category-choice";
import { useTemporaryAccountNeededFilter } from "./account-review-row-filter";
import { AccountNeededTemporaryHeader } from "./account-review-filter-header";
import { PartialSmsResultsNotice } from "./PartialSmsResultsNotice";
import { SafeguardQaDiagnosticsPanel } from "@/components/sms-sync/SafeguardQaDiagnosticsPanel";
import type {
  TransactionReviewProps,
  AccountReviewRuntimeBoundary,
  TransactionReviewListConfig,
} from "./TransactionReview";

interface ReviewTransactionEditTarget {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly rowId: string;
  readonly reviewRevision: string;
  readonly operationGeneration: string;
  readonly rowRevision: string;
}
type ReviewTransactionEditPatch = Extract<
  AccountReviewCommand,
  { kind: "edit_row_transaction" }
>["patch"];

export function CanonicalAccountReview(
  props: TransactionReviewProps & {
    readonly boundary: AccountReviewRuntimeBoundary;
    readonly renderConfig: TransactionReviewListConfig;
  }
): React.JSX.Element {
  const view = useAccountReview(props.boundary.input);
  const { t: tCommon } = useTranslation("common");
  const { t: tTransactions, i18n } = useTranslation("transactions");
  const { t: tAccounts } = useTranslation("accounts");
  const language = i18n.language.startsWith("ar") ? "ar" : "en";
  const localFeedback = useReviewNotice({ source: props.boundary.input.mode });
  const feedback = props.reviewFeedback ?? localFeedback;
  const [choice, setChoice] = useState<ReviewChoice>(null);
  const [transactionEdit, setTransactionEdit] =
    useState<ReviewTransactionEditTarget | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showDefaultWhy, setShowDefaultWhy] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [preparingDraft, setPreparingDraft] = useState(false);
  const draftInFlight = useRef(false);
  const draftEpoch = useRef(0);

  const session = view.session;
  const model = view.readModel;
  const busy = view.isBusy || props.isSaving || busySave || preparingDraft;
  useEffect(() => {
    props.boundary.onSessionChange?.(session);
  }, [props.boundary.onSessionChange, session]);

  const retryInput = props.boundary.input;
  const retryMode = retryInput.mode;
  const retryOwnerId = retryInput.ownerId;
  const retrySessionId = retryInput.sessionId;
  const retrySignal = retryInput.signal;
  const retryQueueId = retryMode === "SMS" ? retryInput.queueId : null;
  const retrying = props.partialResults?.isRetrying === true;
  const priorRetry = useRef<{
    readonly ownerId: string;
    readonly sessionId: string;
    readonly queueId: string;
    readonly retrying: boolean;
  } | null>(null);
  useEffect(() => {
    if (
      retryMode !== "SMS" ||
      !retryOwnerId ||
      !retryQueueId ||
      retrySignal?.aborted
    ) {
      priorRetry.current = null;
      return;
    }
    const previous = priorRetry.current;
    const sameQueue =
      previous !== null &&
      previous.ownerId === retryOwnerId &&
      previous.sessionId === retrySessionId &&
      previous.queueId === retryQueueId;
    priorRetry.current = {
      ownerId: retryOwnerId,
      sessionId: retrySessionId,
      queueId: retryQueueId,
      retrying,
    };
    if (sameQueue && previous.retrying && !retrying) view.reload();
  }, [
    retryMode,
    retryOwnerId,
    retrySessionId,
    retrySignal,
    retryQueueId,
    retrying,
    view.reload,
  ]);

  const scope = session
    ? {
        ownerId: session.ownerId,
        sessionId: session.sessionId,
        expectedReviewRevision: session.revision,
        expectedOperationGeneration: session.operationGeneration,
      }
    : null;
  const rows = new Map(session?.rows.map((row) => [row.rowId, row]) ?? []);
  const groups = new Map(
    session?.groups.map((group) => [group.groupId, group]) ?? []
  );
  const editingRow =
    transactionEdit &&
    session &&
    session.ownerId === transactionEdit.ownerId &&
    session.sessionId === transactionEdit.sessionId &&
    session.revision === transactionEdit.reviewRevision &&
    session.operationGeneration === transactionEdit.operationGeneration &&
    props.boundary.input.ownerId === transactionEdit.ownerId &&
    props.boundary.input.sessionId === transactionEdit.sessionId &&
    !props.boundary.input.signal?.aborted
      ? (session.rows.find(
          (row) =>
            row.rowId === transactionEdit.rowId &&
            row.revision === transactionEdit.rowRevision
        ) ?? null)
      : null;
  useEffect(() => {
    if (transactionEdit !== null && editingRow === null)
      setTransactionEdit(null);
  }, [transactionEdit, editingRow]);
  const activeChoice = freshAccountReviewChoice(
    choice,
    session,
    props.boundary.input
  );
  const currentRow =
    activeChoice && activeChoice.kind === "row"
      ? (rows.get(activeChoice.rowId) ?? null)
      : null;
  const currentGroup =
    activeChoice &&
    (activeChoice.kind === "replace" || activeChoice.kind === "edit")
      ? (groups.get(activeChoice.groupId) ?? null)
      : null;

  /** The owner-scoped facade remains the sole command mutation authority. */
  const dispatchCommand = (
    command: unknown,
    surface: "page" | "modal" = "page"
  ): Promise<boolean> => {
    if (!session || !model || busy || props.boundary.input.signal?.aborted)
      return Promise.resolve(false);
    return dispatchReviewChoiceCommand({
      command,
      surface,
      signal: props.boundary.input.signal,
      feedback,
      dispatch: view.dispatch,
    });
  };
  const send = (command: unknown): void => {
    void dispatchCommand(command);
  };
  const submitModalCommand = (command: unknown): void => {
    const stamp = activeChoice;
    void dispatchCommand(command, "modal").then((accepted) => {
      if (!accepted || props.boundary.input.signal?.aborted) return;
      feedback.dismiss("modal");
      setChoice((current) => (current === stamp ? null : current));
    });
  };
  const sendGroup = (
    groupId: string,
    kind: "confirm_group" | "remove_group"
  ): void => {
    const group = groups.get(groupId);
    if (!scope || !group) return;
    send({ ...scope, kind, groupId, expectedGroupRevision: group.revision });
  };
  const toggleRow = (rowId: string): void => {
    const row = rows.get(rowId);
    if (!row || !scope) return;
    if (row.selected) {
      send({
        ...scope,
        kind: "set_row_selected",
        rowId,
        expectedRowRevision: row.revision,
        selected: false,
      });
      return;
    }
    const group =
      row.assignment.state === "suggested"
        ? (groups.get(row.assignment.groupId) ?? null)
        : null;
    // A shared confirmation is disclosed in the row and applies to every
    // dependent account assignment; only the clicked row is selected.
    send({
      ...scope,
      kind: "select_row",
      rowId,
      expectedRowRevision: row.revision,
      groupId: group?.groupId ?? null,
      expectedGroupRevision: group?.revision ?? null,
      hasSharedConfirmationDisclosure: group !== null,
    });
  };
  const openTransactionEdit = (rowId: string): void => {
    const row = rows.get(rowId);
    if (!row || !session || busy || props.boundary.input.signal?.aborted)
      return;
    feedback.dismiss("modal");
    setChoice(null);
    setTransactionEdit({
      ownerId: session.ownerId,
      sessionId: session.sessionId,
      rowId,
      reviewRevision: session.revision,
      operationGeneration: session.operationGeneration,
      rowRevision: row.revision,
    });
  };
  const submitTransactionEdit = async (
    patch: ReviewTransactionEditPatch
  ): Promise<boolean> => {
    if (
      !session ||
      !editingRow ||
      !transactionEdit ||
      busy ||
      props.boundary.input.signal?.aborted
    )
      return false;
    // Keep the active controlled editor mounted when ownership, CAS or
    // category admission rejects its row-only patch.
    return dispatchCommand(
      {
        kind: "edit_row_transaction",
        ownerId: transactionEdit.ownerId,
        sessionId: transactionEdit.sessionId,
        expectedReviewRevision: transactionEdit.reviewRevision,
        expectedOperationGeneration: transactionEdit.operationGeneration,
        rowId: transactionEdit.rowId,
        expectedRowRevision: transactionEdit.rowRevision,
        patch,
      },
      "modal"
    );
  };
  const openRowChoice = (
    rowId: string,
    role: "source" | "destination" = "source"
  ): void => {
    const row = rows.get(rowId);
    if (!row || !session || busy) return;
    feedback.dismiss("modal");
    const endpoint = role === "source" ? row.assignment : row.toAssignment;
    if (endpoint?.state === "suggested") {
      const existingDraft = groups.get(endpoint.groupId);
      if (existingDraft && existingDraft.status !== "removed") {
        setChoice({
          ...reviewChoiceStamp(session, existingDraft.revision),
          kind: "edit",
          groupId: existingDraft.groupId,
        });
        return;
      }
    }
    const candidates = getExplicitAccountCurrencyOptions({
      session,
      rowId,
      role,
      ownedAccounts: view.choiceAccounts,
    });
    // Never select the first candidate automatically.
    setCandidateId(preselectedOwnedAccountId(row, role, candidates));
    setChoice({
      ...reviewChoiceStamp(session, row.revision),
      kind: "row",
      rowId,
      role,
    });
  };
  const eligibleCandidates =
    activeChoice?.kind === "row" && currentRow && session
      ? getExplicitAccountCurrencyOptions({
          session,
          rowId: currentRow.rowId,
          role: activeChoice.role,
          ownedAccounts: view.choiceAccounts,
        })
      : activeChoice?.kind === "replace" && currentGroup && session
        ? intersectGuardedGroupAccountChoices(
            currentGroup.linkedRowIds,
            currentGroup.type,
            view.getAccountCandidates,
            reviewGroupChoiceRole(session.source, currentGroup)
          )
        : [];
  const canCreateDraft =
    activeChoice?.kind === "row" &&
    currentRow !== null &&
    (activeChoice.role === "source"
      ? currentRow.assignment.state === "unresolved"
      : currentRow.toAssignment?.state === "unresolved") &&
    view.getAccountCandidates(currentRow.rowId, activeChoice.role).length === 0;

  const useAccount = (): void => {
    if (!scope || !candidateId) return;
    const candidate = eligibleCandidates.find((a) => a.id === candidateId);
    if (!candidate) return;
    if (activeChoice?.kind === "row" && currentRow) {
      submitModalCommand(
        makeExplicitRowAccountCurrencyCommand({
          scope,
          row: currentRow,
          role: activeChoice.role,
          account: candidate,
        })
      );
    } else if (activeChoice?.kind === "replace" && currentGroup) {
      submitModalCommand({
        ...scope,
        kind: "replace_group_account",
        groupId: currentGroup.groupId,
        expectedGroupRevision: currentGroup.revision,
        accountId: candidate.id,
        disclosedLinkedRowCount: currentGroup.linkedRowIds.length,
      });
    }
  };

  const submitManualDraft = async (
    value: Extract<
      AccountReviewCommand,
      { kind: "create_row_account_draft" }
    >["identity"] & {
      readonly currency: NonNullable<
        Extract<
          AccountReviewCommand,
          { kind: "create_row_account_draft" }
        >["currency"]
      >;
    }
  ): Promise<void> => {
    if (
      !scope ||
      !session ||
      !currentRow ||
      !canCreateDraft ||
      activeChoice?.kind !== "row" ||
      busy ||
      draftInFlight.current
    )
      return;
    draftInFlight.current = true;
    setPreparingDraft(true);
    const epoch = draftEpoch.current;
    const stamp = activeChoice;
    try {
      const outcome = await submitPreparedManualReviewDraft({
        session,
        row: currentRow,
        role: activeChoice.role,
        scope,
        value,
        signal: props.boundary.input.signal,
        current: () => draftEpoch.current === epoch,
        dispatch: view.dispatch,
      });
      if (outcome.status === "rejected") {
        if (draftEpoch.current === epoch)
          feedback.reportFailure({
            stage: "command",
            surface: "modal",
            reasonCodes: outcome.reasonCodes,
          });
      } else if (
        outcome.status === "accepted" &&
        draftEpoch.current === epoch
      ) {
        feedback.dismiss("modal");
        setChoice((current) => (current === stamp ? null : current));
      }
    } catch (error) {
      if (!props.boundary.input.signal?.aborted && draftEpoch.current === epoch)
        feedback.reportFailure({ stage: "command", surface: "modal", error });
    } finally {
      draftInFlight.current = false;
      setPreparingDraft(false);
    }
  };
  const categoryShortcut = useReviewCategoryShortcut({
    session,
    boundary: props.boundary.input,
    busy,
    send: (command) => dispatchCommand(command, "modal"),
  });
  const openCategoryShortcut = (rowId: string): void => {
    if (busy) return;
    feedback.dismiss("modal");
    categoryShortcut.open(rowId);
  };
  const accountNeededFilter = useTemporaryAccountNeededFilter(session);

  const recoverIssue = (key: ReviewIssueKey): void => {
    if (busy) return;
    if (
      key === "account_review_issue_account" ||
      key === "account_review_issue_currency"
    ) {
      setChoice(null);
      accountNeededFilter.showAccountNeeded();
      return;
    }
    const target = presentIssueRecoveryTarget(session?.rows ?? [], key);
    if (!target) return;
    if (key === "account_review_issue_category")
      openCategoryShortcut(target.rowId);
    else openTransactionEdit(target.rowId);
  };
  const useEdit = (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }): void => {
    if (!scope || activeChoice?.kind !== "edit" || !currentGroup) return;
    const kind = accountType.safeParse(value.typeOptionId);
    if (!kind.success) return;
    submitModalCommand({
      ...scope,
      kind: "edit_group",
      groupId: currentGroup.groupId,
      expectedGroupRevision: currentGroup.revision,
      identity: {
        name: value.name,
        type: kind.data,
        institutionId: currentGroup.institutionId,
        providerDisplayName: currentGroup.providerDisplayName,
        cardLast4: currentGroup.cardLast4,
        senderNames: currentGroup.senderNames,
      },
      reconfirm: true,
    });
  };
  const presentGroup = (
    group: AccountReviewSession["groups"][number]
  ): ReturnType<typeof presentReviewGroup> =>
    presentReviewGroup(
      group,
      model?.groupSummaries.find((item) => item.groupId === group.groupId)
        ?.liveLinkedRowIds.length ?? 0,
      busy,
      view.undoToken !== null && view.undoGroupId === group.groupId,
      language
    );

  if (!session || !model || scope === null) {
    return (
      <View
        testID="account-review-canonical-loading"
        className="flex-1 bg-background dark:bg-background-dark"
      >
        {props.title ? (
          <PageHeader
            title={props.title}
            subtitle={props.subtitle}
            variant="review"
            showDrawer={false}
            showBackButton={Boolean(props.onBack)}
            onBack={props.onBack}
          />
        ) : null}
        <View className="p-5">
          {view.error ? (
            <Text className="text-text-secondary dark:text-text-secondary-dark">
              {tTransactions("sms_review_load_failed")}
            </Text>
          ) : (
            <Skeleton width="100%" height={96} borderRadius={12} />
          )}
        </View>
      </View>
    );
  }

  const visibleRows = accountNeededFilter.active
    ? accountNeededFilter.rows
    : model.visibleRowIds.flatMap((id) => {
        const row = rows.get(id);
        return row ? [row] : [];
      });
  const defaultAccountName = presentReviewDefaultAccountName(
    session.rows,
    view.choiceAccounts
  );
  const issues = presentReviewIssues(
    session.rows,
    model.summary.distinctNeedsReviewCount,
    language
  );
  const summary = {
    ...model.summary,
    issueLabels: issues.map((issue) => issue.label),
    issues,
  };
  const renderRow = ({
    item: row,
    index,
  }: {
    readonly item: AccountReviewRow;
    readonly index: number;
  }): React.JSX.Element => {
    const linked =
      row.assignment.state === "suggested"
        ? (groups.get(row.assignment.groupId) ?? null)
        : null;
    const details = presentCanonicalRowDetails(
      row,
      linked,
      view.choiceAccounts,
      language,
      row.toAssignment?.state === "suggested"
        ? (groups.get(row.toAssignment.groupId) ?? null)
        : null
    );
    const content = getExpandedContent(row.transaction);
    const originalSmsIndex =
      row.source === "SMS"
        ? props.transactions.findIndex(
            (transaction) =>
              "smsFingerprint" in transaction &&
              transaction.smsFingerprint === row.sourceFingerprint
          )
        : -1;
    return (
      <View>
        <TransactionItem
          transaction={row.transaction}
          index={index}
          isLastCanonicalRow={index === visibleRows.length - 1}
          isSelected={row.selected}
          accountName={details.accountName}
          expandedContentTitle={content?.title}
          expandedContentBody={content?.body}
          onToggleSelect={() => toggleRow(row.rowId)}
          onPress={() => openTransactionEdit(row.rowId)}
          hasMissingInfo={
            row.reviewReasons.length > 0 ||
            row.currency.state === "unconfirmed" ||
            row.assignment.state === "unresolved"
          }
          isSmsWorkspace={props.workspaceVariant === "sms"}
          onDiscard={
            row.source === "SMS" &&
            props.workspaceVariant === "sms" &&
            props.onDiscardItem &&
            originalSmsIndex >= 0
              ? (_visibleIndex, wasSelected) => {
                  // The list index changes with filters. Keep SMS draft removal
                  // pinned to the original source fingerprint and selection.
                  if (!busy)
                    void props.onDiscardItem?.(originalSmsIndex, wasSelected);
                }
              : undefined
          }
          accountReview={{
            rowId: row.rowId,
            accountActionLabel: details.accountActionLabel,
            accountStatusLabel: details.accountStatusLabel,
            accountType: details.accountType,
            // Shared selection effect is disclosed under its group, never every row.
            sharedSelectionDisclosure: null,
            currencyActionLabel: details.currencyActionLabel,
            currencyContextLabel: details.currencyContextLabel,
            accountStatusTone: details.accountStatusTone,
            isBusy: busy,
            onChooseAccount: openRowChoice,
            onChooseCurrency: (rowId) => openRowChoice(rowId),
            canEditCategory: !(
              row.source === "SMS" && row.transaction.isAtmWithdrawal === true
            ),
            onEditCategory: openCategoryShortcut,
          }}
        />
        {details.isSmsAtm ? (
          <AtmDestinationStatus
            label={tTransactions("to_account")}
            destinationName={details.destinationName}
            missingLabel={tTransactions("please_select_destination_account")}
            disabled={busy}
            onChoose={() => openRowChoice(row.rowId, "destination")}
          />
        ) : null}
      </View>
    );
  };

  return (
    <View
      testID="transaction-review-screen"
      className="flex-1 bg-background dark:bg-background-dark"
    >
      {props.title ? (
        <PageHeader
          title={props.title}
          subtitle={props.subtitle}
          variant="review"
          showDrawer={false}
          showBackButton={Boolean(props.onBack)}
          onBack={props.onBack}
          backAccessibilityLabel={tCommon("back")}
        />
      ) : null}
      {props.boundary.input.mode === "SMS" ? (
        <ReviewInlineNotice
          notice={feedback.pageNotice}
          surface="page"
          onDismiss={() => feedback.dismiss("page")}
        />
      ) : null}
      <FlatList
        data={visibleRows}
        keyExtractor={(row) => row.rowId}
        renderItem={renderRow}
        extraData={session}
        ListHeaderComponent={
          <View>
            {props.partialResults && (
              <PartialSmsResultsNotice
                safeguardSummary={props.partialResults.safeguardSummary}
                retryableCount={props.partialResults.retryableCount}
                canRetry={props.partialResults.canRetry}
                isRetrying={props.partialResults.isRetrying}
                hasRetryError={props.partialResults.hasRetryError}
                onRetry={props.partialResults.onRetry}
              />
            )}
            <SafeguardQaDiagnosticsPanel
              diagnostics={props.qaDiagnostics ?? null}
            />
            {accountNeededFilter.active ? (
              <AccountNeededTemporaryHeader
                count={visibleRows.length}
                disabled={busy}
                onShowAll={() => {
                  accountNeededFilter.showAll();
                  if (session.filter !== "all")
                    send({ ...scope, kind: "set_filter", filter: "all" });
                }}
              />
            ) : (
              <AccountReviewPanel
                filter={session.filter}
                visibleRowIds={model.visibleRowIds}
                readyVisibleRowIds={model.readyVisibleRowIds}
                selectedVisibleCount={
                  visibleRows.filter((row) => row.selected).length
                }
                groups={session.groups.map(presentGroup)}
                summary={summary}
                isAllGroupsSheetOpen={showAllGroups}
                isBusy={busy}
                defaultAccountName={defaultAccountName}
                isWhySheetOpen={showDefaultWhy}
                onFilterChange={(filter) =>
                  send({ ...scope, kind: "set_filter", filter })
                }
                onSelectReady={() =>
                  send({
                    ...scope,
                    kind: "select_ready",
                    filter: session.filter,
                  })
                }
                onClearSelection={() =>
                  send({
                    ...scope,
                    kind: "clear_selection",
                    filter: session.filter,
                  })
                }
                onDefaultWhyPress={() => setShowDefaultWhy(true)}
                onCloseWhy={() => setShowDefaultWhy(false)}
                onConfirm={(groupId) => sendGroup(groupId, "confirm_group")}
                onEdit={(groupId) => {
                  const group = groups.get(groupId);
                  if (!session || !group) return;
                  setChoice({
                    ...reviewChoiceStamp(session, group.revision),
                    kind: "edit",
                    groupId,
                  });
                }}
                onReplace={(groupId) => {
                  const group = groups.get(groupId);
                  if (!session || !group) return;
                  setCandidateId(null);
                  setChoice({
                    ...reviewChoiceStamp(session, group.revision),
                    kind: "replace",
                    groupId,
                  });
                }}
                onRemove={(groupId) => sendGroup(groupId, "remove_group")}
                onUndo={(groupId) => {
                  if (busy || !view.undoToken || view.undoGroupId !== groupId)
                    return;
                  void view.undoRemoval().catch((error) => {
                    if (!props.boundary.input.signal?.aborted)
                      feedback.reportFailure({
                        stage: "undo",
                        surface: "page",
                        error,
                      });
                  });
                }}
                onViewAll={() => setShowAllGroups(true)}
                onCloseAllGroups={() => setShowAllGroups(false)}
                onIssuePress={recoverIssue}
              />
            )}
          </View>
        }
        contentContainerClassName="pb-2"
        showsVerticalScrollIndicator={false}
        {...ANDROID_SAFE_LIST_PROPS}
        initialNumToRender={props.renderConfig.initialNumToRender}
        maxToRenderPerBatch={props.renderConfig.maxToRenderPerBatch}
        updateCellsBatchingPeriod={props.renderConfig.updateCellsBatchingPeriod}
        windowSize={props.renderConfig.windowSize}
      />
      <ReviewActionBar
        selectedCount={model.summary.selectedCount}
        isSaving={busy}
        isReviewMetadataReady
        onSave={async () => {
          if (busy) return;
          setBusySave(true);
          try {
            await props.boundary.onSaveSelected(session);
          } finally {
            setBusySave(false);
          }
        }}
        onDiscard={props.onDiscard}
        hideDiscard={accountNeededFilter.active}
        onUnhandledSaveError={(error) =>
          feedback.reportFailure({
            stage: "footer_unhandled",
            surface: "page",
            error,
          })
        }
        isSmsWorkspace={props.workspaceVariant === "sms"}
        onReviewLater={props.onReviewLater}
      />
      {renderAccountReviewChoiceSheets({
        activeChoice,
        currentRow,
        currentGroup,
        source: session.source,
        candidates: eligibleCandidates,
        selectedCandidateId: candidateId,
        canCreateDraft,
        busy,
        reviewFeedback: feedback,
        language,
        tTransactions,
        tAccounts,
        onCandidate: setCandidateId,
        onUseAccount: useAccount,
        onCreateDraft: (identity) => {
          void submitManualDraft(identity);
        },
        onEditExistingDraft: () => {
          if (!currentGroup) return;
          setChoice({
            ...reviewChoiceStamp(session, currentGroup.revision),
            kind: "edit",
            groupId: currentGroup.groupId,
          });
        },
        onClose: () => {
          draftEpoch.current += 1;
          feedback.dismiss("modal");
          setChoice(null);
        },
        onEditGroup: useEdit,
        onReplaceEditingGroup: () => {
          if (!currentGroup) return;
          setCandidateId(null);
          setChoice({
            ...reviewChoiceStamp(session, currentGroup.revision),
            kind: "replace",
            groupId: currentGroup.groupId,
          });
        },
      })}
      <AccountReviewCategoryChoice
        row={categoryShortcut.currentRow}
        ownerId={session.ownerId}
        signal={props.boundary.input.signal}
        reviewFeedback={feedback}
        onSelect={async (categoryId) => {
          const accepted = await categoryShortcut.choose(categoryId);
          if (accepted) feedback.dismiss("modal");
          return accepted;
        }}
        onClose={() => {
          feedback.dismiss("modal");
          categoryShortcut.close();
        }}
      />
      {editingRow && transactionEdit && (
        <TransactionEditModal
          key={[
            transactionEdit.ownerId,
            transactionEdit.sessionId,
            transactionEdit.rowId,
            transactionEdit.rowRevision,
          ].join(":")}
          controlledReview
          visible
          row={editingRow}
          ownerId={transactionEdit.ownerId}
          signal={props.boundary.input.signal}
          isBusy={busy}
          onSubmit={submitTransactionEdit}
          reviewFeedback={feedback}
          onClose={() => {
            feedback.dismiss("modal");
            setTransactionEdit((active) =>
              active &&
              active.ownerId === transactionEdit.ownerId &&
              active.sessionId === transactionEdit.sessionId &&
              active.rowId === transactionEdit.rowId &&
              active.reviewRevision === transactionEdit.reviewRevision &&
              active.operationGeneration ===
                transactionEdit.operationGeneration &&
              active.rowRevision === transactionEdit.rowRevision
                ? null
                : active
            );
          }}
        />
      )}
    </View>
  );
}
