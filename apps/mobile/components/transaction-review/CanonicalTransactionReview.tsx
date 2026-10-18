import {
  accountReviewCommandSchema,
  type AccountReviewSession,
  type AccountReviewRow,
  type AccountReviewCommand,
} from "@monyvi/logic";
import {
  ACCOUNT_REVIEW_ACCOUNT_TYPES,
  ACCOUNT_REVIEW_CURRENCIES,
} from "../../../../packages/logic/src/account-review/generated-vocabulary";
import {
  accountType,
  currencyCode,
} from "../../../../packages/logic/src/account-review/schema-primitives";
import { useAccountReview } from "@/hooks/useAccountReview";
import { useToast } from "@/components/ui/Toast";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { AccountReviewPanel } from "./AccountReviewPanel";
import { AccountChoiceSheet } from "./AccountChoiceSheet";
import { CurrencyConfirmationSheet } from "./CurrencyConfirmationSheet";
import { EditSuggestedAccountSheet } from "./EditSuggestedAccountSheet";
import {
  type ReviewIssueKey,
  type ReviewChoiceStamp,
  presentReviewAccountChoices,
  presentReviewCurrencyOptions,
  presentReviewDefaultAccountName,
  presentReviewIssues,
  intersectGuardedGroupAccountChoices,
  presentIssueRecoveryTarget,
  reviewChoiceStamp,
  isReviewChoiceFresh,
  presentReviewTransactionContext,
  presentCanonicalRowDetails,
  presentReviewReplaceScope,
  presentReviewCurrencyLabel,
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

type ReviewChoice =
  | ((
      | {
          readonly kind: "row";
          readonly rowId: string;
          readonly role: "source" | "destination";
        }
      | { readonly kind: "replace"; readonly groupId: string }
      | {
          readonly kind: "currency" | "picker";
          readonly rowId: string;
          readonly context: string;
        }
      | { readonly kind: "edit"; readonly groupId: string }
    ) &
      ReviewChoiceStamp)
  | null;

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
  const { showToast } = useToast();
  const [choice, setChoice] = useState<ReviewChoice>(null);
  const [transactionEdit, setTransactionEdit] =
    useState<ReviewTransactionEditTarget | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [currencySelection, setCurrencySelection] = useState<string | null>(
    null
  );
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showDefaultWhy, setShowDefaultWhy] = useState(false);
  const [busySave, setBusySave] = useState(false);

  const session = view.session;
  const model = view.readModel;
  const busy = view.isBusy || props.isSaving || busySave;
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
  const choiceRevision = choice
    ? choice.kind === "row" ||
      choice.kind === "currency" ||
      choice.kind === "picker"
      ? (rows.get(choice.rowId)?.revision ?? null)
      : choice.kind === "replace" || choice.kind === "edit"
        ? (groups.get(choice.groupId)?.revision ?? null)
        : null
    : null;
  const activeChoice =
    choice &&
    session &&
    props.boundary.input.ownerId === session.ownerId &&
    props.boundary.input.sessionId === session.sessionId &&
    !props.boundary.input.signal?.aborted &&
    isReviewChoiceFresh(choice, session, choiceRevision)
      ? choice
      : null;
  const currentRow =
    activeChoice &&
    (activeChoice.kind === "row" ||
      activeChoice.kind === "currency" ||
      activeChoice.kind === "picker")
      ? (rows.get(activeChoice.rowId) ?? null)
      : null;
  const currentGroup =
    activeChoice &&
    (activeChoice.kind === "replace" || activeChoice.kind === "edit")
      ? (groups.get(activeChoice.groupId) ?? null)
      : null;

  // Never expose internal reason codes or exception messages in the UI.
  const showCommandFailure = (type: "warning" | "error"): void => {
    if (props.boundary.input.signal?.aborted) return;
    showToast({
      type,
      title: tTransactions("update_error"),
      message: tTransactions("voice_error_default"),
    });
  };
  /** Every command is schema-checked; the reducer and service decide policy. */
  const send = (command: unknown): void => {
    if (!session || !model || busy) return;
    try {
      const validated = accountReviewCommandSchema.parse(command);
      void view
        .dispatch(validated)
        .then((result) => {
          if (result.reasonCodes.length > 0) showCommandFailure("warning");
        })
        .catch(() => showCommandFailure("error"));
    } catch {
      showCommandFailure("error");
    }
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
    try {
      // The facade command, reducer and owned SMS writer (or Voice memory
      // bridge) remain the SOLE mutation authority, not the old modal hook.
      const command = accountReviewCommandSchema.parse({
        kind: "edit_row_transaction",
        ownerId: transactionEdit.ownerId,
        sessionId: transactionEdit.sessionId,
        expectedReviewRevision: transactionEdit.reviewRevision,
        expectedOperationGeneration: transactionEdit.operationGeneration,
        rowId: transactionEdit.rowId,
        expectedRowRevision: transactionEdit.rowRevision,
        patch,
      });
      const result = await view.dispatch(command);
      if (result.reasonCodes.length > 0) {
        showCommandFailure("warning");
        return false;
      }
      return true;
    } catch {
      showCommandFailure("error");
      return false;
    }
  };
  const openRowChoice = (
    rowId: string,
    role: "source" | "destination" = "source"
  ): void => {
    const row = rows.get(rowId);
    if (!row || !session || busy) return;
    if (row.currency.state === "unconfirmed") {
      openCurrency(rowId);
      return;
    }
    setCandidateId(null);
    setChoice({
      ...reviewChoiceStamp(session, row.revision),
      kind: "row",
      rowId,
      role,
    });
  };
  const openCurrency = (rowId: string): void => {
    const row = rows.get(rowId);
    if (!row || !session || busy) return;
    // Neither a candidate nor the display currency is a confirmed choice.
    setCurrencySelection(null);
    setChoice({
      ...reviewChoiceStamp(session, row.revision),
      kind:
        row.currency.state === "unconfirmed" &&
        row.currency.candidateCodes.length === 0
          ? "picker"
          : "currency",
      rowId,
      context: presentReviewTransactionContext(row.transaction, language),
    });
  };
  const eligibleCandidates =
    activeChoice?.kind === "row" && currentRow
      ? view.getAccountCandidates(currentRow.rowId, activeChoice.role)
      : activeChoice?.kind === "replace" && currentGroup
        ? intersectGuardedGroupAccountChoices(
            currentGroup.linkedRowIds,
            currentGroup.type,
            view.getAccountCandidates
          )
        : [];
  const useAccount = (): void => {
    if (
      !scope ||
      !candidateId ||
      !eligibleCandidates.some((candidate) => candidate.id === candidateId)
    )
      return;
    if (activeChoice?.kind === "row" && currentRow) {
      send({
        ...scope,
        kind: "choose_row_account",
        rowId: currentRow.rowId,
        expectedRowRevision: currentRow.revision,
        accountId: candidateId,
      });
    } else if (activeChoice?.kind === "replace" && currentGroup) {
      send({
        ...scope,
        kind: "replace_group_account",
        groupId: currentGroup.groupId,
        expectedGroupRevision: currentGroup.revision,
        accountId: candidateId,
        disclosedLinkedRowCount: currentGroup.linkedRowIds.length,
      });
    }
    setChoice(null);
  };
  const confirmCurrency = (currency: string | null): void => {
    if (
      !scope ||
      (activeChoice?.kind !== "currency" && activeChoice?.kind !== "picker") ||
      !currentRow
    )
      return;
    const checked = currencyCode.safeParse(currency);
    if (!checked.success) return;
    send({
      ...scope,
      kind: "confirm_row_currency",
      rowId: currentRow.rowId,
      expectedRowRevision: currentRow.revision,
      currency: checked.data,
    });
    setChoice(null);
  };
  const useCurrency = (): void => confirmCurrency(currencySelection);
  const recoverIssue = (key: ReviewIssueKey): void => {
    if (busy) return;
    const target = presentIssueRecoveryTarget(session?.rows ?? [], key);
    if (!target) return;
    if (key === "account_review_issue_currency") openCurrency(target.rowId);
    else if (key === "account_review_issue_account")
      openRowChoice(
        target.rowId,
        target.assignment.state !== "unresolved" &&
          target.source === "SMS" &&
          target.transaction.isAtmWithdrawal === true &&
          target.toAssignment?.state !== "existing"
          ? "destination"
          : "source"
      );
    else openTransactionEdit(target.rowId);
  };
  const useEdit = (value: {
    readonly name: string;
    readonly typeOptionId: string;
  }): void => {
    if (!scope || activeChoice?.kind !== "edit" || !currentGroup) return;
    const kind = accountType.safeParse(value.typeOptionId);
    if (!kind.success) return;
    send({
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
    setChoice(null);
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

  const visibleRows = model.visibleRowIds.flatMap((id) => {
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
  const choiceAccountOptions = presentReviewAccountChoices(
    eligibleCandidates,
    language
  );
  const checkedCurrency = currencyCode.safeParse(currencySelection);
  const currencyOptions = presentReviewCurrencyOptions(
    currentRow?.currency,
    checkedCurrency.success ? checkedCurrency.data : null
  );
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
      language
    );
    const content = getExpandedContent(row.transaction);
    return (
      <View>
        <TransactionItem
          transaction={row.transaction}
          index={index}
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
            onChooseCurrency: openCurrency,
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
                void view.undoRemoval().catch(() => {
                  if (props.boundary.input.signal?.aborted) return;
                  showToast({
                    type: "error",
                    title: tTransactions("sms_review_undo_failed"),
                    message: tTransactions("sms_review_undo_failed_message"),
                  });
                });
              }}
              onViewAll={() => setShowAllGroups(true)}
              onCloseAllGroups={() => setShowAllGroups(false)}
              onIssuePress={recoverIssue}
            />
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
        hideDiscard={props.workspaceVariant === "sms"}
        isSmsWorkspace={props.workspaceVariant === "sms"}
        onReviewLater={props.onReviewLater}
      />
      <AccountChoiceSheet
        visible={
          activeChoice?.kind === "row" || activeChoice?.kind === "replace"
        }
        title={
          activeChoice?.kind === "row" &&
          currentRow?.source === "SMS" &&
          currentRow.transaction.isAtmWithdrawal === true
            ? tTransactions(
                activeChoice.role === "destination"
                  ? "to_account"
                  : "from_account"
              )
            : tTransactions("account_review_issue_account")
        }
        contextSubtitle={
          currentGroup?.name ??
          (currentRow
            ? presentReviewTransactionContext(currentRow.transaction, language)
            : undefined)
        }
        scopeDisclosure={
          activeChoice?.kind === "replace" && currentGroup
            ? presentReviewReplaceScope(
                currentGroup.name,
                currentGroup.linkedRowIds.length,
                language
              )
            : ""
        }
        candidateOptions={choiceAccountOptions}
        selectedCandidateId={candidateId}
        canUseSelection={
          candidateId !== null &&
          eligibleCandidates.some((a) => a.id === candidateId)
        }
        isBusy={busy}
        onSelectCandidate={setCandidateId}
        onUseSelected={useAccount}
        onClose={() => setChoice(null)}
      />
      <CurrencyConfirmationSheet
        visible={activeChoice?.kind === "currency"}
        contextSubtitle={
          activeChoice?.kind === "currency" ? activeChoice.context : ""
        }
        candidateOptions={currencyOptions.map((code) => ({
          code,
          label: presentReviewCurrencyLabel(code, language),
          accessibilityLabel:
            presentReviewCurrencyLabel(code, language) + ", " + code,
        }))}
        selectedCandidateCode={currencySelection}
        canUseSelection={currencyCode.safeParse(currencySelection).success}
        isBusy={busy}
        onSelectCandidate={setCurrencySelection}
        onUseSelected={useCurrency}
        onChooseAnother={() => {
          if (activeChoice?.kind === "currency")
            setChoice({ ...activeChoice, kind: "picker" });
        }}
        onClose={() => setChoice(null)}
      />
      <CurrencyPicker
        visible={activeChoice?.kind === "picker"}
        selectedCurrency={
          currencyCode.safeParse(currencySelection).success
            ? currencyCode.parse(currencySelection)
            : null
        }
        allowedCurrencies={ACCOUNT_REVIEW_CURRENCIES}
        contextSubtitle={
          activeChoice?.kind === "picker" ? activeChoice.context : undefined
        }
        onSelect={confirmCurrency}
        onClose={() => setChoice(null)}
      />
      {editingRow && transactionEdit && (
        <TransactionEditModal
          key={
            transactionEdit.ownerId +
            ":" +
            transactionEdit.sessionId +
            ":" +
            transactionEdit.rowId +
            ":" +
            transactionEdit.rowRevision
          }
          controlledReview
          visible
          row={editingRow}
          ownerId={transactionEdit.ownerId}
          signal={props.boundary.input.signal}
          isBusy={busy}
          onSubmit={submitTransactionEdit}
          onClose={() =>
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
            )
          }
        />
      )}
      <EditSuggestedAccountSheet
        visible={activeChoice?.kind === "edit" && currentGroup !== null}
        groupId={currentGroup?.groupId ?? ""}
        groupName={currentGroup?.name ?? ""}
        currentTypeOptionId={currentGroup?.type ?? ""}
        allowedTypeOptions={ACCOUNT_REVIEW_ACCOUNT_TYPES.map((type) => ({
          id: type,
          label: tAccounts("type_" + type.toLowerCase()),
        }))}
        lockedCurrencyLabel={currentGroup?.currency ?? ""}
        identitySummary={
          currentGroup?.providerDisplayName ?? currentGroup?.institutionId ?? ""
        }
        linkedCount={currentGroup?.linkedRowIds.length ?? 0}
        canSubmit={!busy && currentGroup?.status !== "removed"}
        isBusy={busy}
        validationMessage={null}
        onSubmit={useEdit}
        onReplace={() => {
          if (!currentGroup) return;
          setCandidateId(null);
          if (session)
            setChoice({
              ...reviewChoiceStamp(session, currentGroup.revision),
              kind: "replace",
              groupId: currentGroup.groupId,
            });
        }}
        onCancel={() => setChoice(null)}
      />
    </View>
  );
}
